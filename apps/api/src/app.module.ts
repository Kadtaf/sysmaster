import { Module } from '@nestjs/common';
import { DatabaseModule } from './shared/database.module';
import { HealthModule } from './modules/health/health.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { DiagnosticModule } from './modules/diagnostic/diagnostic.module';
import { LearningModule } from './modules/learning/learning.module';

@Module({
  imports: [DatabaseModule, HealthModule, LearningModule, KnowledgeModule, DiagnosticModule],
})
export class AppModule {}
