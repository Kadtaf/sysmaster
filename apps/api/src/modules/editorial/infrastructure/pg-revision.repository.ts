import { Inject, Injectable } from '@nestjs/common';
import type { ContentKind, ContentPublishedV1, EditorialRevisionReviewedV1, RevisionStatus, RevisionSummaryDto } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import {
  CONTENT_KIND_ADAPTERS, ContentKindAdapter, OpenRevisionExistsError, RevisionAction, RevisionRecord, RevisionRepository,
} from '../application/ports';

/** Colonne de la cible pour chaque type (une vraie clé étrangère par type, voir migration 006). */
const TARGET_COLUMN: Record<ContentKind, string> = {
  command: 'command_id',
  course: 'course_id',
  path: 'path_id',
  diagnostic_cause: 'cause_code',
  agent_profile: 'agent_code',
  quiz: 'quiz_id',
  lab: 'lab_id',
};

export const isUniqueViolation = (err: unknown, constraint?: string) =>
  (err as { code?: string }).code === '23505' && (!constraint || (err as { constraint?: string }).constraint === constraint);

@Injectable()
export class PgRevisionRepository extends RevisionRepository {
  private readonly adapters: Map<ContentKind, ContentKindAdapter>;

  constructor(
    private readonly db: Database,
    @Inject(CONTENT_KIND_ADAPTERS) adapters: ContentKindAdapter[],
  ) {
    super();
    this.adapters = new Map(adapters.map((a) => [a.kind, a]));
  }

