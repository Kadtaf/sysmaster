import { Global, Module } from '@nestjs/common';
import { EventRegistry } from './event-registry';
import { OutboxRelay } from './outbox-relay';

@Global()
@Module({ providers: [EventRegistry, OutboxRelay], exports: [EventRegistry, OutboxRelay] })
export class EventsModule {}
