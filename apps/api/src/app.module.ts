import { Module } from '@nestjs/common';
import { DatabaseModule } from './shared/database.module';
import { IamModule } from './modules/iam/iam.module';
import { EventsModule } from './shared/events/events.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { DiagnosticModule } from './modules/diagnostic/diagnostic.module';
import { LearningModule } from './modules/learning/learning.module';

@Module({
  imports: [DatabaseModule, EventsModule, IamModule, HealthModule, LearningModule, KnowledgeModule, DiagnosticModule, GamificationModule, DashboardModule],
})
export class AppModule {}
