import { Global, Module } from '@nestjs/common';
import { OutboxMetrics } from './outbox.metrics';

@Global()
@Module({ providers: [OutboxMetrics] })
export class ObservabilityModule {}
