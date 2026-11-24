import type { AssistantAnswer } from '@sysmaster/contracts';

export interface AiAskRequest {
  question: string;
  platform?: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  history: { question: string; summary: string }[];
}

export interface AiAskResponse {
  answer: AssistantAnswer;
  agent: 'tutor' | 'diagnostician';
  domain: string | null;
  model: string;
  usage: AiUsage;
  latencyMs: number;
  outcome: 'answered' | 'refused';
}

export interface AiUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

export interface AiExtractRequest {
  platform: string;
  description: string;
  evidence: string;
  catalogue: { code: string; label: string }[];
}

export interface AiExtractResponse {
  symptoms: { code: string; quote: string; source: 'description' | 'evidence' }[];
  logFindings: { summary: string; quote: string }[];
  notes: string[];
  model: string;
  usage: AiUsage;
  latencyMs: number;
  outcome: 'answered' | 'refused';
}

export interface AiQuizRequest {
  title: string;
  platform?: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  /** Contenu source (fiche rendue en texte) : seule base des questions. */
  text: string;
  count: number;
}

export interface AiQuizResponse {
  questions: {
    type: 'single' | 'multiple';
    promptMd: string;
    choices: { id: string; text: string }[];
    answer: string[];
    explanation: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  }[];
  notes: string[];
  model: string;
  usage: AiUsage;
  latencyMs: number;
  outcome: 'answered' | 'refused';
}

export interface AiLabRequest {
  topic: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  /** Un lab publié, en JSON : modèle de forme. */
  example: string;
  /** Commandes simulées et vérifications disponibles. */
  reference: string;
  /** Passe de correction : proposition précédente (JSON) et problèmes relevés. */
  previous?: string;
  issues?: string[];
}

export interface AiLabResponse {
  lab: {
    slug: string; title: string; briefMd: string; objectives: string[]; hints: string[]; solutionMd: string;
    machine: unknown; validators: unknown; walkthrough: string[];
  } | null;
  notes: string[];
  /** Proposition brute (JSON), renvoyée telle quelle pour une passe de correction. */
  raw: string | null;
  model: string;
  usage: AiUsage;
  latencyMs: number;
  outcome: 'answered' | 'refused';
}

/** Événements intermédiaires du flux : routage et documents consultés, puis texte au fil de la génération. */
export type AiStreamEvent =
  | { event: 'meta'; data: { agent: 'tutor' | 'diagnostician'; domain: string | null; consulted: { ref: number; title: string; kind: 'kb_command' | 'official_doc' }[] } }
  | { event: 'delta'; data: { field: 'summary' | 'explanation'; text: string } };

/** Port vers le service IA (FastAPI). */
export abstract class AiGateway {
  abstract ask(req: AiAskRequest): Promise<AiAskResponse>;
  /**
   * Même question, en flux : `onEvent` reçoit les événements intermédiaires, la promesse rend la réponse
   * validée par les garde-fous. Par défaut, sans flux (les doublures de test n'ont rien à implémenter).
   */
  askStream(req: AiAskRequest, _onEvent: (e: AiStreamEvent) => void): Promise<AiAskResponse> {
    return this.ask(req);
  }
  /** Repère des symptômes d'un catalogue fermé dans un texte libre ou un journal (le moteur de déduction décide ensuite). */
  abstract extractSymptoms(req: AiExtractRequest): Promise<AiExtractResponse>;
  /** Propose des questions de quiz à partir d'un contenu ; une personne les relit avant publication. */
  generateQuiz(_req: AiQuizRequest): Promise<AiQuizResponse> {
    return Promise.reject(new AiUnavailableError('génération de quiz non prise en charge'));
  }
  /** Propose un lab simulé complet ; l'API le rejoue sur le simulateur, puis une personne le relit. */
  generateLab(_req: AiLabRequest): Promise<AiLabResponse> {
    return Promise.reject(new AiUnavailableError('génération de labs non prise en charge'));
  }
}

export interface AiRun {
  userId: string;
  agentCode: string;
  model: string;
  latencyMs: number | null;
  outcome: 'ok' | 'refused' | 'error';
  usage?: AiUsage;
  failure?: string;
}

/** Usage de l'IA, toutes fonctions confondues : base du quota quotidien et du suivi des coûts. */
export abstract class AiUsageRepository {
  abstract requestsSince(userId: string, since: Date): Promise<number>;
  abstract record(run: AiRun): Promise<void>;
}

export class AiUnavailableError extends Error {}

export interface StoredTurn {
  messageId: string;
  question: string;
  reply: AssistantAnswer | null;
  agent: string | null;
  createdAt: string;
}

export abstract class ConversationRepository {
  /** null si la conversation n'existe pas ou n'appartient pas à l'utilisateur. */
  abstract ownedBy(conversationId: string, userId: string): Promise<boolean>;
  abstract create(userId: string, title: string): Promise<string>;
  abstract turns(conversationId: string): Promise<StoredTurn[]>;
  abstract list(userId: string): Promise<{ id: string; title: string; createdAt: string }[]>;
  /** Enregistre la question, la réponse et la trace d'exécution dans une même transaction ; renvoie l'id de la réponse. */
  abstract saveTurn(userId: string, conversationId: string, question: string, res: AiAskResponse | null, failure?: string): Promise<string>;
  abstract feedback(messageId: string, userId: string, rating: 1 | -1, comment?: string): Promise<boolean>;
}
