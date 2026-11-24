import { Injectable } from '@nestjs/common';
import type {
  CommunityCategoryDto, ModerationItemDto, SimilarThreadDto, ThreadKind, ThreadListQuery, ThreadSummaryDto, VoteTarget,
} from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { CommunityRepository, PostRow, Target, ThreadRow } from '../application/ports';
import { excerpt } from '../domain/community';

/** Nom public : le pseudonyme s'il existe, sinon le nom affiché. Jamais l'adresse e-mail. */
const AUTHOR = `coalesce(u.username::text, u.display_name)`;

const THREAD_SELECT = `
  SELECT t.id, t.category_id, c.slug AS category_slug, c.name AS category_name, t.author_id, ${AUTHOR} AS author_name,
         coalesce(s.level, 1) AS author_level, t.kind, t.title, t.body_md, t.tags, t.accepted_post_id, t.is_locked, t.score,
         t.post_count, t.accept_rewarded, t.hidden_at, t.hidden_reason, t.created_at, t.last_activity_at
    FROM community.threads t
    JOIN community.categories c ON c.id = t.category_id
    JOIN iam.users u ON u.id = t.author_id
    LEFT JOIN gamification.user_stats s ON s.user_id = t.author_id`;

const POST_SELECT = `
  SELECT p.id, p.thread_id, p.author_id, ${AUTHOR} AS author_name, coalesce(s.level, 1) AS author_level, p.body_md, p.score,
         p.hidden_at, p.hidden_reason, p.created_at, p.edited_at
    FROM community.posts p
    JOIN iam.users u ON u.id = p.author_id
    LEFT JOIN gamification.user_stats s ON s.user_id = p.author_id`;

function toThread(r: Record<string, any>): ThreadRow {
  return {
    id: r.id, categoryId: r.category_id, categorySlug: r.category_slug, categoryName: r.category_name, authorId: r.author_id,
    authorName: r.author_name, authorLevel: r.author_level, kind: r.kind as ThreadKind, title: r.title, bodyMd: r.body_md, tags: r.tags,
    acceptedPostId: r.accepted_post_id, isLocked: r.is_locked, score: r.score, postCount: r.post_count, acceptRewarded: r.accept_rewarded,
    hiddenAt: r.hidden_at, hiddenReason: r.hidden_reason, createdAt: r.created_at, lastActivityAt: r.last_activity_at,
  };
}

function toPost(r: Record<string, any>): PostRow {
  return {
    id: r.id, threadId: r.thread_id, authorId: r.author_id, authorName: r.author_name, authorLevel: r.author_level, bodyMd: r.body_md,
    score: r.score, hiddenAt: r.hidden_at, hiddenReason: r.hidden_reason, createdAt: r.created_at, editedAt: r.edited_at,
  };
}

const table = (type: VoteTarget) => (type === 'thread' ? 'community.threads' : 'community.posts');

