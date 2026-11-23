import { Injectable } from '@nestjs/common';
import { CauseContentSchema, type CauseContent, type ContentIssue, type SimulationDto } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { PgDiagnosticKnowledgeAdapter } from '../../diagnostic/infrastructure/pg-diagnostic-knowledge.adapter';
import { ContentKindAdapter, KeyTakenError, Schema } from '../application/ports';
import { causeIssues } from '../domain/cause-rules';
import { ReferenceCase, simulate, withDraftCause } from '../domain/simulation';
import { isUniqueViolation } from './pg-revision.repository';

/**
 * Causes de diagnostic (schéma diagnostic) : probabilité a priori, plan d'action, règles et motifs
 * de journaux. Avant publication, la modification est rejouée sur les cas de référence.
 */
@Injectable()
export class CauseKindAdapter implements ContentKindAdapter<CauseContent> {
  readonly kind = 'diagnostic_cause' as const;
  readonly schema: Schema<CauseContent> = CauseContentSchema;
  readonly noun = 'cause de diagnostic';
  readonly publishedEvent = 'diagnostic.cause.published.v1';
  private readonly knowledge: PgDiagnosticKnowledgeAdapter;

  constructor(private readonly db: Database) {
    this.knowledge = new PgDiagnosticKnowledgeAdapter(db);
  }

  blank = (): CauseContent => ({
    code: '', label: '', platform: 'windows', prior: 0.05, explanation: '', actionPlan: [], rules: [], evidencePatterns: [], newSymptoms: [],
  });
  key = (c: CauseContent) => c.code;
  title = (c: CauseContent) => c.label;

  async issues(c: CauseContent): Promise<ContentIssue[]> {
    const [symptoms, commands, patterns] = [
      await this.db.query<{ code: string }>('SELECT code FROM diagnostic.symptoms'),
      await this.db.query<{ slug: string }>(`SELECT slug FROM kb.commands WHERE status = 'published'`),
      await this.db.query<{ name: string }>('SELECT name FROM diagnostic.evidence_patterns WHERE cause_code <> $1', [c.code]),
    ];
    const issues = causeIssues(c, {
      knownSymptoms: new Set(symptoms.rows.map((r) => r.code)),
      knownCommands: new Set(commands.rows.map((r) => r.slug)),
    });
    const taken = new Set(patterns.rows.map((r) => r.name));
    c.evidencePatterns.forEach((p, i) => {
      if (taken.has(p.name)) issues.push({ field: `evidencePatterns.${i}.name`, message: `Le nom de motif « ${p.name} » est déjà utilisé par une autre cause.` });
    });
    return issues;
  }

