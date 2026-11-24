import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { EditorialService } from './application/editorial.service';
import { LabDraftService } from './application/lab-draft.service';
import { QuizDraftService } from './application/quiz-draft.service';
import { CONTENT_KIND_ADAPTERS, RevisionRepository } from './application/ports';
import { AgentProfileKindAdapter } from './infrastructure/agent-profile-kind.adapter';
import { CauseKindAdapter } from './infrastructure/cause-kind.adapter';
import { CommandKindAdapter } from './infrastructure/command-kind.adapter';
import { CourseKindAdapter } from './infrastructure/course-kind.adapter';
import { PathKindAdapter } from './infrastructure/path-kind.adapter';
import { PgRevisionRepository } from './infrastructure/pg-revision.repository';
import { QuizKindAdapter } from './infrastructure/quiz-kind.adapter';
import { LabKindAdapter } from './infrastructure/lab-kind.adapter';
import { EditorialController } from './interface/editorial.controller';
import { LabDraftController } from './interface/lab-draft.controller';
import { QuizDraftController } from './interface/quiz-draft.controller';

/**
 * Back-office éditorial : un workflow commun (domain/workflow.ts) et un adaptateur par type de
 * contenu. Ajouter un type = écrire ses règles de publication et son adaptateur.
 */
@Module({
  // La passerelle IA et le quota commun servent aux brouillons de quiz.
  imports: [AssistantModule],
  controllers: [EditorialController, QuizDraftController, LabDraftController],
  providers: [
    CommandKindAdapter, CourseKindAdapter, PathKindAdapter, CauseKindAdapter, AgentProfileKindAdapter, QuizKindAdapter, LabKindAdapter,
    {
      provide: CONTENT_KIND_ADAPTERS,
      useFactory: (...adapters: unknown[]) => adapters,
      inject: [CommandKindAdapter, CourseKindAdapter, PathKindAdapter, CauseKindAdapter, AgentProfileKindAdapter, QuizKindAdapter, LabKindAdapter],
    },
    EditorialService,
    QuizDraftService,
    LabDraftService,
    { provide: RevisionRepository, useClass: PgRevisionRepository },
  ],
})
export class EditorialModule {}
