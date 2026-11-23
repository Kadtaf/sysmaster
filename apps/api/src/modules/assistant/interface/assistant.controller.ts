import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AskAssistantSchema, AssistantFeedbackSchema, type AssistantReplyDto } from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser } from '../../iam/interface/auth.decorators';
import { AssistantService } from '../application/assistant.service';

@ApiTags('assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pose une question à l’assistant : réponse structurée (pourquoi, comment, risques), citée, avec garde-fous' })
  ask(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<AssistantReplyDto> {
    return this.assistant.ask(user, parse(AskAssistantSchema, body));
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
