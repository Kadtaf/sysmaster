import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { BillingCatalogDto, BillingStatusDto, CheckoutInput, RedirectDto } from '@sysmaster/contracts';
import { aiDailyCap, aiQuestionsPerDay, certificationDiscountPct, checkoutBlocker, effectivePlan } from '../domain/billing';
import { BillingRepository, InvalidWebhookError, PaymentGateway } from './ports';

/** Adresse du site, pour les retours de Stripe Checkout et du portail. */
export function webUrl(env = process.env): string {
  const base = env.PUBLIC_WEB_URL || (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')[0].trim();
  return base.replace(/\/+$/, '');
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly repo: BillingRepository,
    private readonly gateway: PaymentGateway,
  ) {}

  get enabled() {
    return this.gateway.enabled;
  }

  async catalog(): Promise<BillingCatalogDto> {
    const plans = await this.repo.plans();
    return {
      enabled: this.gateway.enabled,
      plans: plans.map((p) => ({
        code: p.code,
        name: p.name,
        priceCents: p.priceCents,
        currency: p.currency,
        interval: p.interval,
        perSeat: p.perSeat,
        aiQuestionsPerDay: aiQuestionsPerDay(p.features),
        certificationDiscountPct: certificationDiscountPct(p.features),
        features: p.features,
        purchasable: this.gateway.enabled && this.gateway.priceFor(p.code) !== null,
      })),
    };
  }

  async status(userId: string): Promise<BillingStatusDto> {
    const [subs, customer, invoices] = await Promise.all([this.repo.subscriptions(userId), this.repo.customerId(userId), this.repo.invoices(userId, 24)]);
    const current = subs[0] ?? null;
    return {
      enabled: this.gateway.enabled,
      plan: effectivePlan(subs),
      subscription: current && {
        plan: current.plan,
        status: current.status,
        currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: current.cancelAtPeriodEnd,
      },
      canManage: this.gateway.enabled && customer !== null,
      invoices,
    };
  }

  /**
   * Plafond quotidien de questions à l'IA donné par l'offre, ou null tant que le paiement n'est pas
   * ouvert : on ne restreint pas l'offre gratuite avant de permettre d'en sortir.
   */
  async aiDailyCap(userId: string): Promise<number | null> {
    if (!this.gateway.enabled) return null;
    const plan = effectivePlan(await this.repo.subscriptions(userId));
    return aiDailyCap(await this.repo.features(plan));
  }

  async checkout(userId: string, input: CheckoutInput): Promise<RedirectDto> {
    const priceId = this.gateway.priceFor(input.plan);
    const blocker = checkoutBlocker({ enabled: this.gateway.enabled, priceId, open: await this.repo.subscriptions(userId) });
    if (blocker) throw this.gateway.enabled ? new ConflictException(blocker) : new ServiceUnavailableException(blocker);
    const customerId = await this.customerFor(userId);
    const base = webUrl();
    const url = await this.gateway.createCheckout({
      customerId,
      priceId: priceId!,
      userId,
      successUrl: `${base}/abonnement?paiement=ok`,
      cancelUrl: `${base}/tarifs?paiement=annule`,
    });
    return { url };
  }

  async portal(userId: string): Promise<RedirectDto> {
    if (!this.gateway.enabled) throw new ServiceUnavailableException('Le paiement en ligne n’est pas encore ouvert.');
    const customerId = await this.repo.customerId(userId);
    if (!customerId) throw new NotFoundException('Aucun abonnement à gérer.');
    return { url: await this.gateway.createPortal(customerId, `${webUrl()}/abonnement`) };
  }

  async webhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: true; duplicate: boolean }> {
    if (!this.gateway.enabled) throw new ServiceUnavailableException('Paiement désactivé.');
    if (!rawBody) throw new BadRequestException('Corps de requête manquant.');
    let verified;
    try {
      verified = this.gateway.verifyWebhook(rawBody, signature);
    } catch (err) {
      if (err instanceof InvalidWebhookError) {
        this.logger.warn(`Webhook Stripe refusé : ${err.message}`);
        throw new BadRequestException('Signature invalide.');
      }
      throw err;
    }
    const applied = await this.repo.applyEvent(verified, (price) => this.gateway.planForPrice(price));
    return { received: true, duplicate: !applied };
  }

  private async customerFor(userId: string): Promise<string> {
    const existing = await this.repo.customerId(userId);
    if (existing) return existing;
    return this.repo.linkCustomer(userId, await this.gateway.createCustomer(userId));
  }
}
