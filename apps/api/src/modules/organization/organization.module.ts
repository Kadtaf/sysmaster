import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { NotificationModule } from '../notification/notification.module';
import { OrganizationService } from './application/organization.service';
import { PgOrganizationRepository } from './infrastructure/pg-organization.repository';
import { AdminOrganizationController, OrganizationController } from './interface/organization.controller';

/**
 * Organisations et licences par siège (docs/03 §2.11). Le siège donne une offre (Pro) lue par la
 * facturation ; l'organisation ne voit que la progression d'apprentissage de ses membres.
 */
@Module({
  imports: [NotificationModule, BillingModule],
  controllers: [OrganizationController, AdminOrganizationController],
  providers: [OrganizationService, PgOrganizationRepository],
})
export class OrganizationModule {}
