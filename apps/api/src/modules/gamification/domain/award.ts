import { earnedBadges, Level, levelFor, nextStreak, xpForLab, xpForLesson, XP_DIAGNOSTIC_COMPLETED, XP_PATH_COMPLETED } from './rules';

export type Activity =
  | { kind: 'lesson'; estMinutes: number | null }
  | { kind: 'diagnostic' }
  | { kind: 'path' }
  | { kind: 'lab'; hintsUsed: number };

export interface PlayerStats {
  totalXp: number;
  level: number;
  streakDays: number;
  longestStreak: number;
  lastActivityDate: string | null;
  lessonsCompleted: number;
  diagnosticsCompleted: number;
  pathsCompleted: number;
  labsSolved: number;
  labsSolvedWithoutHint: number;
}

export const EMPTY_STATS: PlayerStats = {
  totalXp: 0, level: 1, streakDays: 0, longestStreak: 0, lastActivityDate: null,
  lessonsCompleted: 0, diagnosticsCompleted: 0, pathsCompleted: 0, labsSolved: 0, labsSolvedWithoutHint: 0,
};

export interface AwardResult {
  stats: PlayerStats;
  xp: { amount: number; reason: string };
  newBadges: string[];
  leveledUp: boolean;
}

/** Applique une activité à l'état d'un joueur. Pure : toute la logique de récompense est ici. */
export function award(
  before: PlayerStats,
  activity: Activity,
  ctx: { today: string; levels: Level[]; badges: { code: string; criteria: Record<string, unknown> }[]; alreadyEarned: string[] },
): AwardResult {
  const s = { ...before };
  let xp: AwardResult['xp'];

  switch (activity.kind) {
    case 'lesson':
      s.lessonsCompleted++;
      xp = { amount: xpForLesson(activity.estMinutes), reason: 'lesson.completed' };
      break;
    case 'diagnostic':
      s.diagnosticsCompleted++;
      xp = { amount: XP_DIAGNOSTIC_COMPLETED, reason: 'diagnostic.completed' };
      break;
    case 'path':
      s.pathsCompleted++;
      xp = { amount: XP_PATH_COMPLETED, reason: 'path.completed' };
      break;
    case 'lab':
      s.labsSolved++;
      if (activity.hintsUsed === 0) s.labsSolvedWithoutHint++;
      xp = { amount: xpForLab(activity.hintsUsed), reason: 'lab.solved' };
      break;
  }

  // La série compte les jours où l'on apprend ou pratique ; terminer un parcours en est la conséquence.
  if (activity.kind !== 'path') {
    s.streakDays = nextStreak(s.lastActivityDate, ctx.today, s.streakDays);
    s.longestStreak = Math.max(s.longestStreak, s.streakDays);
    if (!s.lastActivityDate || ctx.today > s.lastActivityDate) s.lastActivityDate = ctx.today;
  }

  s.totalXp += xp.amount;
  s.level = levelFor(s.totalXp, ctx.levels).current.level;

  const newBadges = earnedBadges(ctx.badges, s).filter((b) => !ctx.alreadyEarned.includes(b));
  return { stats: s, xp, newBadges, leveledUp: s.level > before.level };
}
