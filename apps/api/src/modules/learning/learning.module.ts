import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CompleteLessonHandler, EnrollHandler } from './application/commands';
import { AcademyRepository } from './application/ports';
import {
  GetCourseHandler, GetLessonHandler, GetPathHandler, ListPathsHandler, MyEnrollmentsHandler, NextLessonsHandler, SkillProgressHandler,
} from './application/queries';
import { ContentPublishedConsumer } from './infrastructure/content-published.consumer';
import { PgAcademyRepository } from './infrastructure/pg-academy.repository';
import { LearningController } from './interface/learning.controller';

/** Académie : parcours, cours, leçons et progression (Phase 2, architecture hexagonale). */
@Module({
  imports: [CqrsModule],
  controllers: [LearningController],
  providers: [
    ListPathsHandler, GetPathHandler, GetCourseHandler, GetLessonHandler, MyEnrollmentsHandler, SkillProgressHandler, NextLessonsHandler,
    EnrollHandler, CompleteLessonHandler,
    PgAcademyRepository,
    { provide: AcademyRepository, useExisting: PgAcademyRepository },
    ContentPublishedConsumer,
  ],
})
export class LearningModule {}
