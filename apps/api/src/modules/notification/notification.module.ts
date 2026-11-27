import { Module } from '@nestjs/common';
import { NotificationConsumer } from './infrastructure/notification.consumer';
import { PgNotificationRepository } from './infrastructure/pg-notification.repository';
import { NotificationController } from './interface/notification.controller';

/**
 * Notifications in-app (docs/03 §2.9). Contexte générique, en couches simples (docs/01 §6) :
 * alimenté par les événements des autres contextes, qu'il ne connaît que par leurs contrats.
 */
@Module({
  controllers: [NotificationController],
  providers: [PgNotificationRepository, NotificationConsumer],
})
export class NotificationModule {}
