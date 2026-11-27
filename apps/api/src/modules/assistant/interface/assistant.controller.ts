import { Body, Controller, Get, HttpCode, HttpException, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AskAssistantSchema, AssistantFeedbackSchema, type AssistantReplyDto, type AssistantStreamEvent } from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser } from '../../iam/interface/auth.decorators';
import { AssistantService } from '../application/assistant.service';
import { LIMITS, RateLimit } from '../../../shared/security/rate-limit';

/** Ce que le contrôleur utilise de la réponse Express (sans dépendre de ses types). */
interface SseResponse {
  status(code: number): SseResponse;
  set(headers: Record<string, string>): SseResponse;
  flushHeaders(): void;
  write(chunk: string): boolean;
  end(): void;
}

@ApiTags('assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  @RateLimit(LIMITS.ai)
  @HttpCode(200)
  @ApiOperation({ summary: 'Pose une question à l’assistant : réponse structurée (pourquoi, comment, risques), citée, avec garde-fous' })
  ask(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<AssistantReplyDto> {
    return this.assistant.ask(user, parse(AskAssistantSchema, body));
  }

  @Post('ask/stream')
  @RateLimit(LIMITS.ai)
  @ApiOperation({
    summary: 'Même question, en flux (Server-Sent Events) : meta, delta (résumé et explication), puis reply ; les étapes et commandes n’arrivent qu’avec reply, après les garde-fous',
  })
  async askStream(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown, @Res() res: SseResponse): Promise<void> {
    const input = parse(AskAssistantSchema, body);
    // L'en-tête 200 ne part qu'au premier événement : un quota atteint ou un service injoignable
    // reste une erreur HTTP ordinaire (429, 503), traitée par les filtres de Nest.
    let open = false;
    const send = (e: AssistantStreamEvent) => {
      if (!open) {
        res.status(200).set({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
        res.flushHeaders();
        open = true;
      }
      res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    };
    try {
      send({ event: 'reply', data: await this.assistant.askStream(user, input, send) });
    } catch (err) {
      if (!open) throw err;
      const status = err instanceof HttpException ? err.getStatus() : 500;
      const message = err instanceof HttpException ? err.message : 'Erreur interne.';
      send({ event: 'error', data: { message, status } });
    }
    res.end();
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Mes conversations (50 dernières)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.assistant.list(user);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Questions et réponses d’une de mes conversations' })
  turns(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistant.turns(user, id);
  }

  @Put('messages/:id/feedback')
  @HttpCode(204)
  @ApiOperation({ summary: 'Évaluer une réponse (utile / pas utile) : alimente l’évaluation continue' })
  async feedback(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { rating, comment } = parse(AssistantFeedbackSchema, body);
    await this.assistant.feedback(user, id, rating, comment);
  }
}
