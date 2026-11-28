import { Injectable } from '@nestjs/common';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@sysmaster/contracts';
import type { NotificationDto, NotificationPreferenceDto, NotificationType } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { emailByDefault } from '../domain/email';
import { PendingNotification, safeHref } from '../domain/notifications';

export interface PendingEmail {
  id: string;
  userId: string;
  type: NotificationType;
  attempts: number;
  title: string;
  body: string | null;
  href: string | null;
  /** null : compte supprimé ou adresse inutilisable, l'e-mail est abandonné. */
  to: string | null;
}

@Injectable()
export class PgNotificationRepository {
  constructor(private readonly db: Database) {}

  /**
   * Dans la transaction de l'événement : rien pour un compte supprimé ni pour un type coupé. La
   * copie par e-mail n'est préparée que si l'envoi est configuré ; un envoi à part la fait partir.
   */
  async deliver(tx: PoolClient, n: PendingNotification, email: boolean): Promise<number> {
    const { rowCount } = await tx.query(
      `INSERT INTO notification.notifications (user_id, channel, type, payload, sent_at)
       SELECT u.id, c.channel, $2, $3, CASE WHEN c.channel = 'in_app' THEN now() END
         FROM iam.users u
         CROSS JOIN (VALUES ('in_app', true), ('email', $5::boolean)) AS c(channel, default_on)
        WHERE u.id = $1 AND u.status <> 'deleted' AND (c.channel = 'in_app' OR $4::boolean)
          AND coalesce((SELECT p.enabled FROM notification.preferences p WHERE p.user_id = u.id AND p.type = $2 AND p.channel = c.channel), c.default_on)`,
      [n.userId, n.type, JSON.stringify({ title: n.title, body: n.body, href: n.href }), email, emailByDefault(n.type)],
    );
    return rowCount ?? 0;
  }

  /** Prochain e-mail à envoyer, verrouillé pour cet envoi (plusieurs instances possibles). */
  async nextEmail(tx: PoolClient, now: Date, maxAttempts: number): Promise<PendingEmail | null> {
    const { rows } = await tx.query<{ id: string; user_id: string; type: NotificationType; attempts: number; payload: Record<string, unknown>; email: string | null }>(
      `SELECT n.id, n.user_id, n.type, n.attempts, n.payload,
              CASE WHEN u.status <> 'deleted' AND u.email NOT LIKE '%@invalid' THEN u.email END AS email
         FROM notification.notifications n JOIN iam.users u ON u.id = n.user_id
        WHERE n.channel = 'email' AND n.sent_at IS NULL AND n.attempts < $2 AND (n.next_attempt_at IS NULL OR n.next_attempt_at <= $1)
        ORDER BY n.next_attempt_at NULLS FIRST, n.created_at
        LIMIT 1 FOR UPDATE OF n SKIP LOCKED`,
      [now, maxAttempts],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, userId: r.user_id, type: r.type, attempts: r.attempts, to: r.email,
      title: String(r.payload.title ?? ''), body: typeof r.payload.body === 'string' ? r.payload.body : null, href: safeHref(r.payload.href),
    };
  }

  async emailSent(tx: PoolClient, id: string) {
    await tx.query(`UPDATE notification.notifications SET sent_at = now(), attempts = attempts + 1, next_attempt_at = NULL WHERE id = $1`, [id]);
  }

  async emailFailed(tx: PoolClient, id: string, attempts: number, next: Date | null) {
    await tx.query(`UPDATE notification.notifications SET attempts = $2, next_attempt_at = $3 WHERE id = $1`, [id, attempts, next]);
  }

  async emailDropped(tx: PoolClient, id: string) {
    await tx.query(`DELETE FROM notification.notifications WHERE id = $1`, [id]);
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

  /** Toutes les combinaisons type × canal, avec leur valeur par défaut. */
  async preferences(userId: string): Promise<NotificationPreferenceDto[]> {
    const { rows } = await this.db.query<{ type: string; channel: string; enabled: boolean }>(
      `SELECT type, channel, enabled FROM notification.preferences WHERE user_id = $1`,
      [userId],
    );
    const stored = new Map(rows.map((r) => [`${r.type}/${r.channel}`, r.enabled]));
    return NOTIFICATION_TYPES.flatMap((type) =>
      NOTIFICATION_CHANNELS.map((channel) => ({
        type, channel, enabled: stored.get(`${type}/${channel}`) ?? (channel === 'in_app' || emailByDefault(type)),
      })),
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
