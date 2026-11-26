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
    case 'checkout.session.completed': {
      const s = e.data.object;
      const customerId = idOf(s.customer);
      return s.mode === 'subscription' && customerId ? { kind: 'checkout_completed', customerId, userId: s.client_reference_id ?? null } : null;
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
