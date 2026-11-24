import { earnedBadges, leaderboardName, levelFor, nextStreak, xpForLab, xpForLesson } from './rules';

const levels = [
  { level: 1, minXp: 0, title: 'Curieux' },
  { level: 2, minXp: 100, title: 'Apprenti' },
  { level: 3, minXp: 300, title: 'Dépanneur' },
];

describe('gamification', () => {
  it('XP de leçon proportionnelle à la durée, plafonnée', () => {
    expect(xpForLesson(15)).toBe(25);
    expect(xpForLesson(null)).toBe(20);
    expect(xpForLesson(120)).toBe(50);
  });

  it('niveau et niveau suivant', () => {
    expect(levelFor(0, levels)).toEqual({ current: levels[0], next: levels[1] });
    expect(levelFor(150, levels).current.title).toBe('Apprenti');
    expect(levelFor(5000, levels)).toEqual({ current: levels[2], next: null });
  });

  it('série : +1 le lendemain, inchangée le même jour, remise à 1 après un trou', () => {
    expect(nextStreak(null, '2026-11-23', 0)).toBe(1);
    expect(nextStreak('2026-11-23', '2026-11-23', 4)).toBe(4);
    expect(nextStreak('2026-11-22', '2026-11-23', 4)).toBe(5);
    expect(nextStreak('2026-11-20', '2026-11-23', 4)).toBe(1);
    expect(nextStreak('2026-12-31', '2027-01-01', 9)).toBe(10);
  });

  it('badges : tous les critères connus doivent être atteints', () => {
    const badges = [
      { code: 'first_lesson', criteria: { lessons_completed: 1 } },
      { code: 'streak_7', criteria: { streak_days: 7 } },
      { code: 'lab_no_hint', criteria: { event: 'labs.lab.solved.v1', hints_used: 0 } },
      { code: 'vide', criteria: {} },
    ];
    const stats = { lessonsCompleted: 3, diagnosticsCompleted: 0, pathsCompleted: 0, streakDays: 2, labsSolved: 0, labsSolvedWithoutHint: 0 };
    expect(earnedBadges(badges, stats)).toEqual(['first_lesson']);
    const labBadges = [{ code: 'lab_no_hint', criteria: { labs_solved_without_hint: 1 } }];
    expect(earnedBadges(labBadges, stats)).toEqual([]);
    expect(earnedBadges(labBadges, { ...stats, labsSolved: 1, labsSolvedWithoutHint: 1 })).toEqual(['lab_no_hint']);
  });

  it('XP de lab : sans indice rapporte le plus, jamais moins de 10', () => {
    expect([0, 1, 2, 3, 4, 9].map(xpForLab)).toEqual([60, 30, 20, 10, 10, 10]);
  });

  it('nom abrégé au classement', () => {
    expect(leaderboardName('Alice Martin')).toBe('Alice M.');
    expect(leaderboardName('Jean Pierre de la Fontaine')).toBe('Jean F.');
    expect(leaderboardName('Nadia')).toBe('Nadia');
    expect(leaderboardName('  ')).toBe('Anonyme');
  });
});
