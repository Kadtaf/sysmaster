import type { BillingInvoiceDto, SubscriptionStatus } from '@sysmaster/contracts';
import type { SubscriptionState } from '../domain/billing';

/** Événement Stripe ramené à ce qui compte pour la plateforme. */
export type BillingEvent =
  | { kind: 'checkout_completed'; customerId: string; userId: string | null }
  | {
      kind: 'subscription';
      subscriptionId: string;
      customerId: string;
      priceId: string | null;
      status: SubscriptionStatus;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      /** Repris des métadonnées posées au paiement, au cas où le client ne serait pas encore lié. */
      userId: string | null;
    }
  | {
      kind: 'invoice';
      invoiceId: string;
      customerId: string;
      amountCents: number;
      currency: string;
      status: string;
      url: string | null;
      issuedAt: Date;
    };

export interface VerifiedEvent {
  id: string;
  type: string;
  createdAt: Date;
  /** null : type d'événement sans effet ici (il est quand même noté, pour l'idempotence). */
  event: BillingEvent | null;
}

export class InvalidWebhookError extends Error {}

/** Ce que la plateforme demande au prestataire de paiement (Stripe). */
export abstract class PaymentGateway {
  /** Faux sans clé secrète ni secret de webhook : aucun appel ne part. */
  abstract readonly enabled: boolean;
  abstract priceFor(plan: string): string | null;
  abstract planForPrice(priceId: string): string | null;
  abstract createCustomer(userId: string): Promise<string>;
  abstract createCheckout(opts: { customerId: string; priceId: string; userId: string; successUrl: string; cancelUrl: string }): Promise<string>;
  abstract createPortal(customerId: string, returnUrl: string): Promise<string>;
  /** Vérifie la signature et traduit l'événement. Lève InvalidWebhookError si la signature est fausse. */
  abstract verifyWebhook(rawBody: Buffer, signature: string | undefined): VerifiedEvent;
}

export interface StoredSubscription extends SubscriptionState {
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
}

export interface PlanRow {
  code: string;
  name: string;
  priceCents: number | null;
  currency: string;
  interval: 'month' | 'year' | null;
  perSeat: boolean;
  features: Record<string, unknown>;
}

export abstract class BillingRepository {
  abstract plans(): Promise<PlanRow[]>;
  abstract features(plan: string): Promise<Record<string, unknown>>;
  abstract customerId(userId: string): Promise<string | null>;
  /** Lie un client Stripe à la personne ; renvoie celui déjà lié si une requête concurrente a gagné. */
  abstract linkCustomer(userId: string, customerId: string): Promise<string>;
  abstract subscriptions(userId: string): Promise<StoredSubscription[]>;
  abstract invoices(userId: string, limit: number): Promise<BillingInvoiceDto[]>;
  /**
   * Applique un événement une seule fois (idempotence par identifiant Stripe), dans une transaction.
   * Renvoie false si l'événement avait déjà été traité.
   */
  abstract applyEvent(e: VerifiedEvent, planForPrice: (priceId: string) => string | null): Promise<boolean>;
}
