import type { PracticeQuizDto, QuizSummaryDto } from '@sysmaster/contracts';
import type { KeyedQuestion } from '../domain/scoring';

export abstract class QuizRepository {
  /** Quiz publiés liés à une fiche. */
  abstract forCommand(commandSlug: string): Promise<QuizSummaryDto[]>;
  /** Quiz publié, sans les réponses ; null s'il n'existe pas. */
  abstract find(slug: string): Promise<(PracticeQuizDto & { id: string }) | null>;
  /** Réponses et explications, lues seulement pour corriger. */
  abstract key(quizId: string): Promise<KeyedQuestion[]>;
  abstract recordAttempt(quizId: string, userId: string, answers: Record<string, string[]>, score: number, passed: boolean): Promise<void>;
}