@Injectable()
export class PgCommunityRepository extends CommunityRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async categories(): Promise<CommunityCategoryDto[]> {
    const { rows } = await this.db.query<CommunityCategoryDto & Record<string, unknown>>(
      `SELECT c.slug, c.name, c.description,
              (SELECT count(*)::int FROM community.threads t WHERE t.category_id = c.id AND t.hidden_at IS NULL) AS "threadCount"
         FROM community.categories c ORDER BY c.position, c.name`,
    );
    return rows;
  }

  async categoryId(slug: string): Promise<string | null> {
    const { rows } = await this.db.query<{ id: string }>(`SELECT id FROM community.categories WHERE slug = $1`, [slug]);
    return rows[0]?.id ?? null;
  }

  async listThreads(q: ThreadListQuery, pageSize: number, v: { withHiddenOf: string | null; allHidden: boolean }) {
    const where: string[] = [];
    const params: unknown[] = [];
    const p = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (!v.allHidden) where.push(`(t.hidden_at IS NULL OR t.author_id = ${p(v.withHiddenOf)}::uuid)`);
    if (q.category) where.push(`c.slug = ${p(q.category)}`);
    if (q.kind) where.push(`t.kind = ${p(q.kind)}`);
    if (q.tag) where.push(`${p(q.tag.toLowerCase())} = ANY(t.tags)`);
    let rank = '0';
    if (q.q) {
      const query = p(q.q);
      where.push(`t.search_vector @@ websearch_to_tsquery('kb.fr', ${query})`);
      rank = `ts_rank(t.search_vector, websearch_to_tsquery('kb.fr', ${query}))`;
    }
    if (q.sort === 'unanswered') where.push(`t.kind = 'question' AND t.accepted_post_id IS NULL`);
    const order =
      q.sort === 'top' ? `t.score DESC, t.last_activity_at DESC`
      : q.q ? `${rank} DESC, t.last_activity_at DESC`
      : q.sort === 'unanswered' ? `t.post_count ASC, t.created_at DESC`
      : `t.last_activity_at DESC`;
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [list, count] = await Promise.all([
      this.db.query<Record<string, any>>(
        `${THREAD_SELECT} ${clause} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(q.page - 1) * pageSize}`,
        params,
      ),
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM community.threads t JOIN community.categories c ON c.id = t.category_id ${clause}`,
        params,
      ),
    ]);
    const items: ThreadSummaryDto[] = list.rows.map(toThread).map((t) => ({
      id: t.id, category: { slug: t.categorySlug, name: t.categoryName }, kind: t.kind, title: t.title,
      excerpt: excerpt(t.bodyMd), tags: t.tags, author: { displayName: t.authorName, level: t.authorLevel },
      score: t.score, postCount: t.postCount, answered: !!t.acceptedPostId, isLocked: t.isLocked,
      hidden: t.hiddenAt ? { at: t.hiddenAt.toISOString(), reason: t.hiddenReason } : null,
      createdAt: t.createdAt.toISOString(), lastActivityAt: t.lastActivityAt.toISOString(),
    }));
    return { items, total: count.rows[0].n };
  }

  async similar(text: string, limit: number): Promise<SimilarThreadDto[]> {
    // Requête « OU » sur les mots du texte : on cherche des sujets proches, pas identiques.
    const { rows } = await this.db.query<SimilarThreadDto & Record<string, unknown>>(
      `WITH q AS (
         SELECT to_tsquery('kb.fr', string_agg(quote_literal(lexeme), ' | ')) AS query
           FROM unnest(to_tsvector('kb.fr', $1))
       )
       SELECT t.id, t.title, t.accepted_post_id IS NOT NULL AS answered, t.post_count AS "postCount"
         FROM community.threads t, q
        WHERE q.query IS NOT NULL AND t.hidden_at IS NULL AND t.search_vector @@ q.query
        ORDER BY ts_rank(t.search_vector, q.query) DESC, t.score DESC
        LIMIT $2`,
      [text, limit],
    );
    return rows;
  }

  async thread(id: string): Promise<ThreadRow | null> {
    const { rows } = await this.db.query<Record<string, any>>(`${THREAD_SELECT} WHERE t.id = $1`, [id]);
    return rows[0] ? toThread(rows[0]) : null;
  }

  async posts(threadId: string): Promise<PostRow[]> {
    // La réponse acceptée d'abord, puis les mieux notées, puis l'ordre d'arrivée.
    const { rows } = await this.db.query<Record<string, any>>(
      `${POST_SELECT} JOIN community.threads t ON t.id = p.thread_id
        WHERE p.thread_id = $1
        ORDER BY (p.id = t.accepted_post_id) IS TRUE DESC, p.score DESC, p.created_at`,
      [threadId],
    );
    return rows.map(toPost);
  }

  async post(id: string): Promise<PostRow | null> {
    const { rows } = await this.db.query<Record<string, any>>(`${POST_SELECT} WHERE p.id = $1`, [id]);
    return rows[0] ? toPost(rows[0]) : null;
  }

  async myVotes(userId: string, targets: { type: VoteTarget; id: string }[]): Promise<Map<string, -1 | 1>> {
    if (targets.length === 0) return new Map();
    const { rows } = await this.db.query<{ target_type: VoteTarget; target_id: string; value: -1 | 1 }>(
      `SELECT target_type, target_id, value FROM community.votes WHERE user_id = $1 AND target_id = ANY($2::uuid[])`,
      [userId, targets.map((t) => t.id)],
    );
    return new Map(rows.map((r) => [`${r.target_type}:${r.target_id}`, r.value]));
  }

  async target(type: VoteTarget, id: string): Promise<Target | null> {
    const { rows } = await this.db.query<{ thread_id: string; author_id: string; hidden: boolean }>(
      type === 'thread'
        ? `SELECT id AS thread_id, author_id, hidden_at IS NOT NULL AS hidden FROM community.threads WHERE id = $1`
        : `SELECT thread_id, author_id, hidden_at IS NOT NULL AS hidden FROM community.posts WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    return r ? { type, id, threadId: r.thread_id, authorId: r.author_id, hidden: r.hidden } : null;
  }

  async recentCount(userId: string, what: 'thread' | 'post'): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table(what)} WHERE author_id = $1 AND created_at > now() - interval '1 hour'`,
      [userId],
    );
    return rows[0].n;
  }

  async createThread(t: { categoryId: string; authorId: string; kind: ThreadKind; title: string; bodyMd: string; tags: string[] }): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO community.threads (category_id, author_id, kind, title, body_md, tags) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [t.categoryId, t.authorId, t.kind, t.title, t.bodyMd, t.tags],
    );
    return rows[0].id;
  }

  async editThread(id: string, t: { title: string; bodyMd: string; tags: string[] }): Promise<void> {
    await this.db.query(`UPDATE community.threads SET title = $2, body_md = $3, tags = $4, updated_at = now() WHERE id = $1`, [id, t.title, t.bodyMd, t.tags]);
  }

  createPost(threadId: string, authorId: string, bodyMd: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO community.posts (thread_id, author_id, body_md) VALUES ($1, $2, $3) RETURNING id`,
        [threadId, authorId, bodyMd],
      );
      await tx.query(`UPDATE community.threads SET post_count = post_count + 1, last_activity_at = now() WHERE id = $1`, [threadId]);
      return rows[0].id;
    });
  }

  async editPost(id: string, bodyMd: string): Promise<void> {
    await this.db.query(`UPDATE community.posts SET body_md = $2, edited_at = now() WHERE id = $1`, [id, bodyMd]);
  }

  vote(userId: string, target: Target, value: -1 | 0 | 1): Promise<number> {
    return this.db.transaction(async (tx) => {
      // Verrou sur le contenu : deux votes simultanés ne perdent pas de mise à jour du score.
      await tx.query(`SELECT 1 FROM ${table(target.type)} WHERE id = $1 FOR UPDATE`, [target.id]);
      const prev = await tx.query<{ value: number }>(
        `SELECT value FROM community.votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
        [userId, target.type, target.id],
      );
      const before = prev.rows[0]?.value ?? 0;
      if (value === 0) {
        await tx.query(`DELETE FROM community.votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3`, [userId, target.type, target.id]);
      } else {
        await tx.query(
          `INSERT INTO community.votes (user_id, target_type, target_id, value) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET value = EXCLUDED.value`,
          [userId, target.type, target.id, value],
        );
      }
      const { rows } = await tx.query<{ score: number }>(
        `UPDATE ${table(target.type)} SET score = score + $2 WHERE id = $1 RETURNING score`,
        [target.id, value - before],
      );
      return rows[0].score;
    });
  }

  accept(threadId: string, postId: string | null, reward: { userId: string; acceptedBy: string } | null): Promise<void> {
    return this.db.transaction(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE community.threads SET accepted_post_id = $2, last_activity_at = now(), accept_rewarded = accept_rewarded OR $3
          WHERE id = $1 AND ($3 = false OR accept_rewarded = false)`,
        [threadId, postId, !!reward],
      );
      // Deux acceptations simultanées : la seconde ne récompense pas une deuxième fois.
      if (rowCount !== 1) {
        await tx.query(`UPDATE community.threads SET accepted_post_id = $2, last_activity_at = now() WHERE id = $1`, [threadId, postId]);
        return;
      }
      if (reward && postId) await this.emitAccepted(tx, threadId, postId, reward);
    });
  }

  private async emitAccepted(tx: PoolClient, threadId: string, postId: string, reward: { userId: string; acceptedBy: string }) {
    await tx.query(
      `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
       VALUES ('community.thread', $1, 'community.answer.accepted.v1', $2)`,
      [threadId, JSON.stringify({ threadId, postId, userId: reward.userId, acceptedBy: reward.acceptedBy })],
    );
  }

  async lock(threadId: string, locked: boolean): Promise<boolean> {
    const { rowCount } = await this.db.query(`UPDATE community.threads SET is_locked = $2 WHERE id = $1`, [threadId, locked]);
    return rowCount === 1;
  }

  report(reporterId: string, target: Target, reason: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO community.reports (reporter_id, target_type, target_id, reason) VALUES ($1, $2, $3, $4)
         ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'open' DO UPDATE SET reason = EXCLUDED.reason`,
        [reporterId, target.type, target.id, reason],
      );
      const { rows } = await tx.query<{ n: number }>(
        `SELECT count(DISTINCT reporter_id)::int AS n FROM community.reports WHERE target_type = $1 AND target_id = $2 AND status = 'open'`,
        [target.type, target.id],
      );
      return rows[0].n;
    });
  }

  async setHidden(target: Target, hidden: { by: string; reason: string } | null): Promise<void> {
    await this.db.query(
      `UPDATE ${table(target.type)} SET hidden_at = CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END, hidden_by = $2, hidden_reason = $3 WHERE id = $1`,
      [target.id, hidden?.by ?? null, hidden?.reason ?? null],
    );
  }

  async moderationQueue(): Promise<ModerationItemDto[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT r.target_type, r.target_id,
              coalesce(p.thread_id, t.id) AS thread_id, coalesce(pt.title, t.title) AS thread_title,
              coalesce(pu.username::text, pu.display_name, tu.username::text, tu.display_name) AS author,
              coalesce(p.body_md, t.body_md) AS body_md,
              coalesce(p.hidden_at, t.hidden_at) AS hidden_at, coalesce(p.hidden_reason, t.hidden_reason) AS hidden_reason,
              json_agg(json_build_object('reason', r.reason, 'reporter', coalesce(ru.username::text, ru.display_name), 'createdAt', r.created_at)
                       ORDER BY r.created_at) AS reports,
              min(r.created_at) AS first_reported_at
         FROM community.reports r
         JOIN iam.users ru ON ru.id = r.reporter_id
         LEFT JOIN community.threads t ON r.target_type = 'thread' AND t.id = r.target_id
         LEFT JOIN iam.users tu ON tu.id = t.author_id
         LEFT JOIN community.posts p ON r.target_type = 'post' AND p.id = r.target_id
         LEFT JOIN community.threads pt ON pt.id = p.thread_id
         LEFT JOIN iam.users pu ON pu.id = p.author_id
        WHERE r.status = 'open' AND (t.id IS NOT NULL OR p.id IS NOT NULL)
        GROUP BY r.target_type, r.target_id, p.thread_id, t.id, pt.title, t.title, pu.username, pu.display_name, tu.username, tu.display_name,
                 p.body_md, t.body_md, p.hidden_at, t.hidden_at, p.hidden_reason, t.hidden_reason
        ORDER BY count(*) DESC, min(r.created_at)
        LIMIT 100`,
    );
    return rows.map((r) => ({
      targetType: r.target_type, targetId: r.target_id, threadId: r.thread_id, threadTitle: r.thread_title, author: r.author,
      bodyMd: r.body_md, hidden: r.hidden_at ? { at: r.hidden_at.toISOString(), reason: r.hidden_reason } : null,
      reports: r.reports, firstReportedAt: r.first_reported_at.toISOString(),
    }));
  }

  async resolveReports(target: Target, by: string, status: 'actioned' | 'dismissed', note: string | null): Promise<number> {
    const { rowCount } = await this.db.query(
      `UPDATE community.reports SET status = $3, resolved_by = $4, resolved_at = now(), resolution_note = $5
        WHERE target_type = $1 AND target_id = $2 AND status = 'open'`,
      [target.type, target.id, status, by, note],
    );
    return rowCount ?? 0;
  }
}
