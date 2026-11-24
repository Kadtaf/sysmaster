import { Injectable, NotFoundException } from '@nestjs/common';
import type { PracticeQuizDto, QuizAttemptInput, QuizAttemptResultDto, QuizSummaryDto } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { score } from '../domain/scoring';
import { QuizRepository } from './ports';

/** Quiz d'entraînement : illimités, corrigés côté serveur, chaque réponse expliquée (docs/03 §2.7). */
@Injectable()
export class PracticeService {
  constructor(private readonly quizzes: QuizRepository) {}

  forCommand(commandSlug: string): Promise<QuizSummaryDto[]> {
    return this.quizzes.forCommand(commandSlug);
  }

  async get(slug: string): Promise<PracticeQuizDto> {
    const q = await this.quizzes.find(slug);
    if (!q) throw new NotFoundException('Quiz introuvable');
    const { id: _id, ...dto } = q;
    return dto;
  }

  async attempt(user: AuthenticatedUser | null, slug: string, input: QuizAttemptInput): Promise<QuizAttemptResultDto> {
    const q = await this.quizzes.find(slug);
    if (!q) throw new NotFoundException('Quiz introuvable');
    const result = score(await this.quizzes.key(q.id), input.answers, q.passScore);
    // Un visiteur peut s'entraîner ; seule une tentative d'utilisateur connecté est conservée.
    if (user) await this.quizzes.recordAttempt(q.id, user.id, input.answers, result.score, result.passed);
    return { ...result, recorded: !!user };
  }
}