  async list(filter: { status?: RevisionStatus; kind?: ContentKind; authorId?: string }): Promise<RevisionSummaryDto[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT r.id, r.kind, r.content, r.is_new, r.status::text AS status, u.display_name AS author, r.updated_at
         FROM editorial.revisions r JOIN iam.users u ON u.id = r.author_id
        WHERE ($1::text IS NULL OR r.status::text = $1) AND ($2::text IS NULL OR r.kind = $2) AND ($3::uuid IS NULL OR r.author_id = $3)
        ORDER BY CASE r.status WHEN 'in_review' THEN 0 WHEN 'changes_requested' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, r.updated_at DESC
        LIMIT 200`,
      [filter.status ?? null, filter.kind ?? null, filter.authorId ?? null],
    );
    return rows.map((r) => {
      const adapter = this.adapters.get(r.kind)!;
      return {
        id: r.id, kind: r.kind, key: adapter.key(r.content), title: adapter.title(r.content), isNew: r.is_new,
        status: r.status, author: r.author, updatedAt: r.updated_at.toISOString(),
      };
    });
  }

  async find(id: string): Promise<RevisionRecord | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT r.*, r.status::text AS status_text, coalesce(r.command_id::text, r.course_id::text, r.path_id::text, r.cause_code, r.agent_code, r.quiz_id::text, r.lab_id::text) AS target_id,
              a.display_name AS author_name, rv.display_name AS reviewer_name
         FROM editorial.revisions r
         JOIN iam.users a ON a.id = r.author_id
         LEFT JOIN iam.users rv ON rv.id = r.reviewer_id
        WHERE r.id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    const history = await this.db.query<Record<string, any>>(
      `SELECT e.action, u.display_name AS actor, e.comment, e.created_at
         FROM editorial.revision_events e JOIN iam.users u ON u.id = e.actor_id
        WHERE e.revision_id = $1 ORDER BY e.created_at, e.id`,
      [id],
    );
    return {
      id: r.id,
      kind: r.kind,
      targetId: r.target_id,
      isNew: r.is_new,
      content: r.content,
      status: r.status_text,
      authorId: r.author_id,
      authorName: r.author_name,
      reviewerName: r.reviewer_name,
      reviewComment: r.review_comment,
      updatedAt: r.updated_at.toISOString(),
      history: history.rows.map((h) => ({ action: h.action, actor: h.actor, comment: h.comment, at: h.created_at.toISOString() })),
    };
  }

  async create(kind: ContentKind, authorId: string, targetId: string | null, content: unknown): Promise<string> {
    try {
      return await this.db.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO editorial.revisions (kind, ${TARGET_COLUMN[kind]}, is_new, content, author_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [kind, targetId, targetId === null, JSON.stringify(content), authorId],
        );
        await tx.query(`INSERT INTO editorial.revision_events (revision_id, actor_id, action) VALUES ($1, $2, 'created')`, [rows[0].id, authorId]);
        return rows[0].id;
      });
    } catch (err) {
      if (isUniqueViolation(err) && /one_open/.test((err as { constraint?: string }).constraint ?? '')) throw new OpenRevisionExistsError();
      throw err;
    }
  }

  async saveContent(id: string, content: unknown): Promise<void> {
    await this.db.query(`UPDATE editorial.revisions SET content = $2 WHERE id = $1`, [id, JSON.stringify(content)]);
  }

  async transition(id: string, to: RevisionStatus, actorId: string, action: RevisionAction, comment: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      const reviewing = action === 'changes_requested';
      await tx.query(
        `UPDATE editorial.revisions
            SET status = $2::editorial.revision_status,
                submitted_at = CASE WHEN $3 = 'submitted' THEN now() ELSE submitted_at END,
                reviewer_id = CASE WHEN $4 THEN $5::uuid ELSE reviewer_id END,
                review_comment = CASE WHEN $4 THEN $6 ELSE review_comment END,
                reviewed_at = CASE WHEN $4 THEN now() ELSE reviewed_at END
          WHERE id = $1`,
        [id, to, action, reviewing, actorId, comment],
      );
      await tx.query(`INSERT INTO editorial.revision_events (revision_id, actor_id, action, comment) VALUES ($1, $2, $3, $4)`, [
        id, actorId, action, comment,
      ]);
      if (reviewing) {
        const { rows } = await tx.query<{ kind: string; author_id: string }>(`SELECT kind, author_id FROM editorial.revisions WHERE id = $1`, [id]);
        await emitReviewed(tx, { revisionId: id, kind: rows[0].kind, authorId: rows[0].author_id, reviewerId: actorId, decision: 'changes_requested' });
      }
    });
  }

  async publish(
    revision: RevisionRecord,
    reviewerId: string,
    comment: string | null,
    adapter: Pick<ContentKindAdapter, 'apply' | 'publishedEvent' | 'key'>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const targetId = await adapter.apply(tx, revision.content, revision.targetId);
      const key = adapter.key(revision.content);
      await tx.query(
        `UPDATE editorial.revisions
            SET status = 'published', ${TARGET_COLUMN[revision.kind]} = $2, reviewer_id = $3, review_comment = $4, reviewed_at = now()
          WHERE id = $1`,
        [revision.id, targetId, reviewerId, comment],
      );
      await tx.query(`INSERT INTO editorial.revision_events (revision_id, actor_id, action, comment) VALUES ($1, $2, 'approved', $3)`, [
        revision.id, reviewerId, comment,
      ]);
      await tx.query(
        `INSERT INTO platform.audit_log (actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
        [reviewerId, adapter.publishedEvent.replace(/\.v\d+$/, ''), revision.kind, targetId,
          JSON.stringify({ key, revisionId: revision.id, authorId: revision.authorId, isNew: revision.isNew })],
      );
      const event: ContentPublishedV1 & Record<string, unknown> = {
        kind: revision.kind, targetId, key, revisionId: revision.id, authorId: revision.authorId, reviewerId, isNew: revision.isNew,
        // Compatibilité avec le format d'origine de kb.command.published.v1.
        ...(revision.kind === 'command' ? { commandId: targetId, slug: key } : {}),
      };
      await tx.query(
        `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload) VALUES ($1, $2, $3, $4)`,
        [`editorial.${revision.kind}`, revision.id, adapter.publishedEvent, JSON.stringify(event)],
      );
      await emitReviewed(tx, { revisionId: revision.id, kind: revision.kind, authorId: revision.authorId, reviewerId, decision: 'approved' });
    });
  }
}

function emitReviewed(tx: PoolClient, event: EditorialRevisionReviewedV1) {
  return tx.query(
    `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
     VALUES ('editorial.revision', $1, 'editorial.revision.reviewed.v1', $2)`,
    [event.revisionId, JSON.stringify(event)],
  );
}
