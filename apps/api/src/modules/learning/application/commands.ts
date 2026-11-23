import { ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { CompleteLessonResult, EnrollmentDto } from '@sysmaster/contracts';
import { assertCanComplete, LessonLockedError } from '../domain/progression';
import { AcademyRepository, flattenLessons } from './ports';

export class EnrollCommand {
  constructor(readonly pathSlug: string, readonly userId: string) {}
}

@CommandHandler(EnrollCommand)
export class EnrollHandler implements ICommandHandler<EnrollCommand, EnrollmentDto> {
  constructor(private readonly repo: AcademyRepository) {}

  async execute({ pathSlug, userId }: EnrollCommand): Promise<EnrollmentDto> {
    const path = await this.repo.findPath(pathSlug);
    if (!path) throw new NotFoundException(`Parcours « ${pathSlug} » introuvable`);
    await this.repo.enroll(userId, path.id);
    return (await this.repo.enrollmentsOf(userId)).find((e) => e.pathSlug === pathSlug)!;
  }
}

export class CompleteLessonCommand {
  constructor(readonly lessonId: string, readonly userId: string) {}
}

@CommandHandler(CompleteLessonCommand)
export class CompleteLessonHandler implements ICommandHandler<CompleteLessonCommand, CompleteLessonResult> {
  constructor(private readonly repo: AcademyRepository) {}

  async execute({ lessonId, userId }: CompleteLessonCommand): Promise<CompleteLessonResult> {
    const outline = await this.repo.findCourseOutline({ lessonId });
    if (!outline) throw new NotFoundException('Leçon introuvable');
    const lessons = flattenLessons(outline);
    const done = await this.repo.completedLessonIds(userId, lessons.map((l) => l.id));
    try {
      assertCanComplete(lessons, done, lessonId);
    } catch (err) {
      if (err instanceof LessonLockedError) {
        const blocker = lessons.find((l) => l.id === err.blockedBy.id)!;
        throw new ConflictException({ message: err.message, blockedBy: { slug: blocker.slug, title: blocker.title } });
      }
      throw err;
    }
    const { alreadyCompleted } = await this.repo.recordCompletion(userId, lessonId, outline.id);
    const next = lessons[lessons.findIndex((l) => l.id === lessonId) + 1];
    return {
      lessonId,
      alreadyCompleted,
      next: next ? { slug: next.slug, title: next.title } : null,
      enrollments: await this.repo.enrollmentsOf(userId),
    };
  }
}
