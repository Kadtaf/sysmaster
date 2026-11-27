import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AssistantService } from './application/assistant.service';
import { AiQuota } from './application/ai-quota';
import { AiGateway, AiUsageRepository, ConversationRepository } from './application/ports';
import { PgAiUsageRepository } from './infrastructure/pg-ai-usage.repository';
import { HttpAiGateway } from './infrastructure/http-ai.gateway';
import { PgConversationRepository } from './infrastructure/pg-conversation.repository';
import { AgentProfilesController } from './interface/agent-profiles.controller';
import { AssistantController } from './interface/assistant.controller';

@Module({
  imports: [BillingModule],
  controllers: [AssistantController, AgentProfilesController],
  providers: [
    AssistantService,
    { provide: AiGateway, useClass: HttpAiGateway },
    { provide: ConversationRepository, useClass: PgConversationRepository },
    { provide: AiUsageRepository, useClass: PgAiUsageRepository },
    AiQuota,
  ],
  // Le diagnostic assisté réutilise la passerelle IA et le même quota.
  exports: [AiGateway, AiQuota, AiUsageRepository],
})
export class AssistantModule {}
