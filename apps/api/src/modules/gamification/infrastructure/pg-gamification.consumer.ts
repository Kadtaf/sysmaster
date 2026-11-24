import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DiagnosticSessionCompletedV1, LabSolvedV1, LessonCompletedV1, PathCompletedV1 } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { EventRegistry } from '../../../shared/events/event-registry';
import { StoredEvent } from '../../../shared/events/events';
import { Activity, award, PlayerStats } from '../domain/award';

/**
 * Adaptateur entrant : transforme les événements des autres contextes en activités de jeu.
 * Ne lit que son propre schéma (gamification) et l'identité partagée (iam.users, pour le fuseau).
 */
@Injectable()
export class PgGamificationConsumer implements OnModuleInit {
  constructor(private readonly registry: EventRegistry) {}

  onModuleInit() {
    this.registry.subscribe(
      'gamification',
      ['iam.user.registered.v1', 'learning.lesson.completed.v1', 'learning.path.completed.v1', 'diagnostic.session.completed.v1', 'labs.lab.solved.v1'],
      (event, tx) => this.handle(event, tx),
    );
  }

  async handle(event: StoredEvent<any>, tx: PoolClient): Promise<void> {
    switch (event.type) {
      case 'iam.user.registered.v1':
        await this.ensureStats(tx, event.payload.userId);
        return;
      case 'learning.lesson.completed.v1': {
        const p = event.payload as LessonCompletedV1;
        return this.apply(tx, p.userId, { kind: 'lesson', estMinutes: p.estMinutes ?? null }, event);
      }
      case 'learning.path.completed.v1': {
        const p = event.payload as PathCompletedV1;
        return this.apply(tx, p.userId, { kind: 'path' }, event);
      }
      case 'diagnostic.session.completed.v1': {
        const p = event.payload as DiagnosticSessionCompletedV1;
        if (p.userId) await this.apply(tx, p.userId, { kind: 'diagnostic' }, event); // diagnostic anonyme : rien à compter
        return;
      }
      case 'labs.lab.solved.v1': {
        const p = event.payload as LabSolvedV1;
        return this.apply(tx, p.userId, { kind: 'lab', hintsUsed: p.hintsUsed }, event);
      }
    }
  }

  private async ensureStats(tx: PoolClient, userId: string) {
    await tx.query(`INSERT INTO gamification.user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
  }

  private async apply(tx: PoolClient, userId: string, activity: Activity, event: StoredEvent) {
    await this.ensureStats(tx, userId);
    const { rows } = await tx.query<Record<string, any>>(
      `SELECT s.total_xp, s.level, s.streak_days, s.longest_streak, s.last_activity_date::text AS last_activity_date,
              s.lessons_completed, s.diagnostics_completed, s.paths_completed, s.labs_solved, s.labs_solved_without_hint,
              (($2::timestamptz) AT TIME ZONE coalesce(u.timezone, 'Europe/Paris'))::date::text AS today
         FROM gamification.user_stats s JOIN iam.users u ON u.id = s.user_id
        WHERE s.user_id = $1 FOR UPDATE OF s`,
      [userId, event.occurredAt],
    );
    const r = rows[0];
    if (!r) return; // utilisateur supprimé entre-temps
    const before: PlayerStats = {
      totalXp: Number(r.total_xp), level: r.level, streakDays: r.streak_days, longestStreak: r.longest_streak,
      lastActivityDate: r.last_activity_date, lessonsCompleted: r.lessons_completed,
      diagnosticsCompleted: r.diagnostics_completed, pathsCompleted: r.paths_completed,
      labsSolved: r.labs_solved, labsSolvedWithoutHint: r.labs_solved_without_hint,
    };
    // Requêtes successives : un même client pg n'exécute qu'une requête à la fois.
    const levels = await tx.query<{ level: number; min_xp: string; title: string }>('SELECT level, min_xp, title FROM gamification.levels');
    const badges = await tx.query<{ code: string; criteria: Record<string, unknown> }>('SELECT code, criteria FROM gamification.badges');
    const earned = await tx.query<{ badge_code: string }>('SELECT badge_code FROM gamification.user_badges WHERE user_id = $1', [userId]);

    const result = award(before, activity, {
      today: r.today,
      levels: levels.rows.map((l) => ({ level: l.level, minXp: Number(l.min_xp), title: l.title })),
      badges: badges.rows,
      alreadyEarned: earned.rows.map((b) => b.badge_code),
    });

    const s = result.stats;
    await tx.query(
      `UPDATE gamification.user_stats
          SET total_xp = $2, level = $3, streak_days = $4, longest_streak = $5, last_activity_date = $6::date,
              lessons_completed = $7, diagnostics_completed = $8, paths_completed = $9,
              labs_solved = $10, labs_solved_without_hint = $11
        WHERE user_id = $1`,
      [userId, s.totalXp, s.level, s.streakDays, s.longestStreak, s.lastActivityDate,
        s.lessonsCompleted, s.diagnosticsCompleted, s.pathsCompleted, s.labsSolved, s.labsSolvedWithoutHint],
    );
    await tx.query(
      `INSERT INTO gamification.xp_ledger (user_id, amount, reason, source_event_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [userId, result.xp.amount, result.xp.reason, event.id, event.occurredAt],
    );
    for (const code of result.newBadges) {
      await tx.query(
        `INSERT INTO gamification.user_badges (user_id, badge_code, awarded_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [userId, code, event.occurredAt],
      );
    }
  }
}
