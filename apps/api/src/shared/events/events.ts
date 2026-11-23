import type { PoolClient } from 'pg';

/** Événement tel que stocké dans platform.outbox_events (format proche de CloudEvents). */
export interface StoredEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  aggregate: string;
  aggregateId: string;
  payload: T;
  occurredAt: Date;
}

/**
 * Un consommateur traite un événement DANS la transaction fournie, qui enregistre aussi
 * (consumer, event_id) dans platform.processed_events : traitement exactement une fois.
 */
export type EventHandler = (event: StoredEvent<any>, tx: PoolClient) => Promise<void>;

export interface Subscription {
  consumer: string;
  types: string[];
  handler: EventHandler;
}
