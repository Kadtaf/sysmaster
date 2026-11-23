import { HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AskAssistantInput, AssistantReplyDto } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { conversationTitle, dailyQuota } from '../domain/quota';
import { AiGateway, AiUnavailableError, ConversationRepository } from './ports';

const HISTORY_TURNS = 4;

@Injectable()
export class AssistantService {
  constructor(
    private readonly ai: AiGateway,
    private readonly conversations: ConversationRepository,
  ) {}

  private quota(user: AuthenticatedUser) {
    return dailyQuota(user.roles, Number(process.env.ASSISTANT_DAILY_QUOTA ?? 30));
  }

  async ask(user: AuthenticatedUser, input: AskAssistantInput): Promise<AssistantReplyDto> {
    const quota = this.quota(user);
    const used = await this.conversations.questionsSince(user.id, new Date(Date.now() - 24 * 3600 * 1000));
    if (used >= quota) {
      throw new HttpException(
        { message: `Vous avez posé ${used} questions en 24 heures, le maximum de votre compte. Réessayez plus tard.`, quota },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let conversationId = input.conversationId;
    if (conversationId && !(await this.conversations.ownedBy(conversationId, user.id))) throw new NotFoundException('Conversation introuvable');
    const history = conversationId
      ? (await this.conversations.turns(conversationId))
          .filter((t) => t.reply)
          .slice(-HISTORY_TURNS)
          .map((t) => ({ question: t.question, summary: t.reply!.summary }))
      : [];
    conversationId ??= await this.conversations.create(user.id, conversationTitle(input.question));

    try {
      const res = await this.ai.ask({ question: input.question, platform: input.platform, level: input.level, history });
      const messageId = await this.conversations.saveTurn(conversationId, input.question, res);
      return {
        conversationId, messageId, answer: res.answer, agent: res.agent, domain: res.domain, outcome: res.outcome,
        remainingToday: Math.max(0, quota - used - 1),
      };
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      // La question est gardée (et comptée) : l'utilisateur la retrouve dans son historique.
      await this.conversations.saveTurn(conversationId, input.question, null, err.message);
      throw new ServiceUnavailableException('L’assistant est momentanément indisponible. Votre question est enregistrée ; réessayez dans un instant.');
    }
  }

  list(user: AuthenticatedUser) {
    return this.conversations.list(user.id);
  }

  async turns(user: AuthenticatedUser, conversationId: string) {
    if (!(await this.conversations.ownedBy(conversationId, user.id))) throw new NotFoundException('Conversation introuvable');
    return this.conversations.turns(conversationId);
  }

  async feedback(user: AuthenticatedUser, messageId: string, rating: 1 | -1, comment?: string) {
    if (!(await this.conversations.feedback(messageId, user.id, rating, comment))) throw new NotFoundException('Réponse introuvable');
  }
}
