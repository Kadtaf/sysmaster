import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AnalyzeProblemHandler } from './application/analyze-problem.command';
import { ListSymptomsHandler } from './application/list-symptoms.query';
import { DiagnosticKnowledgePort, DiagnosticSessionRepository } from './application/ports';
import { PgDiagnosticKnowledgeAdapter } from './infrastructure/pg-diagnostic-knowledge.adapter';
import { PgDiagnosticSessionRepository } from './infrastructure/pg-diagnostic-session.repository';
import { DiagnosticController } from './interface/diagnostic.controller';

@Module({
  imports: [CqrsModule],
  controllers: [DiagnosticController],
  providers: [
    AnalyzeProblemHandler,
    ListSymptomsHandler,
    // Ports → adaptateurs : c'est ici, et seulement ici, que l'on choisit l'infrastructure.
    { provide: DiagnosticKnowledgePort, useClass: PgDiagnosticKnowledgeAdapter },
    { provide: DiagnosticSessionRepository, useClass: PgDiagnosticSessionRepository },
  ],
})
export class DiagnosticModule {}
