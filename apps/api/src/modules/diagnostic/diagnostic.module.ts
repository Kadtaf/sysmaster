import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssistantModule } from '../assistant/assistant.module';
import { AnalyzeProblemHandler } from './application/analyze-problem.command';
import { ListSymptomsHandler } from './application/list-symptoms.query';
import { AssistedSymptomExtractor, DiagnosticKnowledgePort, DiagnosticSessionRepository } from './application/ports';
import { AiSymptomExtractor } from './infrastructure/ai-symptom-extractor';
import { PgDiagnosticKnowledgeAdapter } from './infrastructure/pg-diagnostic-knowledge.adapter';
import { PgDiagnosticSessionRepository } from './infrastructure/pg-diagnostic-session.repository';
import { DiagnosticController } from './interface/diagnostic.controller';

@Module({
  imports: [CqrsModule, AssistantModule],
  controllers: [DiagnosticController],
  providers: [
    AnalyzeProblemHandler,
    ListSymptomsHandler,
    // Ports → adaptateurs : c'est ici, et seulement ici, que l'on choisit l'infrastructure.
    { provide: DiagnosticKnowledgePort, useClass: PgDiagnosticKnowledgeAdapter },
    { provide: DiagnosticSessionRepository, useClass: PgDiagnosticSessionRepository },
    { provide: AssistedSymptomExtractor, useClass: AiSymptomExtractor },
  ],
})
export class DiagnosticModule {}
