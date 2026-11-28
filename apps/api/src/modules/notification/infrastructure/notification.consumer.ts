import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventRegistry } from '../../../shared/events/event-registry';
import { notificationFor, NOTIFYING_EVENTS } from '../domain/notifications';
import { Mailer } from './mailer';
import { PgNotificationRepository } from './pg-notification.repository';

/** Adaptateur entrant : les événements des autres contextes deviennent des notifications. */
@Injectable()
export class NotificationConsumer implements OnModuleInit {
  constructor(
    private readonly registry: EventRegistry,
    private readonly repo: PgNotificationRepository,
    private readonly mailer: Mailer,
  ) {}

  onModuleInit() {
    this.registry.subscribe('notification', [...NOTIFYING_EVENTS], async (event, tx) => {
      const n = notificationFor(event.type, event.payload);
      if (n) await this.repo.deliver(tx, n, this.mailer.enabled);
    });
  }
}
