import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Database } from '../database.module';
import { EventRegistry } from './event-registry';
import { StoredEvent } from './events';

export const MAX_ATTEMPTS = 10;

/**
 * Relais de l'outbox (architecture §6). Lit les événements non publiés, les distribue aux
 * consommateurs abonnés, puis les marque publiés.
 *
 * - Plusieurs instances peuvent tourner : FOR UPDATE SKIP LOCKED répartit les lots sans doublon.
 * - Chaque consommateur est idempotent (platform.processed_events) : un événement rejoué après
 *   une panne n'est pas compté deux fois.
 * - Un consommateur en échec n'empêche pas les autres ; l'événement est retenté jusqu'à
 *   MAX_ATTEMPTS fois puis mis de côté (lettre morte) avec sa dernière erreur.
 *
 * Phase 2 : distribution dans le processus. Quand des services seront extraits, un adaptateur
 * NATS JetStream publiera ces mêmes événements (le format ne change pas).
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<number> | null = null;

  constructor(
    private readonly db: Database,
    private readonly registry: EventRegistry,
  ) {}

  onApplicationBootstrap() {
    const interval = Number(process.env.OUTBOX_RELAY_INTERVAL_MS ?? 1000);
    if (interval > 0) {
      this.timer = setInterval(() => void this.drain().catch((e) => this.logger.error(e)), interval);
      this.timer.unref();
    }
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  /** Traite tout ce qui est prêt à l'être. Renvoie le nombre d'événements examinés. Utilisé aussi par les tests. */
  drain(): Promise<number> {
    if (!this.running) {
      this.running = (async () => {
        let total = 0;
        for (let n = await this.batch(); n > 0; n = await this.batch()) total += n;
        return total;
      })().finally(() => (this.running = null));
    }
    return this.running;
  }

  private batch(limit = 50): Promise<number> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<Record<string, any>>(
        `SELECT id, type, aggregate, aggregate_id, payload, occurred_at
           FROM platform.outbox_events
          WHERE published_at IS NULL AND attempts < $1 AND next_attempt_at <= now()
          ORDER BY occurred_at
          LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [MAX_ATTEMPTS, limit],
      );
      for (const r of rows) {
        const event: StoredEvent = {
          id: r.id, type: r.type, aggregate: r.aggregate, aggregateId: r.aggregate_id, payload: r.payload, occurredAt: r.occurred_at,
        };
        const errors: string[] = [];
        for (const sub of this.registry.subscribersOf(event.type)) {
          try {
            await this.db.transaction(async (ctx) => {
              const fresh = await ctx.query(
                `INSERT INTO platform.processed_events (consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [sub.consumer, event.id],
              );
              if (fresh.rowCount) await sub.handler(event, ctx);
            });
          } catch (err) {
            errors.push(`${sub.consumer}: ${(err as Error).message}`);
            this.logger.error(`Échec de ${sub.consumer} sur ${event.type} (${event.id}) : ${(err as Error).message}`);
          }
        }
        if (errors.length) {
          await tx.query(
            // Attente exponentielle : 2 s, 4 s, 8 s… (≈ 17 min au 10e essai).
            `UPDATE platform.outbox_events
                SET attempts = attempts + 1, last_error = $2,
                    next_attempt_at = now() + make_interval(secs => power(2, attempts + 1))
              WHERE id = $1`,
            [event.id, errors.join(' | ').slice(0, 2000)],
          );
        } else {
          await tx.query(`UPDATE platform.outbox_events SET published_at = now() WHERE id = $1`, [event.id]);
        }
      }
      // Les événements en échec sont repoussés (next_attempt_at) : le lot suivant ne les reprend pas.
      return rows.length;
    });
  }
}
