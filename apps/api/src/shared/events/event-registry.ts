import { Injectable } from '@nestjs/common';
import { EventHandler, Subscription } from './events';

/** Les modules s'abonnent ici au démarrage ; le relais distribue. */
@Injectable()
export class EventRegistry {
  private readonly subscriptions: Subscription[] = [];

  subscribe(consumer: string, types: string[], handler: EventHandler) {
    if (this.subscriptions.some((s) => s.consumer === consumer)) {
      throw new Error(`Consommateur « ${consumer} » déjà enregistré`);
    }
    this.subscriptions.push({ consumer, types, handler });
  }

  subscribersOf(type: string): Subscription[] {
    return this.subscriptions.filter((s) => s.types.includes(type));
  }
}
