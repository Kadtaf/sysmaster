import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import type { SubscriptionStatus } from '@sysmaster/contracts';
import { parsePriceMap } from '../domain/billing';
import { BillingEvent, InvalidWebhookError, PaymentGateway, VerifiedEvent } from '../application/ports';

export interface StripeSettings {
  secretKey?: string;
  webhookSecret?: string;
  prices?: string;
  /** Stripe Tax : TVA calculée selon l'adresse du client (à activer dans le tableau de bord Stripe d'abord). */
  automaticTax?: boolean;
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === 'string' ? v : (v?.id ?? null));
const date = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

/**
 * Adaptateur Stripe. Sans STRIPE_SECRET_KEY ni STRIPE_WEBHOOK_SECRET, il est désactivé : aucune
 * requête ne part et les routes de paiement répondent 503. Aucune donnée personnelle n'est envoyée
 * à la création du client (ni nom ni e-mail) : Stripe Checkout demande lui-même l'e-mail du reçu.
 */
@Injectable()
export class StripeGateway extends PaymentGateway {
  private readonly logger = new Logger(StripeGateway.name);
  private readonly client: Stripe | null;
  private readonly prices: Map<string, string>;
  private readonly webhookSecret: string | null;
  readonly enabled: boolean;

  constructor(private readonly settings: StripeSettings) {
    super();
    this.prices = parsePriceMap(settings.prices);
    this.webhookSecret = settings.webhookSecret || null;
    this.enabled = Boolean(settings.secretKey && this.webhookSecret);
    // Sans clé, un client sert quand même à vérifier les signatures (calcul local, aucun réseau).
    this.client = new Stripe(settings.secretKey || 'sk_test_disabled', { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'SysMaster' } });
    if (!this.enabled) this.logger.log('Paiement désactivé : STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET absents.');
  }

  static fromEnv(env = process.env): StripeGateway {
    return new StripeGateway({
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      prices: env.STRIPE_PRICES,
      automaticTax: env.STRIPE_AUTOMATIC_TAX === 'true',
    });
  }

  priceFor(plan: string): string | null {
    return this.prices.get(plan) ?? null;
  }

  planForPrice(priceId: string): string | null {
    for (const [plan, price] of this.prices) if (price === priceId) return plan;
    return null;
  }

  private api(): Stripe {
    if (!this.enabled || !this.client) throw new ServiceUnavailableException('Le paiement en ligne n’est pas encore ouvert.');
    return this.client;
  }

  async createCustomer(userId: string): Promise<string> {
    // Clé d'idempotence : deux clics simultanés ne créent qu'un client.
    const c = await this.api().customers.create({ metadata: { user_id: userId } }, { idempotencyKey: `customer-${userId}` });
    return c.id;
  }

  async createCheckout(o: { customerId: string; priceId: string; userId: string; successUrl: string; cancelUrl: string }): Promise<string> {
    const tax = this.settings.automaticTax;
    const s = await this.api().checkout.sessions.create({
      mode: 'subscription',
      customer: o.customerId,
      client_reference_id: o.userId,
      line_items: [{ price: o.priceId, quantity: 1 }],
      subscription_data: { metadata: { user_id: o.userId } },
      allow_promotion_codes: true,
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
      ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' as const }, billing_address_collection: 'required' as const } : {}),
    });
    if (!s.url) throw new ServiceUnavailableException('Stripe n’a pas renvoyé de page de paiement.');
    return s.url;
  }

  async createPortal(customerId: string, returnUrl: string): Promise<string> {
    const s = await this.api().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return s.url;
  }

  async cancelSubscriptionNow(subscriptionId: string): Promise<void> {
    const api = this.api();
    try {
      const s = await api.subscriptions.retrieve(subscriptionId);
      if (s.status === 'canceled' || s.status === 'incomplete_expired') return;
      // Sans remboursement au prorata ni facture de clôture : la personne a demandé la suppression de son compte.
      await api.subscriptions.cancel(subscriptionId, {}, { idempotencyKey: `erasure-cancel-${subscriptionId}` });
    } catch (err) {
      if ((err as { code?: string }).code === 'resource_missing') return;
      throw err;
    }
  }

  async refundPayment(paymentIntentId: string): Promise<void> {
    try {
      await this.api().refunds.create({ payment_intent: paymentIntentId, reason: 'requested_by_customer' }, { idempotencyKey: `erasure-refund-${paymentIntentId}` });
    } catch (err) {
      if ((err as { code?: string }).code === 'charge_already_refunded') return;
      throw err;
    }
  }

  createExamCheckout(o: {
    customerId: string; userId: string; purchaseId: string; name: string; amountCents: number; currency: string; successUrl: string; cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    return this.paymentCheckout({ ...o, kind: 'exam', quantity: 1, unitAmountCents: o.amountCents });
  }

  createSeatCheckout(o: {
    customerId: string; userId: string; purchaseId: string; name: string; quantity: number; unitAmountCents: number; currency: string;
    successUrl: string; cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    return this.paymentCheckout({ ...o, kind: 'seats' });
  }

  /** Paiement unique (examen, commande de sièges) : montant calculé par la plateforme, facture émise. */
  private async paymentCheckout(o: {
    kind: 'exam' | 'seats'; customerId: string; userId: string; purchaseId: string; name: string; quantity: number; unitAmountCents: number;
    currency: string; successUrl: string; cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    const tax = this.settings.automaticTax;
    const metadata = { kind: o.kind, purchase_id: o.purchaseId, user_id: o.userId };
    const s = await this.api().checkout.sessions.create(
      {
        mode: 'payment',
        customer: o.customerId,
        client_reference_id: o.userId,
        line_items: [{
          quantity: o.quantity,
          price_data: {
            currency: o.currency.toLowerCase(),
            unit_amount: o.unitAmountCents,
            // Prix affichés TTC : la TVA calculée par Stripe Tax est comprise dans le montant.
            ...(tax ? { tax_behavior: 'inclusive' as const } : {}),
            product_data: { name: o.name },
          },
        }],
        metadata,
        payment_intent_data: { metadata },
        // Une facture pour chaque paiement, comme pour les abonnements.
        invoice_creation: { enabled: true, invoice_data: { metadata } },
        // Une organisation achète souvent avec son numéro de TVA intracommunautaire.
        ...(o.kind === 'seats' ? { tax_id_collection: { enabled: true } } : {}),
        success_url: o.successUrl,
        cancel_url: o.cancelUrl,
        ...(tax || o.kind === 'seats'
          ? { customer_update: { address: 'auto' as const, name: 'auto' as const }, billing_address_collection: 'required' as const }
          : {}),
        ...(tax ? { automatic_tax: { enabled: true } } : {}),
      },
      // Un double clic ne crée qu'une session pour le même achat.
      { idempotencyKey: `${o.kind}-${o.purchaseId}` },
    );
    if (!s.url) throw new ServiceUnavailableException('Stripe n’a pas renvoyé de page de paiement.');
    return { url: s.url, sessionId: s.id };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): VerifiedEvent {
    if (!this.webhookSecret || !this.client) throw new InvalidWebhookError('webhook non configuré');
    if (!signature) throw new InvalidWebhookError('signature absente');
    let e: Stripe.Event;
    try {
      // Tolérance par défaut de Stripe : 5 minutes, contre le rejeu d'un vieil événement intercepté.
      e = this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err) {
      throw new InvalidWebhookError((err as Error).message);
    }
    return { id: e.id, type: e.type, createdAt: new Date(e.created * 1000), event: translate(e) };
  }
}

/** Traduit les événements utiles ; les autres sont notés et ignorés. */
export function translate(e: Stripe.Event): BillingEvent | null {
  switch (e.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const s = e.data.object;
      const paymentKind = s.metadata?.kind === 'exam' ? 'exam_payment' : s.metadata?.kind === 'seats' ? 'seat_payment' : null;
      if (s.mode === 'payment' && paymentKind && s.metadata?.purchase_id) {
        const outcome =
          e.type === 'checkout.session.expired' ? 'expired'
          : e.type === 'checkout.session.async_payment_failed' ? 'failed'
          : s.payment_status === 'paid' || s.payment_status === 'no_payment_required' ? 'paid'
          : 'pending'; // prélèvement SEPA : la confirmation arrive plus tard (async_payment_succeeded)
        return { kind: paymentKind, purchaseId: s.metadata.purchase_id, checkoutSessionId: s.id, paymentIntentId: idOf(s.payment_intent), outcome };
      }
      const customerId = idOf(s.customer);
      return e.type === 'checkout.session.completed' && s.mode === 'subscription' && customerId
        ? { kind: 'checkout_completed', customerId, userId: s.client_reference_id ?? null }
        : null;
    }
    case 'charge.refunded': {
      const c = e.data.object;
      const pi = idOf(c.payment_intent);
      // Seul un remboursement total annule l'achat ; un geste partiel le laisse valable.
      return pi && c.refunded ? { kind: 'refund', paymentIntentId: pi } : null;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const s = e.data.object;
      const item = s.items.data[0];
      return {
        kind: 'subscription',
        subscriptionId: s.id,
        customerId: idOf(s.customer)!,
        priceId: item?.price?.id ?? null,
        status: s.status as SubscriptionStatus,
        // Depuis l'API 2025-03-31, la période est portée par chaque ligne de l'abonnement.
        currentPeriodEnd: date(item?.current_period_end),
        cancelAtPeriodEnd: s.cancel_at_period_end || Boolean(s.cancel_at),
        userId: s.metadata?.user_id ?? null,
      };
    }
    case 'invoice.finalized':
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.voided': {
      const i = e.data.object;
      const customerId = idOf(i.customer);
      if (!i.id || !customerId) return null;
      return {
        kind: 'invoice',
        invoiceId: i.id,
        customerId,
        amountCents: i.status === 'paid' ? i.amount_paid : i.amount_due,
        currency: i.currency.toUpperCase(),
        status: i.status ?? 'draft',
        url: i.hosted_invoice_url ?? i.invoice_pdf ?? null,
        issuedAt: new Date(i.created * 1000),
      };
    }
    default:
      return null;
  }
}
