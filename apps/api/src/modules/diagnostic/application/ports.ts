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
  symptoms: { code: string; source: 'user_selected' | 'extracted_text' }[];
  result: DeductionResult;
}

/**
 * Port d'écriture. L'adaptateur DOIT enregistrer la session, ses hypothèses et l'événement
 * `diagnostic.session.completed.v1` dans la même transaction (pattern outbox).
 */
export abstract class DiagnosticSessionRepository {
  abstract saveCompleted(session: NewDiagnosticSession): Promise<string>;
}
