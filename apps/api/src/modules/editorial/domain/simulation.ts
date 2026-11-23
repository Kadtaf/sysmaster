import type { CauseContent, SimulationCaseDto, SimulationDto } from '@sysmaster/contracts';
import { DeductionEngine } from '../../diagnostic/domain/deduction-engine';
import type { KnowledgeSnapshot } from '../../diagnostic/domain/model';
import { extractSymptoms } from '../../diagnostic/domain/symptom-extractor';

export interface ReferenceCase {
  name: string;
  description: string;
  symptoms: string[];
  evidence: string;
  expectedCause: string;
}

/** Applique une cause en brouillon à une base de connaissances (sans rien modifier en place). */
export function withDraftCause(kb: KnowledgeSnapshot, c: CauseContent): KnowledgeSnapshot {
  return {
    symptoms: [
      ...kb.symptoms,
      ...c.newSymptoms.filter((s) => !kb.symptoms.some((k) => k.code === s.code)).map((s) => ({ ...s, platform: c.platform })),
    ],
    causes: [
      ...kb.causes.filter((x) => x.code !== c.code),
      { code: c.code, label: c.label, prior: c.prior, explanation: c.explanation, actionPlan: c.actionPlan },
    ],
    rules: [
      ...kb.rules.filter((r) => r.causeCode !== c.code),
      ...c.rules.map((r) => ({ symptomCode: r.symptom, causeCode: c.code, likelihood: r.likelihood, rationale: r.rationale })),
    ],
    evidencePatterns: [
      ...kb.evidencePatterns.filter((p) => p.causeCode !== c.code),
      ...c.evidencePatterns.map((p) => ({ name: p.name, pattern: p.pattern, causeCode: c.code, boost: p.boost })),
    ],
  };
}

function run(kb: KnowledgeSnapshot, rc: ReferenceCase) {
  const symptoms = [...new Set([...rc.symptoms, ...extractSymptoms(rc.description, kb.symptoms)])];
  const { hypotheses } = new DeductionEngine(kb).rank(symptoms, rc.evidence, 50);
  const index = hypotheses.findIndex((h) => h.cause.code === rc.expectedCause);
  return {
    top: hypotheses[0]?.cause.code ?? null,
    expectedRank: index >= 0 ? index + 1 : null,
    expectedProbability: index >= 0 ? Math.round(hypotheses[index].probability * 1000) / 1000 : 0,
  };
}

/**
 * Rejoue les cas de référence avec la base actuelle puis avec le brouillon. Une régression est un
 * cas où la bonne cause était en tête et ne l'est plus : c'est ce qu'un relecteur doit voir avant
 * d'approuver une modification de probabilités.
 */
export function simulate(before: KnowledgeSnapshot, after: KnowledgeSnapshot, cases: ReferenceCase[]): SimulationDto {
  const labelOf = (code: string) => after.causes.find((c) => c.code === code)?.label ?? before.causes.find((c) => c.code === code)?.label ?? code;
  const results: SimulationCaseDto[] = cases.map((rc) => {
    const b = run(before, rc);
    const a = run(after, rc);
    return {
      name: rc.name,
      expected: { code: rc.expectedCause, label: labelOf(rc.expectedCause) },
      before: b,
      after: a,
      regression: b.expectedRank === 1 && a.expectedRank !== 1,
      improvement: b.expectedRank !== 1 && a.expectedRank === 1,
    };
  });
  return {
    cases: results,
    regressions: results.filter((r) => r.regression).length,
    improvements: results.filter((r) => r.improvement).length,
  };
}
