import { Module } from '@nestjs/common';
import { AssistantModule } from './modules/assistant/assistant.module';
import { DatabaseModule } from './shared/database.module';
import { IamModule } from './modules/iam/iam.module';
import { EventsModule } from './shared/events/events.module';
import { EditorialModule } from './modules/editorial/editorial.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ObservabilityModule } from './shared/observability/observability.module';
import { HealthModule } from './modules/health/health.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { DiagnosticModule } from './modules/diagnostic/diagnostic.module';
import { LearningModule } from './modules/learning/learning.module';
import { LabsModule } from './modules/labs/labs.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { CommunityModule } from './modules/community/community.module';
import { SecurityModule } from './shared/security/security.module';

@Module({
  imports: [DatabaseModule, EventsModule, ObservabilityModule, IamModule, SecurityModule, HealthModule, LearningModule, KnowledgeModule, DiagnosticModule, GamificationModule, DashboardModule, EditorialModule, AssistantModule, AssessmentModule, LabsModule, CommunityModule],
})
export class AppModule {}
