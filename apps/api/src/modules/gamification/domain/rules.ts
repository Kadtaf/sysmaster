/**
 * Règles de gamification. Principe : récompenser l'effort de compréhension et la régularité,
 * jamais la vitesse. Une leçon longue rapporte plus qu'une courte ; enchaîner 20 validations
 * en une minute ne rapporte rien de plus que de les faire calmement.
 */

/** XP d'une leçon : 10 de base + 1 par minute estimée, plafonné à 50. */
export function xpForLesson(estMinutes: number | null): number {
  return Math.min(50, 10 + Math.max(0, estMinutes ?? 10));
}

export const XP_DIAGNOSTIC_COMPLETED = 15;
export const XP_PATH_COMPLETED = 200;

export interface Level {
  level: number;
  minXp: number;
  title: string;
}

/** Niveau atteint et seuil du suivant (null au niveau maximal). */
export function levelFor(totalXp: number, levels: Level[]): { current: Level; next: Level | null } {
  const sorted = [...levels].sort((a, b) => a.minXp - b.minXp);
  let index = 0;
  sorted.forEach((l, i) => {
    if (totalXp >= l.minXp) index = i;
  });
  return { current: sorted[index], next: sorted[index + 1] ?? null };
}

/**
 * Série de jours consécutifs. `today` et `last` sont des dates calendaires (AAAA-MM-JJ)
 * dans le fuseau de l'utilisateur, pour qu'une leçon faite à 23 h 30 compte pour le bon jour.
 */
export function nextStreak(last: string | null, today: string, current: number): number {
  if (!last) return 1;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return Math.max(current, 1); // même jour (ou horloge en retard) : inchangé
  if (days === 1) return current + 1;
  return 1;
}

export interface StatsForBadges {
  lessonsCompleted: number;
  diagnosticsCompleted: number;
  pathsCompleted: number;
  streakDays: number;
}

const CRITERIA_FIELDS: Record<string, keyof StatsForBadges> = {
  lessons_completed: 'lessonsCompleted',
  diagnostics_completed: 'diagnosticsCompleted',
  paths_completed: 'pathsCompleted',
  streak_days: 'streakDays',
};

/**
 * Badges dont tous les critères sont atteints. Un critère inconnu (badge d'une phase future,
 * ex. « lab sans indice ») n'est jamais considéré comme atteint.
 */
export function earnedBadges(badges: { code: string; criteria: Record<string, unknown> }[], stats: StatsForBadges): string[] {
  return badges
    .filter(({ criteria }) => {
      const entries = Object.entries(criteria);
      return (
        entries.length > 0 &&
        entries.every(([key, min]) => {
          const field = CRITERIA_FIELDS[key];
          return field !== undefined && typeof min === 'number' && stats[field] >= min;
        })
      );
    })
    .map((b) => b.code);
}

/** Nom affiché au classement : prénom + initiale (« Alice M. »), pour limiter l'exposition. */
export function leaderboardName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || 'Anonyme';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
