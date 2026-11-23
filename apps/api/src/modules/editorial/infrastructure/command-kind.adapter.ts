import { Injectable } from '@nestjs/common';
import { CommandContentSchema, type CommandContent, type ContentIssue } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { ContentKindAdapter, KeyTakenError, Schema } from '../application/ports';
import { commandIssues } from '../domain/command-rules';
import { isUniqueViolation } from './pg-revision.repository';

export const blankCommand = (): CommandContent => ({
  slug: '', name: '', platform: 'linux', shell: null, summary: '', history: null, internals: null, syntax: '',
  why: '', whenToUse: '', context: null, riskLevel: 'none', risks: [], difficulty: 'beginner', requiresAdmin: false,
  bestPractices: [], commonErrors: [], parameters: [], examples: [], alternatives: [], sources: [],
});

/** Fiches commandes (schéma kb). */
@Injectable()
export class CommandKindAdapter implements ContentKindAdapter<CommandContent> {
  readonly kind = 'command' as const;
  readonly schema: Schema<CommandContent> = CommandContentSchema;
  readonly noun = 'fiche';
  readonly publishedEvent = 'kb.command.published.v1';

  constructor(private readonly db: Database) {}

  blank = blankCommand;
  key = (c: CommandContent) => c.slug;
  title = (c: CommandContent) => c.name;

  async issues(c: CommandContent): Promise<ContentIssue[]> {
    return commandIssues(c, await this.publishedSlugs());
  }

  async published(slug: string): Promise<{ targetId: string; content: CommandContent } | null> {
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
      targetId: c.id,
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

  async apply(tx: PoolClient, c: CommandContent, targetId: string | null): Promise<string> {
    try {
      const columns = [
        c.slug, c.name, c.platform, c.shell, c.summary, c.history, c.internals, c.syntax, c.why, c.whenToUse, c.context,
        c.bestPractices, JSON.stringify(c.commonErrors), c.riskLevel, JSON.stringify(c.risks), c.difficulty, c.requiresAdmin,
      ];
      const set = `slug = $1, name = $2, platform = $3::platform.os_platform, shell = $4, summary = $5, history = $6, internals = $7,
                   syntax = $8, why = $9, when_to_use = $10, context = $11, best_practices = $12, common_errors = $13::jsonb,
                   risk_level = $14::platform.risk_level, risks = $15::jsonb, difficulty = $16::platform.difficulty,
                   requires_admin = $17, status = 'published'`;
      let commandId = targetId;
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

      return commandId!;
    } catch (err) {
      if (isUniqueViolation(err, 'commands_slug_key')) throw new KeyTakenError();
      throw err;
    }
  }
}
