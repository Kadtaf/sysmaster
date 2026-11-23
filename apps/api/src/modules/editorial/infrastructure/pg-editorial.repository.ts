import { Injectable } from '@nestjs/common';
import type { CommandContent, CommandPublishedV1, RevisionStatus, RevisionSummaryDto } from '@sysmaster/contracts';
import { Database } from '../../../shared/database.module';
import { EditorialRepository, OpenRevisionExistsError, RevisionAction, RevisionRecord, SlugTakenError } from '../application/ports';

const isUniqueViolation = (err: unknown, constraint: string) =>
  (err as { code?: string; constraint?: string }).code === '23505' && (err as { constraint?: string }).constraint === constraint;

@Injectable()
export class PgEditorialRepository extends EditorialRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async list(filter: { status?: RevisionStatus; authorId?: string }): Promise<RevisionSummaryDto[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT r.id, r.content->>'slug' AS slug, r.content->>'name' AS name, r.is_new, r.status::text AS status,
              u.display_name AS author, r.updated_at
         FROM kb.command_revisions r JOIN iam.users u ON u.id = r.author_id
        WHERE ($1::text IS NULL OR r.status::text = $1) AND ($2::uuid IS NULL OR r.author_id = $2)
        ORDER BY CASE r.status WHEN 'in_review' THEN 0 WHEN 'changes_requested' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, r.updated_at DESC
        LIMIT 200`,
      [filter.status ?? null, filter.authorId ?? null],
    );
    return rows.map((r) => ({
      id: r.id, commandSlug: r.slug, name: r.name, isNew: r.is_new, status: r.status, author: r.author,
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  async find(id: string): Promise<RevisionRecord | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT r.*, r.status::text AS status_text, a.display_name AS author_name, rv.display_name AS reviewer_name
         FROM kb.command_revisions r
         JOIN iam.users a ON a.id = r.author_id
         LEFT JOIN iam.users rv ON rv.id = r.reviewer_id
        WHERE r.id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    const history = await this.db.query<Record<string, any>>(
      `SELECT e.action, u.display_name AS actor, e.comment, e.created_at
         FROM kb.revision_events e JOIN iam.users u ON u.id = e.actor_id
        WHERE e.revision_id = $1 ORDER BY e.created_at, e.id`,
      [id],
    );
    return {
      id: r.id,
      commandId: r.command_id,
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

  async publishedContent(slug: string): Promise<{ commandId: string; content: CommandContent } | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT c.id, c.slug, c.name, c.platform::text AS platform, c.shell, c.summary, c.history, c.internals, c.syntax, c.why,
              c.when_to_use, c.context, c.risk_level::text AS risk_level, c.risks, c.difficulty::text AS difficulty,
              c.requires_admin, c.best_practices, c.common_errors,
              coalesce((SELECT json_agg(json_build_object('flag', p.flag, 'description', p.description, 'riskLevel', p.risk_level) ORDER BY p.position)
                          FROM kb.command_parameters p WHERE p.command_id = c.id), '[]') AS parameters,
              coalesce((SELECT json_agg(json_build_object('title', e.title, 'code', e.code, 'explanation', e.explanation, 'isRealCase', e.is_real_case) ORDER BY e.position)
                          FROM kb.command_examples e WHERE e.command_id = c.id), '[]') AS examples,
              coalesce((SELECT json_agg(json_build_object('slug', a.slug, 'note', ca.note) ORDER BY a.slug)
                          FROM kb.command_alternatives ca JOIN kb.commands a ON a.id = ca.alternative_id WHERE ca.command_id = c.id), '[]') AS alternatives,
              coalesce((SELECT json_agg(json_build_object('title', s.title, 'url', s.url, 'publisher', s.publisher) ORDER BY s.title)
                          FROM kb.command_sources cs JOIN kb.sources s ON s.id = cs.source_id WHERE cs.command_id = c.id), '[]') AS sources
         FROM kb.commands c WHERE c.slug = $1 AND c.status = 'published'`,
      [slug],
    );
    const c = rows[0];
    if (!c) return null;
    return {
      commandId: c.id,
      content: {
        slug: c.slug, name: c.name, platform: c.platform, shell: c.shell, summary: c.summary, history: c.history,
        internals: c.internals, syntax: c.syntax, why: c.why, whenToUse: c.when_to_use, context: c.context,
        riskLevel: c.risk_level, risks: c.risks, difficulty: c.difficulty, requiresAdmin: c.requires_admin,
        bestPractices: c.best_practices, commonErrors: c.common_errors, parameters: c.parameters, examples: c.examples,
        alternatives: c.alternatives, sources: c.sources,
      },
    };
  }

  async publishedSlugs(): Promise<Set<string>> {
    const { rows } = await this.db.query<{ slug: string }>(`SELECT slug FROM kb.commands WHERE status = 'published'`);
    return new Set(rows.map((r) => r.slug));
  }

  async create(authorId: string, commandId: string | null, content: CommandContent): Promise<string> {
    try {
      return await this.db.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO kb.command_revisions (command_id, is_new, content, author_id) VALUES ($1, $2, $3, $4) RETURNING id`,
          [commandId, commandId === null, JSON.stringify(content), authorId],
        );
        await tx.query(`INSERT INTO kb.revision_events (revision_id, actor_id, action) VALUES ($1, $2, 'created')`, [rows[0].id, authorId]);
        return rows[0].id;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'command_revisions_one_open_idx')) throw new OpenRevisionExistsError();
      throw err;
    }
  }

  async saveContent(id: string, content: CommandContent): Promise<void> {
    await this.db.query(`UPDATE kb.command_revisions SET content = $2 WHERE id = $1`, [id, JSON.stringify(content)]);
  }

  async transition(id: string, to: RevisionStatus, actorId: string, action: RevisionAction, comment: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      const reviewing = action === 'changes_requested';
      await tx.query(
        `UPDATE kb.command_revisions
            SET status = $2::kb.revision_status,
                submitted_at = CASE WHEN $3 = 'submitted' THEN now() ELSE submitted_at END,
                reviewer_id = CASE WHEN $4 THEN $5::uuid ELSE reviewer_id END,
                review_comment = CASE WHEN $4 THEN $6 ELSE review_comment END,
                reviewed_at = CASE WHEN $4 THEN now() ELSE reviewed_at END
          WHERE id = $1`,
        [id, to, action, reviewing, actorId, comment],
      );
      await tx.query(`INSERT INTO kb.revision_events (revision_id, actor_id, action, comment) VALUES ($1, $2, $3, $4)`, [id, actorId, action, comment]);
    });
  }

  async publish(revision: RevisionRecord, reviewerId: string, comment: string | null): Promise<void> {
    const c = revision.content;
    try {
      await this.db.transaction(async (tx) => {
        const columns = [
          c.slug, c.name, c.platform, c.shell, c.summary, c.history, c.internals, c.syntax, c.why, c.whenToUse, c.context,
          c.bestPractices, JSON.stringify(c.commonErrors), c.riskLevel, JSON.stringify(c.risks), c.difficulty, c.requiresAdmin,
        ];
        const set = `slug = $1, name = $2, platform = $3::platform.os_platform, shell = $4, summary = $5, history = $6, internals = $7,
                     syntax = $8, why = $9, when_to_use = $10, context = $11, best_practices = $12, common_errors = $13::jsonb,
                     risk_level = $14::platform.risk_level, risks = $15::jsonb, difficulty = $16::platform.difficulty,
                     requires_admin = $17, status = 'published'`;
        let commandId = revision.commandId;
        if (commandId) {
          await tx.query(`UPDATE kb.commands SET ${set} WHERE id = $18`, [...columns, commandId]);
        } else {
          const { rows } = await tx.query<{ id: string }>(
            `INSERT INTO kb.commands (slug, name, platform, shell, summary, history, internals, syntax, why, when_to_use, context,
                                      best_practices, common_errors, risk_level, risks, difficulty, requires_admin, status)
             VALUES ($1, $2, $3::platform.os_platform, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::platform.risk_level,
                     $15::jsonb, $16::platform.difficulty, $17, 'published')
             RETURNING id`,
            columns,
          );
          commandId = rows[0].id;
        }

        // Les éléments liés sont remplacés en bloc : la révision est la nouvelle vérité.
        for (const t of ['command_parameters', 'command_examples', 'command_alternatives', 'command_sources']) {
          await tx.query(`DELETE FROM kb.${t} WHERE command_id = $1`, [commandId]);
        }
        for (const [i, p] of c.parameters.entries()) {
          await tx.query(
            `INSERT INTO kb.command_parameters (command_id, flag, description, risk_level, position) VALUES ($1, $2, $3, $4::platform.risk_level, $5)`,
            [commandId, p.flag, p.description, p.riskLevel, i],
          );
        }
        for (const [i, e] of c.examples.entries()) {
          await tx.query(
            `INSERT INTO kb.command_examples (command_id, title, code, explanation, is_real_case, position) VALUES ($1, $2, $3, $4, $5, $6)`,
            [commandId, e.title, e.code, e.explanation, e.isRealCase, i],
          );
        }
        for (const a of c.alternatives) {
          await tx.query(
            `INSERT INTO kb.command_alternatives (command_id, alternative_id, note)
             SELECT $1, id, $3 FROM kb.commands WHERE slug = $2 AND status = 'published'`,
            [commandId, a.slug, a.note],
          );
        }
        for (const s of c.sources) {
          await tx.query(
            `WITH src AS (
               INSERT INTO kb.sources (title, url, publisher) VALUES ($2, $3, $4)
               ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, publisher = EXCLUDED.publisher
               RETURNING id)
             INSERT INTO kb.command_sources (command_id, source_id) SELECT $1, id FROM src ON CONFLICT DO NOTHING`,
            [commandId, s.title, s.url, s.publisher],
          );
        }

        await tx.query(
          `UPDATE kb.command_revisions
              SET status = 'published', command_id = $2, reviewer_id = $3, review_comment = $4, reviewed_at = now()
            WHERE id = $1`,
          [revision.id, commandId, reviewerId, comment],
        );
        await tx.query(`INSERT INTO kb.revision_events (revision_id, actor_id, action, comment) VALUES ($1, $2, 'approved', $3)`, [
          revision.id, reviewerId, comment,
        ]);
        await tx.query(
          `INSERT INTO platform.audit_log (actor_id, action, target_type, target_id, metadata)
           VALUES ($1, 'kb.command.published', 'kb.command', $2, $3)`,
          [reviewerId, commandId, JSON.stringify({ slug: c.slug, revisionId: revision.id, authorId: revision.authorId, isNew: revision.isNew })],
        );
        const event: CommandPublishedV1 = {
          commandId: commandId!, slug: c.slug, revisionId: revision.id, authorId: revision.authorId, reviewerId, isNew: revision.isNew,
        };
        await tx.query(
          `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload) VALUES ('kb.command', $1, 'kb.command.published.v1', $2)`,
          [commandId, JSON.stringify(event)],
        );
      });
    } catch (err) {
      if (isUniqueViolation(err, 'commands_slug_key')) throw new SlugTakenError();
      throw err;
    }
  }
}
