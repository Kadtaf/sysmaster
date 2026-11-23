import type { EnrollmentDto, LearningPathSummary, LessonType, Difficulty, Platform } from '@sysmaster/contracts';

export interface PathRecord extends LearningPathSummary {
  id: string;
  courses: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    platform: Platform;
    difficulty: Difficulty;
    isPremium: boolean;
    lessonIds: string[];
  }[];
}

export interface OutlineLesson {
  id: string;
  slug: string;
  title: string;
  type: LessonType;
  estMinutes: number | null;
}

export interface CourseOutline {
  id: string;
  slug: string;
  title: string;
  summary: string;
  platform: Platform;
  difficulty: Difficulty;
  isPremium: boolean;
  modules: { title: string; lessons: OutlineLesson[] }[];
}

export abstract class AcademyRepository {
  abstract listPaths(): Promise<LearningPathSummary[]>;
  abstract findPath(slug: string): Promise<PathRecord | null>;
  abstract findCourseOutline(by: { slug: string } | { lessonId: string }): Promise<CourseOutline | null>;
  abstract findLessonContent(lessonId: string): Promise<{ contentMd: string; objectives: string[] } | null>;
  abstract completedLessonIds(userId: string, lessonIds: string[]): Promise<Set<string>>;
  abstract enrollmentsOf(userId: string): Promise<EnrollmentDto[]>;
  /** Idempotent. Recalcule la progression (des leçons ont pu être validées avant l'inscription). */
  abstract enroll(userId: string, pathId: string): Promise<void>;
  /**
   * Enregistre la validation, recalcule la progression des parcours de l'utilisateur et publie
   * learning.lesson.completed.v1 dans la même transaction. Sans effet si déjà validée.
   */
  abstract recordCompletion(userId: string, lessonId: string, courseId: string): Promise<{ alreadyCompleted: boolean }>;
}

export const flattenLessons = (outline: CourseOutline): OutlineLesson[] => outline.modules.flatMap((m) => m.lessons);
