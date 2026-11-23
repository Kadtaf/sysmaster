import {
  ClarifyingQuestion,
  DeductionResult,
  EvidencePattern,
  Hypothesis,
  KnowledgeSnapshot,
  Rule,
} from './model';

/**
 * Moteur de déduction v1 : bayésien naïf avec terme de fuite.
 *
 *   score(c) = P(c) × Π P(s|c) × Π boost(preuve, c)
 *
 * Pourquoi ce modèle plutôt qu'un LLM seul ?
 *  - déterministe et auditable : on peut expliquer chaque point de probabilité ;
 *  - les règles sont relues par des experts et versionnées ;
 *  - le LLM (Phase 3) sert à extraire les symptômes et à rédiger, pas à inventer des probabilités.
 *
 * Limite connue : l'hypothèse d'indépendance des symptômes surestime parfois la confiance
 * quand deux symptômes sont corrélés (ex. « redémarre en jeu » et « chauffe »). La confiance
 * affichée est donc volontairement atténuée (voir computeConfidence).
 */
export class DeductionEngine {
  /** Vraisemblance utilisée quand aucune règle ne relie le symptôme à la cause. */
  static readonly LEAK = 0.02;
  /** Nombre de symptômes à partir duquel on considère l'information suffisante. */
  static readonly SATURATION = 3;

  constructor(private readonly kb: KnowledgeSnapshot) {}

  rank(symptomCodes: string[], evidenceText = '', maxHypotheses = 5): DeductionResult {
    const observed = [...new Set(symptomCodes)].filter((c) => this.kb.symptoms.some((s) => s.code === c));
    const matchedEvidence = this.matchEvidence(evidenceText);

    if (observed.length === 0 && matchedEvidence.length === 0) {
      return { hypotheses: [], confidence: 0, matchedEvidence: [], clarifyingQuestions: [] };
    }

    // On ne considère que les causes reliées à au moins un symptôme observé ou une preuve :
    // sinon une cause sans rapport (forte probabilité a priori) polluerait le classement.
    const candidateCodes = new Set<string>([
      ...this.kb.rules.filter((r) => observed.includes(r.symptomCode)).map((r) => r.causeCode),
      ...matchedEvidence.map((e) => e.causeCode),
    ]);
    const candidates = this.kb.causes.filter((c) => candidateCodes.has(c.code));

    const scored = candidates.map((cause) => {
      let score = cause.prior;
      const reasoning: string[] = [];
      for (const s of observed) {
        const rule = this.rule(s, cause.code);
        const likelihood = rule?.likelihood ?? DeductionEngine.LEAK;
        score *= likelihood;
        const symptom = this.kb.symptoms.find((x) => x.code === s)!;
        if (rule && likelihood >= 0.5) {
          reasoning.push(`« ${symptom.label} » est fréquent avec cette cause (${pct(likelihood)}) : ${rule.rationale}`);
        } else if (rule && likelihood < 0.2) {
          reasoning.push(`« ${symptom.label} » est rare avec cette cause (${pct(likelihood)}), ce qui la rend moins probable.`);
        } else if (!rule) {
          reasoning.push(`« ${symptom.label} » n'est pas associé à cette cause dans la base de règles.`);
        }
      }
      for (const e of matchedEvidence.filter((m) => m.causeCode === cause.code)) {
        score *= e.boost;
        reasoning.push(`Le journal contient « ${e.name} », un indice direct de cette cause (poids ×${e.boost}).`);
      }
      return { cause, score, reasoning };
    });

    const total = scored.reduce((sum, h) => sum + h.score, 0);
    const hypotheses: Hypothesis[] = scored
      .map((h) => ({ cause: h.cause, probability: total > 0 ? h.score / total : 0, reasoning: h.reasoning }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, maxHypotheses);

    return {
      hypotheses,
      confidence: this.computeConfidence(hypotheses, observed.length + matchedEvidence.length),
      matchedEvidence: matchedEvidence.map(({ name, causeCode }) => ({ name, causeCode })),
      clarifyingQuestions: this.clarifyingQuestions(hypotheses, observed),
    };
  }

  /**
   * Confiance ∈ [0,1] : élevée si la 1re hypothèse domine nettement la 2e
   * ET si l'on dispose d'assez d'observations.
   */
  private computeConfidence(h: Hypothesis[], observations: number): number {
    if (h.length === 0) return 0;
    const p1 = h[0].probability;
    const p2 = h[1]?.probability ?? 0;
    const margin = p1 > 0 ? 1 - p2 / p1 : 0;
    const information = Math.min(1, observations / DeductionEngine.SATURATION);
    return round(p1 * (0.5 + 0.5 * margin) * information);
  }

  /** Symptômes non observés qui départagent le mieux les deux meilleures hypothèses. */
  private clarifyingQuestions(h: Hypothesis[], observed: string[], max = 3): ClarifyingQuestion[] {
    if (h.length < 2) return [];
    const [a, b] = h;
    return this.kb.symptoms
      .filter((s) => !observed.includes(s.code))
      .map((s) => {
        const la = this.rule(s.code, a.cause.code)?.likelihood ?? DeductionEngine.LEAK;
        const lb = this.rule(s.code, b.cause.code)?.likelihood ?? DeductionEngine.LEAK;
        return { symptom: s, discrimination: Math.abs(la - lb) };
      })
      .filter((q) => q.discrimination >= 0.3)
      .sort((x, y) => y.discrimination - x.discrimination)
      .slice(0, max);
  }

  private matchEvidence(text: string): EvidencePattern[] {
    if (!text.trim()) return [];
    return this.kb.evidencePatterns.filter((p) => {
      try {
        return new RegExp(p.pattern, 'i').test(text);
      } catch {
        return false; // un motif invalide en base ne doit jamais faire échouer un diagnostic
      }
    });
  }

  private rule(symptomCode: string, causeCode: string): Rule | undefined {
    return this.kb.rules.find((r) => r.symptomCode === symptomCode && r.causeCode === causeCode);
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const pct = (n: number) => `${Math.round(n * 100)} %`;
