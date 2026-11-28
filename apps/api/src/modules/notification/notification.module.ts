import { Module } from '@nestjs/common';
import { EmailSender } from './infrastructure/email-sender';
import { Mailer } from './infrastructure/mailer';
import { NotificationConsumer } from './infrastructure/notification.consumer';
import { PgNotificationRepository } from './infrastructure/pg-notification.repository';
import { EmailUnsubscribeController, NotificationController } from './interface/notification.controller';

/**
 * Notifications dans l'application et par e-mail (docs/03 §2.9). Contexte générique, en couches simples (docs/01 §6) :
 * alimenté par les événements des autres contextes, qu'il ne connaît que par leurs contrats.
 */
@Module({
  controllers: [NotificationController, EmailUnsubscribeController],
  providers: [PgNotificationRepository, NotificationConsumer, EmailSender, { provide: Mailer, useFactory: () => Mailer.fromEnv() }],
})
export class NotificationModule {}
