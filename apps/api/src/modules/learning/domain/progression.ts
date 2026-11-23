/**
 * Règles de progression de l'académie. Pures, sans framework : testées seules.
 *
 * Principe pédagogique : une leçon s'appuie sur les précédentes. On peut LIRE toute leçon
 * (curiosité, révision, référencement), mais on ne peut la VALIDER qu'après avoir validé
 * celle qui la précède dans le cours. La progression mesure donc une compréhension cumulée.
 */
export type LessonStatus = 'completed' | 'available' | 'locked';

export interface OrderedLesson {
  id: string;
  title: string;
}

export interface LessonState {
  id: string;
  status: LessonStatus;
  /** Leçon à valider d'abord, si verrouillée. */
  blockedBy: OrderedLesson | null;
}

/** @param lessons leçons d'un cours dans l'ordre (module puis position) */
export function lessonStates(lessons: OrderedLesson[], completed: ReadonlySet<string>): LessonState[] {
  return lessons.map((l, i) => {
    if (completed.has(l.id)) return { id: l.id, status: 'completed', blockedBy: null };
    const previous = lessons[i - 1];
    if (!previous || completed.has(previous.id)) return { id: l.id, status: 'available', blockedBy: null };
    // Première leçon non validée avant celle-ci : c'est elle qu'il faut faire en premier.
    const firstMissing = lessons.slice(0, i).find((x) => !completed.has(x.id))!;
    return { id: l.id, status: 'locked', blockedBy: firstMissing };
  });
}

export class LessonLockedError extends Error {
  constructor(readonly blockedBy: OrderedLesson) {
    super(`Validez d'abord « ${blockedBy.title} » : cette leçon s'appuie dessus.`);
  }
}

/** Vérifie qu'une leçon peut être validée ; idempotent si elle l'est déjà. */
export function assertCanComplete(lessons: OrderedLesson[], completed: ReadonlySet<string>, lessonId: string): void {
  const state = lessonStates(lessons, completed).find((s) => s.id === lessonId);
  if (!state) throw new Error(`Leçon ${lessonId} absente du cours`);
  if (state.status === 'locked') throw new LessonLockedError(state.blockedBy!);
}

/** Pourcentage arrondi à 2 décimales ; 0 si le parcours ne contient encore aucune leçon. */
export function progressPct(totalLessons: number, completedLessons: number): number {
  if (totalLessons <= 0) return 0;
  return Math.round((Math.min(completedLessons, totalLessons) / totalLessons) * 10000) / 100;
}
