import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { CourseDetail, EnrollmentDto, LearningPathDetail, LearningPathSummary, LessonDetail } from '@sysmaster/contracts';
import { lessonStates } from '../domain/progression';
import { AcademyRepository, flattenLessons } from './ports';

export class ListPathsQuery {}

@QueryHandler(ListPathsQuery)
export class ListPathsHandler implements IQueryHandler<ListPathsQuery, LearningPathSummary[]> {
  constructor(private readonly repo: AcademyRepository) {}
  execute() {
    return this.repo.listPaths();
  }
}

export class GetPathQuery {
  constructor(readonly slug: string, readonly userId: string | null) {}
}

@QueryHandler(GetPathQuery)
export class GetPathHandler implements IQueryHandler<GetPathQuery, LearningPathDetail> {
  constructor(private readonly repo: AcademyRepository) {}

  async execute({ slug, userId }: GetPathQuery): Promise<LearningPathDetail> {
    const path = await this.repo.findPath(slug);
    if (!path) throw new NotFoundException(`Parcours « ${slug} » introuvable`);
    const allLessons = path.courses.flatMap((c) => c.lessonIds);
    const done = userId ? await this.repo.completedLessonIds(userId, allLessons) : new Set<string>();
    const enrollment = userId ? (await this.repo.enrollmentsOf(userId)).find((e) => e.pathSlug === slug) ?? null : null;
    const { id: _id, courses, ...summary } = path;
    return {
      ...summary,
      enrollment,
      courses: courses.map(({ id: _cid, lessonIds, ...c }) => ({
        ...c,
        lessonCount: lessonIds.length,
        completedCount: lessonIds.filter((l) => done.has(l)).length,
      })),
    };
  }
}

export class GetCourseQuery {
  constructor(readonly slug: string, readonly userId: string | null) {}
}

@QueryHandler(GetCourseQuery)
export class GetCourseHandler implements IQueryHandler<GetCourseQuery, CourseDetail> {
  constructor(private readonly repo: AcademyRepository) {}

  async execute({ slug, userId }: GetCourseQuery): Promise<CourseDetail> {
    const outline = await this.repo.findCourseOutline({ slug });
    if (!outline) throw new NotFoundException(`Cours « ${slug} » introuvable`);
    const lessons = flattenLessons(outline);
    const states = userId
      ? new Map(lessonStates(lessons, await this.repo.completedLessonIds(userId, lessons.map((l) => l.id))).map((s) => [s.id, s.status]))
      : null;
    const { id: _id, modules, ...rest } = outline;
    return {
      ...rest,
      modules: modules.map((m) => ({
        title: m.title,
        lessons: m.lessons.map((l) => ({ ...l, status: states?.get(l.id) ?? null })),
      })),
    };
  }
}

export class GetLessonQuery {
  constructor(readonly courseSlug: string, readonly lessonSlug: string, readonly userId: string | null) {}
}

@QueryHandler(GetLessonQuery)
export class GetLessonHandler implements IQueryHandler<GetLessonQuery, LessonDetail> {
  constructor(private readonly repo: AcademyRepository) {}

  async execute({ courseSlug, lessonSlug, userId }: GetLessonQuery): Promise<LessonDetail> {
    const outline = await this.repo.findCourseOutline({ slug: courseSlug });
    const lessons = outline ? flattenLessons(outline) : [];
    const index = lessons.findIndex((l) => l.slug === lessonSlug);
    if (!outline || index < 0) throw new NotFoundException('Leçon introuvable');
    const lesson = lessons[index];
    const content = (await this.repo.findLessonContent(lesson.id))!;
    const state = userId
      ? lessonStates(lessons, await this.repo.completedLessonIds(userId, lessons.map((l) => l.id)))[index]
      : null;
    const ref = (l?: { slug: string; title: string }) => (l ? { slug: l.slug, title: l.title } : null);
    return {
      ...lesson,
      status: state?.status ?? null,
      courseSlug: outline.slug,
      courseTitle: outline.title,
      moduleTitle: outline.modules.find((m) => m.lessons.some((l) => l.id === lesson.id))!.title,
      contentMd: content.contentMd,
      objectives: content.objectives,
      blockedBy: ref(state?.blockedBy ? lessons.find((l) => l.id === state.blockedBy!.id) : undefined),
      previous: ref(lessons[index - 1]),
      next: ref(lessons[index + 1]),
    };
  }
}

export class MyEnrollmentsQuery {
  constructor(readonly userId: string) {}
}

@QueryHandler(MyEnrollmentsQuery)
export class MyEnrollmentsHandler implements IQueryHandler<MyEnrollmentsQuery, EnrollmentDto[]> {
  constructor(private readonly repo: AcademyRepository) {}
  execute({ userId }: MyEnrollmentsQuery) {
    return this.repo.enrollmentsOf(userId);
  }
}
