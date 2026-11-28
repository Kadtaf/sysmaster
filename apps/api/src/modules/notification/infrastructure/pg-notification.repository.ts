import { Injectable } from '@nestjs/common';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@sysmaster/contracts';
import type { NotificationDto, NotificationPreferenceDto, NotificationType } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { PendingNotification, safeHref } from '../domain/notifications';

@Injectable()
export class PgNotificationRepository {
  constructor(private readonly db: Database) {}

  /** Dans la transaction de l'événement : rien pour un compte supprimé ni pour un type coupé. */
  async deliver(tx: PoolClient, n: PendingNotification): Promise<boolean> {
    const { rowCount } = await tx.query(
      `INSERT INTO notification.notifications (user_id, channel, type, payload, sent_at)
       SELECT u.id, 'in_app', $2, $3, now() FROM iam.users u
        WHERE u.id = $1 AND u.status <> 'deleted'
          AND coalesce((SELECT p.enabled FROM notification.preferences p WHERE p.user_id = u.id AND p.type = $2 AND p.channel = 'in_app'), true)`,
      [n.userId, n.type, JSON.stringify({ title: n.title, body: n.body, href: n.href })],
    );
    return rowCount === 1;
  }

  async list(userId: string, limit: number): Promise<{ items: NotificationDto[]; unread: number }> {
    const [list, count] = await Promise.all([
      this.db.query<{ id: string; type: NotificationType; payload: Record<string, unknown>; read_at: Date | null; created_at: Date }>(
        `SELECT id, type, payload, read_at, created_at FROM notification.notifications
          WHERE user_id = $1 AND channel = 'in_app' ORDER BY created_at DESC LIMIT $2`,
        [userId, limit],
      ),
      this.unread(userId),
    ]);
    return {
      unread: count,
      items: list.rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: String(r.payload.title ?? ''),
        body: typeof r.payload.body === 'string' ? r.payload.body : null,
        href: safeHref(r.payload.href),
        read: r.read_at !== null,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }

  async unread(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM notification.notifications WHERE user_id = $1 AND channel = 'in_app' AND read_at IS NULL`,
      [userId],
    );
    return rows[0].n;
  }

  async markRead(userId: string, id: string | null): Promise<number> {
    const { rowCount } = await this.db.query(
      `UPDATE notification.notifications SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL AND ($2::uuid IS NULL OR id = $2::uuid)`,
      [userId, id],
    );
    return rowCount ?? 0;
  }

  /** Toutes les combinaisons type × canal, activées par défaut. */
  async preferences(userId: string): Promise<NotificationPreferenceDto[]> {
    const { rows } = await this.db.query<{ type: string; channel: string; enabled: boolean }>(
      `SELECT type, channel, enabled FROM notification.preferences WHERE user_id = $1`,
      [userId],
    );
    const stored = new Map(rows.map((r) => [`${r.type}/${r.channel}`, r.enabled]));
    return NOTIFICATION_TYPES.flatMap((type) =>
      NOTIFICATION_CHANNELS.map((channel) => ({ type, channel, enabled: stored.get(`${type}/${channel}`) ?? true })),
    );
  }

  async setPreferences(userId: string, prefs: NotificationPreferenceDto[]): Promise<void> {
    if (!prefs.length) return;
    await this.db.query(
      `INSERT INTO notification.preferences (user_id, type, channel, enabled)
       SELECT $1, t, c, e FROM unnest($2::text[], $3::text[], $4::boolean[]) AS x(t, c, e)
       ON CONFLICT (user_id, type, channel) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [userId, prefs.map((p) => p.type), prefs.map((p) => p.channel), prefs.map((p) => p.enabled)],
    );
  }
}
