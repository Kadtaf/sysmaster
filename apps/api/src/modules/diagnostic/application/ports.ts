import type { AuthenticatedUser } from '../../iam/domain/identity';
import { KnowledgeSnapshot, Symptom } from '../domain/model';
import { DeductionResult } from '../domain/model';

/** Port de lecture des connaissances de diagnostic (règles, causes, symptômes). */
export abstract class DiagnosticKnowledgePort {
  abstract load(platform: string): Promise<KnowledgeSnapshot>;
  abstract listSymptoms(platform: string): Promise<Symptom[]>;
}

export interface NewDiagnosticSession {
  userId: string | null;
  platform: string;
  description: string;
  symptoms: { code: string; source: 'user_selected' | 'extracted_text' | 'extracted_ai' }[];
  result: DeductionResult;
}

/**
 * Port d'écriture. L'adaptateur DOIT enregistrer la session, ses hypothèses et l'événement
 * `diagnostic.session.completed.v1` dans la même transaction (pattern outbox).
 */
export abstract class DiagnosticSessionRepository {
  abstract saveCompleted(session: NewDiagnosticSession): Promise<string>;
}

export interface AssistedExtraction {
  codes: string[];
  quotes: { code: string; quote: string; source: 'description' | 'evidence' }[];
  logFindings: { summary: string; quote: string }[];
  remainingToday: number;
}

/**
 * Repérage des symptômes par l'IA. Facultatif : sans lui (ou s'il est indisponible), le diagnostic
 * continue avec l'extraction par synonymes. L'adaptateur applique le quota et enregistre l'usage.
 */
export abstract class AssistedSymptomExtractor {
  /** Lève SymptomExtractionUnavailableError si le service IA ne répond pas. */
  abstract extract(user: AuthenticatedUser, platform: string, description: string, evidence: string, catalogue: Symptom[]): Promise<AssistedExtraction>;
}

export class SymptomExtractionUnavailableError extends Error {}
