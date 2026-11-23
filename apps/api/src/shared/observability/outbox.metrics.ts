import { Injectable, OnModuleInit } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { Database } from '../database.module';
import { MAX_ATTEMPTS } from '../events/outbox-relay';
import { registry } from './metrics';

/**
 * État de l'outbox, lu à chaque collecte : c'est le premier signal d'un consommateur en panne.
 * Alerte conseillée : outbox_dead_letter_events > 0, ou outbox_oldest_pending_seconds > 300.
 */
@Injectable()
export class OutboxMetrics implements OnModuleInit {
  constructor(private readonly db: Database) {}

  onModuleInit() {
    if (registry.getSingleMetric('outbox_pending_events')) return; // une seule fois par processus (tests)
    const query = () =>
      this.db.query<{ pending: number; dead: number; oldest: number }>(
        `SELECT count(*) FILTER (WHERE attempts < $1)::int AS pending,
                count(*) FILTER (WHERE attempts >= $1)::int AS dead,
                coalesce(extract(epoch FROM now() - min(occurred_at) FILTER (WHERE attempts < $1)), 0)::float AS oldest
           FROM platform.outbox_events WHERE published_at IS NULL`,
        [MAX_ATTEMPTS],
      );
    let last: Promise<{ pending: number; dead: number; oldest: number }> | null = null;
    // Les trois jauges partagent une seule requête par collecte.
    const snapshot = () => (last ??= query().then((r) => r.rows[0]).finally(() => setImmediate(() => (last = null))));
    const gauge = (name: string, help: string, pick: (s: { pending: number; dead: number; oldest: number }) => number) =>
      new Gauge({
        name, help, registers: [registry],
        async collect() {
          this.set(pick(await snapshot()));
        },
      });
    gauge('outbox_pending_events', 'Événements en attente de distribution', (s) => s.pending);
    gauge('outbox_dead_letter_events', 'Événements abandonnés après le nombre maximal d’essais', (s) => s.dead);
    gauge('outbox_oldest_pending_seconds', 'Âge du plus ancien événement en attente', (s) => s.oldest);
  }
}
