import { Module } from '@nestjs/common';
import { EditorialService } from './application/editorial.service';
import { CONTENT_KIND_ADAPTERS, RevisionRepository } from './application/ports';
import { CauseKindAdapter } from './infrastructure/cause-kind.adapter';
import { CommandKindAdapter } from './infrastructure/command-kind.adapter';
import { CourseKindAdapter } from './infrastructure/course-kind.adapter';
import { PathKindAdapter } from './infrastructure/path-kind.adapter';
import { PgRevisionRepository } from './infrastructure/pg-revision.repository';
import { EditorialController } from './interface/editorial.controller';

/**
 * Back-office éditorial : un workflow commun (domain/workflow.ts) et un adaptateur par type de
 * contenu. Ajouter un type = écrire ses règles de publication et son adaptateur.
 */
@Module({
  controllers: [EditorialController],
  providers: [
    CommandKindAdapter, CourseKindAdapter, PathKindAdapter, CauseKindAdapter,
    {
      provide: CONTENT_KIND_ADAPTERS,
      useFactory: (...adapters: unknown[]) => adapters,
      inject: [CommandKindAdapter, CourseKindAdapter, PathKindAdapter, CauseKindAdapter],
    },
    EditorialService,
    { provide: RevisionRepository, useClass: PgRevisionRepository },
  ],
})
export class EditorialModule {}
