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
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  latencyMs: number;
  outcome: 'answered' | 'refused';
}

/** Port vers le service IA (FastAPI). */
export abstract class AiGateway {
  abstract ask(req: AiAskRequest): Promise<AiAskResponse>;
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
  abstract questionsSince(userId: string, since: Date): Promise<number>;
  /** null si la conversation n'existe pas ou n'appartient pas à l'utilisateur. */
  abstract ownedBy(conversationId: string, userId: string): Promise<boolean>;
  abstract create(userId: string, title: string): Promise<string>;
  abstract turns(conversationId: string): Promise<StoredTurn[]>;
  abstract list(userId: string): Promise<{ id: string; title: string; createdAt: string }[]>;
  /** Enregistre la question, la réponse et la trace d'exécution dans une même transaction ; renvoie l'id de la réponse. */
  abstract saveTurn(conversationId: string, question: string, res: AiAskResponse | null, failure?: string): Promise<string>;
  abstract feedback(messageId: string, userId: string, rating: 1 | -1, comment?: string): Promise<boolean>;
}
