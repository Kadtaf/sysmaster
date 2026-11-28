import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Database } from '../../../shared/database.module';
import { publicApiUrl, webUrl } from '../../../shared/web/web-url';
import { MAX_EMAIL_ATTEMPTS, nextAttemptAt, renderEmail, unsubscribeToken } from '../domain/email';
import { Mailer } from './mailer';
import { PgNotificationRepository } from './pg-notification.repository';

/**
 * Envoie les e-mails de notification préparés, un par transaction (verrou SKIP LOCKED : plusieurs
 * instances de l'API peuvent tourner). Un échec est réessayé plus tard, puis abandonné.
 */
@Injectable()
export class EmailSender implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EmailSender.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<number> | null = null;

  constructor(
    private readonly db: Database,
    private readonly repo: PgNotificationRepository,
    private readonly mailer: Mailer,
  ) {}

  onApplicationBootstrap() {
    const interval = Number(process.env.MAIL_INTERVAL_MS ?? 30_000);
    if (this.mailer.enabled && interval > 0) {
      this.timer = setInterval(() => void this.run().catch((e) => this.logger.error(e)), interval);
      this.timer.unref();
    }
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  run(limit = 50, now = new Date()): Promise<number> {
    this.running ??= this.batch(limit, now).finally(() => (this.running = null));
    return this.running;
  }

  private async batch(limit: number, now: Date): Promise<number> {
    if (!this.mailer.enabled) return 0;
    let sent = 0;
    for (let i = 0; i < limit; i++) {
      const done = await this.db.transaction(async (tx) => {
        const e = await this.repo.nextEmail(tx, now, MAX_EMAIL_ATTEMPTS);
        if (!e) return null;
        if (!e.to) {
          await this.repo.emailDropped(tx, e.id); // compte supprimé entre-temps : rien à envoyer
          return false;
        }
        const token = unsubscribeToken(e.userId, e.type, this.mailer.linkSecret);
        const site = webUrl();
        const message = renderEmail(e, { site, unsubscribe: `${site}/notifications/desabonnement?token=${token}` });
        try {
          await this.mailer.send({
            to: e.to,
            ...message,
            headers: {
              // Désabonnement en un clic depuis la messagerie (RFC 8058).
              'List-Unsubscribe': `<${publicApiUrl()}/notifications/unsubscribe?token=${token}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              'Auto-Submitted': 'auto-generated',
            },
          });
          await this.repo.emailSent(tx, e.id);
          return true;
        } catch (err) {
          const attempts = e.attempts + 1;
          // Jamais l'adresse dans le journal : seulement l'identifiant de la notification.
          this.logger.warn(`E-mail ${e.id} non envoyé (essai ${attempts}/${MAX_EMAIL_ATTEMPTS}) : ${(err as Error).name}`);
          await this.repo.emailFailed(tx, e.id, attempts, nextAttemptAt(attempts, now));
          return false;
        }
      });
      if (done === null) break;
      if (done) sent++;
    }
    return sent;
  }
}
