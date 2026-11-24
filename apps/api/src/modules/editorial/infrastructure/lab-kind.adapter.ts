import { Injectable } from '@nestjs/common';
import { LabContentSchema, type ContentIssue, type LabContent } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { ContentKindAdapter, KeyTakenError, Schema } from '../application/ports';
import { labIssues } from '../domain/lab-rules';
import { isUniqueViolation } from './pg-revision.repository';

/** Machine de départ d'un nouveau lab : un serveur minimal, à mettre en panne. */
const BLANK_MACHINE: LabContent['machine'] = {
  hostname: 'web01',
  cwd: '/root',
  clock: '2026-01-15T09:00:00.000Z',
  nextPid: 1200,
  dirs: ['/etc', '/root', '/tmp', '/var', '/var/log'],
  files: { '/var/log/syslog': { size: 1048576, content: '' } },
  mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 21474836480, baseUsedBytes: 5368709120 }],
  services: {},
};

/** Labs simulés (schéma labs) : énoncé, machine en panne, validateurs, indices, solution. */
@Injectable()
export class LabKindAdapter implements ContentKindAdapter<LabContent> {
  readonly kind = 'lab' as const;
  readonly schema: Schema<LabContent> = LabContentSchema;
  readonly noun = 'lab';
  readonly publishedEvent = 'labs.lab.published.v1';

  constructor(private readonly db: Database) {}

  blank = (): LabContent => ({
    slug: '', title: '', category: 'linux', difficulty: 'beginner', ttlMinutes: 60, briefMd: '', objectives: [], hints: [],
    solutionMd: '', machine: structuredClone(BLANK_MACHINE), validators: [], walkthrough: [],
  });
  key = (c: LabContent) => c.slug;
  title = (c: LabContent) => c.title;

  issues(c: LabContent): Promise<ContentIssue[]> {
    return Promise.resolve(labIssues(c));
  }

  async published(slug: string): Promise<{ targetId: string; content: LabContent } | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT id, slug, title, category, difficulty::text AS difficulty, ttl_minutes, brief_md, objectives, hints, solution_md, simulation
         FROM labs.lab_templates WHERE slug = $1 AND status = 'published' AND runtime = 'simulation'`,
      [slug],
    );
    const r = rows[0];
    if (!r) return null;
    const hints = (r.hints as unknown[]).map((h) => (typeof h === 'string' ? h : String((h as { text?: string }).text ?? '')));
    return {
      targetId: r.id,
      content: {
        slug: r.slug, title: r.title, category: r.category, difficulty: r.difficulty, ttlMinutes: r.ttl_minutes,
        briefMd: r.brief_md, objectives: r.objectives, hints, solutionMd: r.solution_md ?? '',
        machine: r.simulation.machine, validators: r.simulation.validators, walkthrough: r.simulation.walkthrough ?? [],
      },
    };
  }

  /** Un lab publié qui sert de modèle de forme au générateur : de la même catégorie si possible. */
  async example(category: string): Promise<LabContent | null> {
    const { rows } = await this.db.query<{ slug: string }>(
      `SELECT slug FROM labs.lab_templates WHERE status = 'published' AND runtime = 'simulation'
        ORDER BY (category = $1) DESC, created_at LIMIT 1`,
      [category],
    );
    return rows[0] ? ((await this.published(rows[0].slug))?.content ?? null) : null;
  }

  async apply(tx: PoolClient, c: LabContent, targetId: string | null): Promise<string> {
    const params = [
      c.slug, c.title, c.category, c.difficulty, c.briefMd, c.objectives, JSON.stringify(c.hints.map((text) => ({ text }))),
      c.solutionMd, c.ttlMinutes, JSON.stringify({ machine: c.machine, validators: c.validators, walkthrough: c.walkthrough }),
    ];
    try {
      if (targetId) {
        await tx.query(
          `UPDATE labs.lab_templates SET slug = $1, title = $2, category = $3, difficulty = $4::platform.difficulty, brief_md = $5,
                  objectives = $6, hints = $7, solution_md = $8, ttl_minutes = $9, simulation = $10, status = 'published', updated_at = now()
            WHERE id = $11`,
          [...params, targetId],
        );
        return targetId;
      }
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO labs.lab_templates (slug, title, category, difficulty, brief_md, objectives, hints, solution_md, ttl_minutes, simulation, runtime, status)
         VALUES ($1, $2, $3, $4::platform.difficulty, $5, $6, $7, $8, $9, $10, 'simulation', 'published') RETURNING id`,
        params,
      );
      return rows[0].id;
    } catch (err) {
      if (isUniqueViolation(err, 'lab_templates_slug_key')) throw new KeyTakenError();
      throw err;
    }
  }
}