  async published(code: string): Promise<{ targetId: string; content: CauseContent } | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT c.code, c.label, c.platform::text AS platform, c.prior, c.explanation, c.action_plan,
              coalesce((SELECT json_agg(json_build_object('symptom', r.symptom_code, 'likelihood', r.likelihood, 'rationale', r.rationale)
                                        ORDER BY r.likelihood DESC, r.symptom_code)
                          FROM diagnostic.rules r WHERE r.cause_code = c.code), '[]') AS rules,
              coalesce((SELECT json_agg(json_build_object('name', p.name, 'source', p.source, 'pattern', p.pattern, 'boost', p.boost) ORDER BY p.name)
                          FROM diagnostic.evidence_patterns p WHERE p.cause_code = c.code), '[]') AS patterns
         FROM diagnostic.causes c WHERE c.code = $1`,
      [code],
    );
    const c = rows[0];
    if (!c) return null;
    return {
      targetId: c.code,
      content: {
        code: c.code, label: c.label, platform: c.platform, prior: Number(c.prior), explanation: c.explanation,
        actionPlan: (c.action_plan as Record<string, unknown>[]).map((s) => ({
          step: String(s.step ?? ''), why: String(s.why ?? ''), risk: (s.risk as CauseContent['actionPlan'][number]['risk']) ?? 'none',
          commandSlug: (s.command_slug as string | undefined) ?? (s.commandSlug as string | undefined) ?? null,
        })),
        rules: (c.rules as { symptom: string; likelihood: string; rationale: string }[]).map((r) => ({ ...r, likelihood: Number(r.likelihood) })),
        evidencePatterns: (c.patterns as { name: string; source: CauseContent['evidencePatterns'][number]['source']; pattern: string; boost: string }[])
          .map((p) => ({ ...p, boost: Number(p.boost) })),
        newSymptoms: [],
      },
    };
  }

  async simulate(c: CauseContent): Promise<SimulationDto> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT name, platform::text AS platform, description, symptoms, evidence, expected_cause FROM diagnostic.reference_cases
        WHERE $1 = 'cross_platform' OR platform::text = $1 OR platform = 'cross_platform' ORDER BY name`,
      [c.platform],
    );
    const byPlatform = new Map<string, ReferenceCase[]>();
    for (const r of rows) {
      const list = byPlatform.get(r.platform) ?? [];
      list.push({ name: r.name, description: r.description, symptoms: r.symptoms, evidence: r.evidence, expectedCause: r.expected_cause });
      byPlatform.set(r.platform, list);
    }
    const result: SimulationDto = { cases: [], regressions: 0, improvements: 0 };
    for (const [platform, cases] of byPlatform) {
      const before = await this.knowledge.load(platform);
      const partial = simulate(before, withDraftCause(before, c), cases);
      result.cases.push(...partial.cases);
      result.regressions += partial.regressions;
      result.improvements += partial.improvements;
    }
    return result;
  }

  async apply(tx: PoolClient, c: CauseContent, targetId: string | null): Promise<string> {
    const plan = JSON.stringify(c.actionPlan.map((s) => ({ step: s.step, why: s.why, risk: s.risk, ...(s.commandSlug ? { command_slug: s.commandSlug } : {}) })));
    try {
      if (targetId) {
        await tx.query(
          `UPDATE diagnostic.causes SET label = $2, platform = $3::platform.os_platform, prior = $4, explanation = $5, action_plan = $6::jsonb
            WHERE code = $1`,
          [c.code, c.label, c.platform, c.prior, c.explanation, plan],
        );
      } else {
        await tx.query(
          `INSERT INTO diagnostic.causes (code, label, platform, prior, explanation, action_plan)
           VALUES ($1, $2, $3::platform.os_platform, $4, $5, $6::jsonb)`,
          [c.code, c.label, c.platform, c.prior, c.explanation, plan],
        );
      }
    } catch (err) {
      if (isUniqueViolation(err, 'causes_pkey')) throw new KeyTakenError();
      throw err;
    }
    for (const s of c.newSymptoms) {
      await tx.query(
        `INSERT INTO diagnostic.symptoms (code, label, platform, synonyms) VALUES ($1, $2, $3::platform.os_platform, $4) ON CONFLICT (code) DO NOTHING`,
        [s.code, s.label, c.platform, s.synonyms],
      );
    }
    // Les règles sont versionnées : la nouvelle génération porte le numéro suivant.
    const { rows } = await tx.query<{ v: number }>(`SELECT coalesce(max(version), 0)::int AS v FROM diagnostic.rules WHERE cause_code = $1`, [c.code]);
    await tx.query(`DELETE FROM diagnostic.rules WHERE cause_code = $1`, [c.code]);
    for (const r of c.rules) {
      await tx.query(
        `INSERT INTO diagnostic.rules (symptom_code, cause_code, likelihood, rationale, version) VALUES ($1, $2, $3, $4, $5)`,
        [r.symptom, c.code, r.likelihood, r.rationale, rows[0].v + 1],
      );
    }
    await tx.query(`DELETE FROM diagnostic.evidence_patterns WHERE cause_code = $1`, [c.code]);
    for (const p of c.evidencePatterns) {
      await tx.query(
        `INSERT INTO diagnostic.evidence_patterns (name, source, pattern, cause_code, boost) VALUES ($1, $2, $3, $4, $5)`,
        [p.name, p.source, p.pattern, c.code, p.boost],
      );
    }
    return c.code;
  }
}
