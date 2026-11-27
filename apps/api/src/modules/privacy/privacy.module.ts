import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { IdentityAdmin, PrivacyRepository } from './application/ports';
import { PrivacyService } from './application/privacy.service';
import { KeycloakAdmin } from './infrastructure/keycloak-admin';
import { PgPrivacyRepository } from './infrastructure/pg-privacy.repository';
import { PrivacyController } from './interface/privacy.controller';

/** RGPD : export, effacement, durées de conservation (docs/08 §RGPD). */
@Module({
  // L'effacement résilie les abonnements Stripe.
  imports: [BillingModule],
  controllers: [PrivacyController],
  providers: [
    PrivacyService,
    { provide: PrivacyRepository, useClass: PgPrivacyRepository },
    { provide: IdentityAdmin, useFactory: () => KeycloakAdmin.fromEnv() },
  ],
  exports: [PrivacyService],
})
export class PrivacyModule {}
