import { Module } from '@nestjs/common';
import { AssistantService } from './application/assistant.service';
import { AiGateway, ConversationRepository } from './application/ports';
import { HttpAiGateway } from './infrastructure/http-ai.gateway';
import { PgConversationRepository } from './infrastructure/pg-conversation.repository';
import { AssistantController } from './interface/assistant.controller';

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantService,
    { provide: AiGateway, useClass: HttpAiGateway },
    { provide: ConversationRepository, useClass: PgConversationRepository },
  ],
})
export class AssistantModule {}
