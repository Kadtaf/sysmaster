import { award, EMPTY_STATS } from './award';

const ctx = {
  today: '2026-11-23',
  levels: [
    { level: 1, minXp: 0, title: 'Curieux' },
    { level: 2, minXp: 100, title: 'Apprenti' },
  ],
  badges: [
    { code: 'first_lesson', criteria: { lessons_completed: 1 } },
    { code: 'path_completed', criteria: { paths_completed: 1 } },
  ],
  alreadyEarned: [] as string[],
};

describe('award', () => {
  it('première leçon : XP, série démarrée, badge', () => {
    const r = award(EMPTY_STATS, { kind: 'lesson', estMinutes: 15 }, ctx);
    expect(r.xp).toEqual({ amount: 25, reason: 'lesson.completed' });
    expect(r.stats).toMatchObject({ totalXp: 25, lessonsCompleted: 1, streakDays: 1, lastActivityDate: '2026-11-23' });
    expect(r.newBadges).toEqual(['first_lesson']);
  });

  it('un badge déjà obtenu n\'est pas redonné', () => {
    const r = award({ ...EMPTY_STATS, lessonsCompleted: 1 }, { kind: 'lesson', estMinutes: 10 }, { ...ctx, alreadyEarned: ['first_lesson'] });
    expect(r.newBadges).toEqual([]);
  });

  it('terminer un parcours fait monter de niveau sans toucher à la série', () => {
    const before = { ...EMPTY_STATS, totalXp: 50, streakDays: 3, lastActivityDate: '2026-11-20' };
    const r = award(before, { kind: 'path' }, ctx);
    expect(r.stats).toMatchObject({ totalXp: 250, level: 2, streakDays: 3, lastActivityDate: '2026-11-20', pathsCompleted: 1 });
    expect(r.leveledUp).toBe(true);
    expect(r.newBadges).toEqual(['path_completed']);
  });

  it('réponse acceptée : XP d’entraide et badge, sans toucher à la série', () => {
    const before = { ...EMPTY_STATS, streakDays: 3, lastActivityDate: '2026-11-20' };
    const r = award(before, { kind: 'answer_accepted' }, { ...ctx, badges: [{ code: 'helper', criteria: { answers_accepted: 1 } }] });
    expect(r.xp).toEqual({ amount: 25, reason: 'community.answer_accepted' });
    expect(r.stats).toMatchObject({ answersAccepted: 1, streakDays: 3, lastActivityDate: '2026-11-20' });
    expect(r.newBadges).toEqual(['helper']);
  });

  it('une série interrompue repart à 1 mais la meilleure série est conservée', () => {
    const r = award({ ...EMPTY_STATS, streakDays: 5, longestStreak: 5, lastActivityDate: '2026-11-10' }, { kind: 'diagnostic' }, ctx);
    expect(r.stats).toMatchObject({ streakDays: 1, longestStreak: 5, diagnosticsCompleted: 1, totalXp: 15 });
  });
});
