import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database.module';
import { GamificationProfile, GamificationReadRepository, LeaderboardEntry } from '../application/ports';
import { leaderboardName, levelFor } from '../domain/rules';

@Injectable()
export class PgGamificationReadRepository extends GamificationReadRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async profile(userId: string): Promise<GamificationProfile> {
    const [stats, levels, badges, recent] = await Promise.all([
      this.db.query<Record<string, any>>('SELECT * FROM gamification.user_stats WHERE user_id = $1', [userId]),
      this.db.query<{ level: number; min_xp: string; title: string }>('SELECT level, min_xp, title FROM gamification.levels'),
      this.db.query<Record<string, any>>(
        `SELECT b.code, b.name, b.description, b.icon, b.rarity, ub.awarded_at
           FROM gamification.badges b
           LEFT JOIN gamification.user_badges ub ON ub.badge_code = b.code AND ub.user_id = $1
          ORDER BY ub.awarded_at IS NULL, ub.awarded_at DESC,
                   array_position(ARRAY['common','rare','epic','legendary'], b.rarity), b.name`,
        [userId],
      ),
      this.db.query<Record<string, any>>(
        `SELECT amount, reason, created_at FROM gamification.xp_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [userId],
      ),
    ]);
    const s = stats.rows[0];
    const totalXp = Number(s?.total_xp ?? 0);
    const { current, next } = levelFor(
      totalXp,
      levels.rows.map((l) => ({ level: l.level, minXp: Number(l.min_xp), title: l.title })),
    );
    return {
      totalXp,
      level: current.level,
      levelTitle: current.title,
      currentLevelXp: current.minXp,
      nextLevel: next && { level: next.level, title: next.title, minXp: next.minXp },
      streakDays: s?.streak_days ?? 0,
      longestStreak: s?.longest_streak ?? 0,
      lessonsCompleted: s?.lessons_completed ?? 0,
      diagnosticsCompleted: s?.diagnostics_completed ?? 0,
      pathsCompleted: s?.paths_completed ?? 0,
      showInLeaderboard: s?.show_in_leaderboard ?? true,
      badges: badges.rows.map((b) => ({
        code: b.code, name: b.name, description: b.description, icon: b.icon, rarity: b.rarity,
        earnedAt: b.awarded_at?.toISOString() ?? null,
      })),
      recentXp: recent.rows.map((x) => ({ amount: x.amount, reason: x.reason, at: x.created_at.toISOString() })),
    };
  }

  async leaderboard(limit: number, userId: string | null) {
    const toEntry = (r: Record<string, any>): LeaderboardEntry => ({
      position: Number(r.position),
      name: leaderboardName(r.display_name),
      totalXp: Number(r.total_xp),
      level: r.level,
      isMe: r.user_id === userId,
    });
    const top = await this.db.query<Record<string, any>>(
      'SELECT * FROM gamification.leaderboard ORDER BY position, display_name LIMIT $1',
      [limit],
    );
    let me: LeaderboardEntry | null = null;
    if (userId) {
      const mine = await this.db.query<Record<string, any>>('SELECT * FROM gamification.leaderboard WHERE user_id = $1', [userId]);
      me = mine.rows[0] ? toEntry(mine.rows[0]) : null;
    }
    return { top: top.rows.map(toEntry), me };
  }

  async setLeaderboardVisibility(userId: string, visible: boolean) {
    await this.db.query(
      `INSERT INTO gamification.user_stats (user_id, show_in_leaderboard) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET show_in_leaderboard = EXCLUDED.show_in_leaderboard`,
      [userId, visible],
    );
  }
}
