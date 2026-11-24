import { Injectable } from '@nestjs/common';
import type { LabSolvedV1, LabSummaryDto, LabTranscriptEntry } from '@sysmaster/contracts';
import { Database } from '../../../shared/database.module';
import type { MachineState } from '../domain/machine';
import { LabInstance, LabRepository, LabTemplate } from '../application/ports';

const TEMPLATE_COLUMNS = `id, slug, title, category, difficulty, runtime, ttl_minutes, objectives, brief_md, hints, solution_md, simulation`;

type TemplateRow = {
  id: string; slug: string; title: string; category: LabTemplate['category']; difficulty: LabTemplate['difficulty'];
  runtime: LabTemplate['runtime']; ttl_minutes: number; objectives: string[]; brief_md: string;
  hints: unknown; solution_md: string | null; simulation: LabTemplate['simulation'];
};

type InstanceRow = {
  id: string; template_id: string; user_id: string; status: string; state: MachineState;
  transcript: LabTranscriptEntry[]; command_count: number; hints_used: number; score: number | null; expires_at: Date;
};

/** Les indices sont stockés en `[{ text }]` (ou en chaînes) : on accepte les deux formes. */
function hintTexts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((h) => (typeof h === 'string' ? h : String((h as { text?: unknown })?.text ?? ''))).filter(Boolean);
}

function toTemplate(r: TemplateRow): LabTemplate {
  return {
    id: r.id, slug: r.slug, title: r.title, category: r.category, difficulty: r.difficulty, runtime: r.runtime,
    ttlMinutes: r.ttl_minutes, objectives: r.objectives, briefMd: r.brief_md, hints: hintTexts(r.hints),
    solutionMd: r.solution_md, simulation: r.simulation,
  };
}

function toInstance(r: InstanceRow): LabInstance {
  return {
    id: r.id, templateId: r.template_id, userId: r.user_id,
    status: r.status === 'solved' ? 'solved' : r.status === 'running' ? 'running' : 'expired',
    state: r.state, transcript: r.transcript, commandCount: r.command_count, hintsUsed: r.hints_used,
    score: r.score, expiresAt: r.expires_at,
  };
}

@Injectable()
export class PgLabRepository extends LabRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async list(): Promise<LabSummaryDto[]> {
    const { rows } = await this.db.query<TemplateRow>(
      `SELECT ${TEMPLATE_COLUMNS} FROM labs.lab_templates WHERE status = 'published' ORDER BY category, difficulty, title`,
    );
    return rows.map((r) => {
      const t = toTemplate(r);
      return { slug: t.slug, title: t.title, category: t.category, difficulty: t.difficulty, runtime: t.runtime, ttlMinutes: t.ttlMinutes, objectives: t.objectives };
    });
  }

  async find(slug: string): Promise<LabTemplate | null> {
    const { rows } = await this.db.query<TemplateRow>(
      `SELECT ${TEMPLATE_COLUMNS} FROM labs.lab_templates WHERE slug = $1 AND status = 'published'`,
      [slug],
    );
    return rows[0] ? toTemplate(rows[0]) : null;
  }

  async findById(templateId: string): Promise<LabTemplate | null> {
    const { rows } = await this.db.query<TemplateRow>(`SELECT ${TEMPLATE_COLUMNS} FROM labs.lab_templates WHERE id = $1`, [templateId]);
    return rows[0] ? toTemplate(rows[0]) : null;
  }

  /** Clôt les sessions dont le délai est passé : elles ne bloquent plus un nouveau départ. */
  private expireStale(where: string, params: unknown[]) {
    return this.db.query(
      `UPDATE labs.instances SET status = 'expired', ended_at = now()
        WHERE status = 'running' AND expires_at < now() AND ${where}`,
      params,
    );
  }

  async active(userId: string, templateId: string): Promise<LabInstance | null> {
    await this.expireStale('user_id = $1 AND template_id = $2', [userId, templateId]);
    const { rows } = await this.db.query<InstanceRow>(
      `SELECT * FROM labs.instances WHERE user_id = $1 AND template_id = $2 AND status = 'running'`,
      [userId, templateId],
    );
    return rows[0] ? toInstance(rows[0]) : null;
  }

  async create(userId: string, t: LabTemplate): Promise<LabInstance> {
    const { rows } = await this.db.query<InstanceRow>(
      `INSERT INTO labs.instances (template_id, user_id, status, state, node_ref, expires_at)
       VALUES ($1, $2, 'running', $3, 'simulation', now() + make_interval(mins => $4))
       RETURNING *`,
      [t.id, userId, JSON.stringify(t.simulation!.machine), t.ttlMinutes],
    );
    return toInstance(rows[0]);
  }

  async get(id: string): Promise<LabInstance | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    await this.expireStale('id = $1', [id]);
    const { rows } = await this.db.query<InstanceRow>(`SELECT * FROM labs.instances WHERE id = $1`, [id]);
    return rows[0] ? toInstance(rows[0]) : null;
  }

  async saveCommand(id: string, expectedCount: number, state: MachineState, transcript: LabTranscriptEntry[]): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE labs.instances SET state = $3, transcript = $4, command_count = command_count + 1
        WHERE id = $1 AND command_count = $2 AND status = 'running'`,
      [id, expectedCount, JSON.stringify(state), JSON.stringify(transcript)],
    );
    return rowCount === 1;
  }

  async useHint(id: string): Promise<number> {
    const { rows } = await this.db.query<{ hints_used: number }>(
      `UPDATE labs.instances SET hints_used = hints_used + 1 WHERE id = $1 AND status = 'running' RETURNING hints_used`,
      [id],
    );
    return rows[0]?.hints_used ?? 0;
  }

  solve(i: LabInstance, labSlug: string, score: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE labs.instances SET status = 'solved', score = $2, ended_at = now() WHERE id = $1 AND status = 'running'`,
        [i.id, score],
      );
      if (rowCount !== 1) return false;
      const event: LabSolvedV1 = { instanceId: i.id, labSlug, userId: i.userId, hintsUsed: i.hintsUsed, score };
      await tx.query(
        `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
         VALUES ('labs.instance', $1, 'labs.lab.solved.v1', $2)`,
        [i.id, JSON.stringify(event)],
      );
      return true;
    });
  }

  async close(id: string): Promise<void> {
    await this.db.query(`UPDATE labs.instances SET status = 'expired', ended_at = now() WHERE id = $1 AND status = 'running'`, [id]);
  }
}
