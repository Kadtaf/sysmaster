import { Module } from '@nestjs/common';
import { BillingService } from './application/billing.service';
import { BillingRepository, PaymentGateway } from './application/ports';
import { PgBillingRepository } from './infrastructure/pg-billing.repository';
import { StripeGateway } from './infrastructure/stripe.gateway';
import { BillingController } from './interface/billing.controller';

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    { provide: BillingRepository, useClass: PgBillingRepository },
    { provide: PaymentGateway, useFactory: () => StripeGateway.fromEnv() },
  ],
  // Le quota IA lit l'offre de la personne.
  exports: [BillingService],
})
export class BillingModule {}
