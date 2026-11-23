import { Injectable } from '@nestjs/common';
import type { CommandSummary } from '@sysmaster/contracts';
import { Database } from '../../../shared/database.module';
import { CommandReadRepository, CommandRecord } from '../application/ports';

const summaryColumns = (t = 'kb.commands') =>
  `${t}.slug, ${t}.name, ${t}.platform::text AS platform, ${t}.summary, ${t}.difficulty::text AS difficulty, ${t}.risk_level::text AS "riskLevel"`;

@Injectable()
export class PgCommandReadRepository extends CommandReadRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async search(q: string | undefined, platform: string | undefined, limit: number): Promise<CommandSummary[]> {
    const { rows } = await this.db.query<CommandSummary & Record<string, unknown>>(
      `SELECT ${summaryColumns()} FROM kb.commands
        WHERE status = 'published'
          AND ($1::text IS NULL OR search_vector @@ websearch_to_tsquery('kb.fr', $1) OR name % $1 OR name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR platform::text = $2)
        ORDER BY CASE WHEN $1::text IS NULL THEN 0 ELSE -ts_rank(search_vector, websearch_to_tsquery('kb.fr', $1)) END, name
        LIMIT $3`,
      [q ?? null, platform ?? null, limit],
    );
    return rows;
  }

  async findBySlug(slug: string): Promise<CommandRecord | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT c.id, ${summaryColumns('c')},
              c.shell, c.history, c.internals, c.syntax, c.why, c.when_to_use, c.context,
              c.best_practices, c.common_errors, c.risks, c.requires_admin
         FROM kb.commands c WHERE c.slug = $1 AND c.status = 'published'`,
      [slug],
    );
    const c = rows[0];
    if (!c) return null;

    const [params, examples, alternatives, sources] = await Promise.all([
      this.db.query<Record<string, any>>(
        `SELECT flag, description, risk_level::text AS "riskLevel" FROM kb.command_parameters WHERE command_id = $1 ORDER BY position`,
        [c.id],
      ),
      this.db.query<Record<string, any>>(
        `SELECT title, code, explanation, is_real_case AS "isRealCase" FROM kb.command_examples WHERE command_id = $1 ORDER BY position`,
        [c.id],
      ),
      this.db.query<Record<string, any>>(
        `SELECT a.slug, a.name, ca.note FROM kb.command_alternatives ca
           JOIN kb.commands a ON a.id = ca.alternative_id WHERE ca.command_id = $1 ORDER BY a.name`,
        [c.id],
      ),
      this.db.query<Record<string, any>>(
        `SELECT s.title, s.url, s.publisher FROM kb.command_sources cs
           JOIN kb.sources s ON s.id = cs.source_id WHERE cs.command_id = $1 ORDER BY s.title`,
        [c.id],
      ),
    ]);

    return {
      slug: c.slug,
      name: c.name,
      platform: c.platform,
      summary: c.summary,
      difficulty: c.difficulty,
      riskLevel: c.riskLevel,
      shell: c.shell,
      history: c.history,
      internals: c.internals,
      syntax: c.syntax,
      why: c.why,
      whenToUse: c.when_to_use,
      context: c.context,
      bestPractices: c.best_practices,
      commonErrors: c.common_errors,
      risks: c.risks,
      requiresAdmin: c.requires_admin,
      parameters: params.rows as CommandRecord['parameters'],
      examples: examples.rows as CommandRecord['examples'],
      alternatives: alternatives.rows as CommandRecord['alternatives'],
      sources: sources.rows as CommandRecord['sources'],
    };
  }
}
