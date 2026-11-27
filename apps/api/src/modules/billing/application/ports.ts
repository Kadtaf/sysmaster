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
      /** Paiement d'un examen : payé, en attente (prélèvement), échoué ou session expirée. */
      kind: 'exam_payment';
      purchaseId: string;
      checkoutSessionId: string;
      paymentIntentId: string | null;
      outcome: 'paid' | 'pending' | 'failed' | 'expired';
    }
  | { kind: 'refund'; paymentIntentId: string }
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
  /** Paiement unique d'un examen (montant calculé ici, remise comprise). Renvoie l'adresse et l'identifiant de session. */
  abstract createExamCheckout(o: {
    customerId: string; userId: string; purchaseId: string; name: string; amountCents: number; currency: string; successUrl: string; cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }>;
  /**
   * Résilie l'abonnement tout de suite, sans attendre la fin de la période (effacement du compte).
   * Sans effet sur un abonnement déjà résilié ou inconnu de Stripe.
   */
  abstract cancelSubscriptionNow(subscriptionId: string): Promise<void>;
  /** Remboursement total d'un paiement. Sans effet s'il est déjà remboursé. */
  abstract refundPayment(paymentIntentId: string): Promise<void>;
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
  /** Abonnements Stripe encore en cours (ni résiliés ni expirés), à résilier si le compte est effacé. */
  abstract openSubscriptionIds(userId: string): Promise<string[]>;
  /** Paiements d'examens payés et pas encore utilisés (identifiants de paiement Stripe). */
  abstract unusedExamPayments(userId: string): Promise<string[]>;
  abstract markExamRefunded(paymentIntentId: string): Promise<void>;
  /** Une suppression du compte est demandée : on ne fait plus payer. */
  abstract erasureScheduled(userId: string): Promise<boolean>;
  abstract createExamPurchase(p: { userId: string; code: string; listPriceCents: number; discountPct: number; amountCents: number; currency: string }): Promise<string>;
  abstract attachCheckout(purchaseId: string, checkoutSessionId: string): Promise<void>;
  /** Achat payé et pas encore utilisé pour cette certification. */
  abstract hasUnusedExamPurchase(userId: string, code: string): Promise<boolean>;
  /** Certifications pour lesquelles la personne a une tentative payée non utilisée. */
  abstract examCredits(userId: string): Promise<Set<string>>;
  /** Consomme un achat payé (verrou de ligne : deux démarrages simultanés ne consomment qu'un achat). */
  abstract consumeExamPurchase(userId: string, code: string): Promise<string | null>;
  abstract releaseExamPurchase(purchaseId: string): Promise<void>;
  abstract linkExamSession(purchaseId: string, examSessionId: string): Promise<void>;
  /**
   * Applique un événement une seule fois (idempotence par identifiant Stripe), dans une transaction.
   * Renvoie false si l'événement avait déjà été traité.
   */
  abstract applyEvent(e: VerifiedEvent, planForPrice: (priceId: string) => string | null): Promise<boolean>;
}
