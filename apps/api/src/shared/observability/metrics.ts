import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/**
 * Registre Prometheus du processus. Il est exposé sur un port séparé (METRICS_PORT), jamais
 * par l'ingress public : les métriques révèlent des volumes et des routes internes.
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: 'sysmaster-api' });
collectDefaultMetrics({ register: registry });

/** Durée des requêtes HTTP par route (le motif `/kb/commands/:slug`, pas l'URL réelle, pour borner la cardinalité). */
export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const outboxDelivered = new Counter({
  name: 'outbox_events_processed_total',
  help: 'Événements traités par le relais outbox, par issue',
  labelNames: ['outcome'] as const,
  registers: [registry],
});
