/**
 * Modèle du domaine Diagnostic. Aucun import de framework : ce code est testable seul.
 */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface Symptom {
  code: string;
  label: string;
  platform: string;
  synonyms: string[];
}

export interface ActionStep {
  step: string;
  why: string;
  risk: RiskLevel;
}

export interface Cause {
  code: string;
  label: string;
  /** Probabilité a priori P(cause), avant toute observation. */
  prior: number;
  explanation: string;
  actionPlan: ActionStep[];
}

/** P(symptôme | cause) : à quel point ce symptôme est attendu si la cause est la bonne. */
export interface Rule {
  symptomCode: string;
  causeCode: string;
  likelihood: number;
  rationale: string;
}

/** Motif reconnaissable dans un journal qui renforce une cause (ex. Event ID 41 → alimentation). */
export interface EvidencePattern {
  name: string;
  pattern: string;
  causeCode: string;
  boost: number;
}

export interface KnowledgeSnapshot {
  symptoms: Symptom[];
  causes: Cause[];
  rules: Rule[];
  evidencePatterns: EvidencePattern[];
}

export interface Hypothesis {
  cause: Cause;
  probability: number;
  reasoning: string[];
}

export interface ClarifyingQuestion {
  symptom: Symptom;
  /** Pouvoir de séparation entre les deux meilleures hypothèses (plus grand = plus utile). */
  discrimination: number;
}

export interface DeductionResult {
  hypotheses: Hypothesis[];
  confidence: number;
  matchedEvidence: { name: string; causeCode: string }[];
  clarifyingQuestions: ClarifyingQuestion[];
}
