import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { BillingCatalogDto, BillingStatusDto, CheckoutInput, RedirectDto } from '@sysmaster/contracts';
import { aiDailyCap, aiQuestionsPerDay, certificationDiscountPct, checkoutBlocker, effectivePlan, examPaymentRequired, examPrice } from '../domain/billing';
import { webUrl } from '../../../shared/web/web-url';
import { BillingRepository, InvalidWebhookError, PaymentGateway } from './ports';


/** Ce qui reste à faire chez Stripe pour un compte effacé. */
export interface BillingClosure {
  subscriptions: string[];
  refunds: string[];
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

  /** Offre qui s'applique, siège d'organisation compris. */
  async planOf(userId: string): Promise<string> {
    const [subs, seat] = await Promise.all([this.repo.subscriptions(userId), this.repo.seatLicence(userId)]);
    return effectivePlan(subs, seat?.plan ?? null);
  }

  async status(userId: string): Promise<BillingStatusDto> {
    const [subs, customer, invoices, seat] = await Promise.all([
      this.repo.subscriptions(userId), this.repo.customerId(userId), this.repo.invoices(userId, 24), this.repo.seatLicence(userId),
    ]);
    const current = subs[0] ?? null;
    return {
      enabled: this.gateway.enabled,
      plan: effectivePlan(subs, seat?.plan ?? null),
      licence: seat && { organization: seat.organization, plan: seat.plan, endsAt: seat.endsAt?.toISOString() ?? null },
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
    return aiDailyCap(await this.repo.features(await this.planOf(userId)));
  }

  async checkout(userId: string, input: CheckoutInput): Promise<RedirectDto> {
    const priceId = this.gateway.priceFor(input.plan);
    const blocker = checkoutBlocker({ enabled: this.gateway.enabled, priceId, open: await this.repo.subscriptions(userId) });
    if (blocker) throw this.gateway.enabled ? new ConflictException(blocker) : new ServiceUnavailableException(blocker);
    await this.refuseIfErasing(userId);
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

  /** Prix d'un examen pour cette personne (remise de son offre) et s'il doit être payé avant de commencer. */
  async examOffer(userId: string | null, listPriceCents: number): Promise<{ required: boolean; discountPct: number; amountCents: number }> {
    const discountPct = userId && this.gateway.enabled ? certificationDiscountPct(await this.repo.features(await this.planOf(userId))) : 0;
    const amountCents = examPrice(listPriceCents, discountPct);
    return { required: examPaymentRequired(this.gateway.enabled, amountCents), discountPct, amountCents };
  }

  /** Ce qu'il faut pour afficher le prix des examens à une personne : paiement ouvert, remise, tentatives déjà payées. */
  async examContext(userId: string | null): Promise<{ enabled: boolean; discountPct: number; credits: Set<string> }> {
    if (!this.gateway.enabled || !userId) return { enabled: this.gateway.enabled, discountPct: 0, credits: new Set() };
    const [plan, credits] = await Promise.all([this.planOf(userId), this.repo.examCredits(userId)]);
    return { enabled: true, discountPct: certificationDiscountPct(await this.repo.features(plan)), credits };
  }

  async purchaseExam(userId: string, exam: { code: string; title: string; listPriceCents: number }): Promise<RedirectDto> {
    if (!this.gateway.enabled) throw new ServiceUnavailableException('Le paiement en ligne n’est pas encore ouvert : l’examen est accessible sans paiement.');
    const offer = await this.examOffer(userId, exam.listPriceCents);
    if (!offer.required) throw new ConflictException('Cet examen est gratuit : aucun paiement nécessaire.');
    await this.refuseIfErasing(userId);
    if (await this.repo.hasUnusedExamPurchase(userId, exam.code)) throw new ConflictException('Vous avez déjà payé une tentative pour cet examen : vous pouvez le commencer.');
    const customerId = await this.customerFor(userId);
    const purchaseId = await this.repo.createExamPurchase({
      userId, code: exam.code, listPriceCents: exam.listPriceCents, discountPct: offer.discountPct, amountCents: offer.amountCents, currency: 'EUR',
    });
    const base = webUrl();
    const page = `${base}/certifications/${encodeURIComponent(exam.code)}`;
    const { url, sessionId } = await this.gateway.createExamCheckout({
      customerId, userId, purchaseId, name: `Examen de certification ${exam.title}`, amountCents: offer.amountCents, currency: 'EUR',
      successUrl: `${page}?paiement=ok`, cancelUrl: `${page}?paiement=annule`,
    });
    await this.repo.attachCheckout(purchaseId, sessionId);
    return { url };
  }

  /**
   * À l'ouverture d'un examen : consomme une tentative payée si l'examen se paie (402 sinon).
   * Renvoie l'achat consommé, à relier à la session ou à rendre si l'ouverture échoue.
   */
  async consumeExam(userId: string, code: string, listPriceCents: number): Promise<string | null> {
    const offer = await this.examOffer(userId, listPriceCents);
    if (!offer.required) return null;
    const purchase = await this.repo.consumeExamPurchase(userId, code);
    if (!purchase) {
      throw new HttpException({ message: 'Cet examen se paie avant de commencer.', amountCents: offer.amountCents }, HttpStatus.PAYMENT_REQUIRED);
    }
    return purchase;
  }

  releaseExam(purchaseId: string) {
    return this.repo.releaseExamPurchase(purchaseId);
  }

  linkExamSession(purchaseId: string, examSessionId: string) {
    return this.repo.linkExamSession(purchaseId, examSessionId);
  }

  /**
   * Effacement du compte (RGPD) : résilie tout de suite ses abonnements Stripe et rembourse les
   * tentatives d'examen payées mais pas utilisées. Renvoie ce qui n'a pas pu être fait (Stripe
   * injoignable, paiement fermé), à reprendre avec `finishClosure`.
   * Factures et achats restent : ce sont des pièces comptables (docs/08 §8).
   */
  async closeForErasure(userId: string): Promise<BillingClosure> {
    const [subscriptions, refunds] = await Promise.all([this.repo.openSubscriptionIds(userId), this.repo.unusedExamPayments(userId)]);
    return this.finishClosure({ subscriptions, refunds });
  }

  async finishClosure(todo: BillingClosure): Promise<BillingClosure> {
    return {
      subscriptions: await this.each(todo.subscriptions, 'Résiliation de l’abonnement', (id) => this.gateway.cancelSubscriptionNow(id)),
      refunds: await this.each(todo.refunds, 'Remboursement du paiement', async (pi) => {
        await this.gateway.refundPayment(pi);
        await this.repo.markExamRefunded(pi);
      }),
    };
  }

  /** Applique `fn` à chaque identifiant ; renvoie ceux pour lesquels Stripe a échoué. */
  private async each(ids: string[], what: string, fn: (id: string) => Promise<void>): Promise<string[]> {
    if (!ids.length) return [];
    if (!this.gateway.enabled) return ids;
    const left: string[] = [];
    for (const id of ids) {
      try {
        await fn(id);
      } catch (err) {
        this.logger.error(`${what} ${id} impossible : ${(err as Error).message}`);
        left.push(id);
      }
    }
    return left;
  }

  private async refuseIfErasing(userId: string) {
    if (await this.repo.erasureScheduled(userId)) {
      throw new ConflictException('La suppression de votre compte est demandée : annulez-la depuis Mon compte avant de payer.');
    }
  }

  private async customerFor(userId: string): Promise<string> {
    const existing = await this.repo.customerId(userId);
    if (existing) return existing;
    return this.repo.linkCustomer(userId, await this.gateway.createCustomer(userId));
  }
}
