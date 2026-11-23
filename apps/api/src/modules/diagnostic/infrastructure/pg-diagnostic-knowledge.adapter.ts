import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database.module';
import { DiagnosticKnowledgePort } from '../application/ports';
import { Cause, EvidencePattern, KnowledgeSnapshot, Rule, Symptom } from '../domain/model';

/** Adaptateur Postgres du port de connaissances. Lit le schéma `diagnostic`. */
@Injectable()
export class PgDiagnosticKnowledgeAdapter extends DiagnosticKnowledgePort {
  constructor(private readonly db: Database) {
    super();
  }

  async listSymptoms(platform: string): Promise<Symptom[]> {
    const { rows } = await this.db.query<{ code: string; label: string; platform: string; synonyms: string[] }>(
      `SELECT code, label, platform::text, synonyms FROM diagnostic.symptoms
        WHERE platform IN ($1::platform.os_platform, 'cross_platform') ORDER BY label`,
      [platform],
    );
    return rows;
  }

  async load(platform: string): Promise<KnowledgeSnapshot> {
    const [symptoms, causes, rules, patterns] = await Promise.all([
      this.listSymptoms(platform),
      this.db.query<{ code: string; label: string; prior: string; explanation: string; action_plan: Cause['actionPlan'] }>(
        `SELECT code, label, prior, explanation, action_plan FROM diagnostic.causes
          WHERE platform IN ($1::platform.os_platform, 'cross_platform')`,
        [platform],
      ),
      this.db.query<{ symptom_code: string; cause_code: string; likelihood: string; rationale: string }>(
        `SELECT symptom_code, cause_code, likelihood, rationale FROM diagnostic.rules`,
      ),
      this.db.query<{ name: string; pattern: string; cause_code: string; boost: string }>(
        `SELECT name, pattern, cause_code, boost FROM diagnostic.evidence_patterns`,
      ),
    ]);
    return {
      symptoms,
      causes: causes.rows.map((c) => ({
        code: c.code,
        label: c.label,
        prior: Number(c.prior),
        explanation: c.explanation,
        actionPlan: c.action_plan,
      })),
      rules: rules.rows.map<Rule>((r) => ({
        symptomCode: r.symptom_code,
        causeCode: r.cause_code,
        likelihood: Number(r.likelihood),
        rationale: r.rationale,
      })),
      evidencePatterns: patterns.rows.map<EvidencePattern>((p) => ({
        name: p.name,
        pattern: p.pattern,
        causeCode: p.cause_code,
        boost: Number(p.boost),
      })),
    };
  }
}
