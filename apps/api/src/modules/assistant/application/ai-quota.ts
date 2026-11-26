import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BillingService } from '../../billing/application/billing.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { dailyQuota } from '../domain/quota';
import { AiUsageRepository } from './ports';

/**
 * Quota quotidien commun à toutes les requêtes au modèle (assistant, diagnostic assisté…).
 * Un seul compteur : l'utilisateur sait combien il lui en reste, quelle que soit la fonction utilisée.
 */
@Injectable()
export class AiQuota {
  constructor(
    private readonly usage: AiUsageRepository,
    private readonly billing: BillingService,
  ) {}

  /** Lève 429 si le plafond est atteint ; sinon renvoie le nombre de requêtes restantes après celle-ci. */
  async reserve(user: AuthenticatedUser): Promise<number> {
    // Paiement ouvert : le plafond vient de l'offre (gratuite, Premium, Pro). Sinon, ASSISTANT_DAILY_QUOTA pour tous.
    const base = (await this.billing.aiDailyCap(user.id)) ?? Number(process.env.ASSISTANT_DAILY_QUOTA ?? 30);
    const quota = dailyQuota(user.roles, base);
    const used = await this.usage.requestsSince(user.id, new Date(Date.now() - 24 * 3600 * 1000));
    if (used >= quota) {
      throw new HttpException(
        { message: `Vous avez fait ${used} demandes à l’IA en 24 heures, le maximum de votre offre. Réessayez plus tard${this.billing.enabled ? ' ou passez à une offre supérieure' : ''}.`, quota },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return Math.max(0, quota - used - 1);
  }
}
