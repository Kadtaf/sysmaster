import Stripe from 'stripe';
import { StripeGateway } from '../../src/modules/billing/infrastructure/stripe.gateway';

export const WHSEC = 'whsec_e2e_secret';
const signer = new Stripe('sk_test_x').webhooks;

/** Vraie vérification de signature et vraie traduction ; seuls les appels sortants vers Stripe sont simulés. */
export class OfflineStripe extends StripeGateway {
  readonly calls: { method: string; args: unknown }[] = [];
  /** Simule une panne de Stripe à la résiliation. */
  failCancel = false;
  private n = 0;
  constructor() {
    super({ secretKey: 'sk_test_offline', webhookSecret: WHSEC, prices: 'premium:price_premium,pro:price_pro' });
  }
  override async createCustomer(userId: string) {
    this.calls.push({ method: 'createCustomer', args: userId });
    return `cus_e2e_${Date.now()}_${++this.n}`;
  }
  override async createCheckout(o: Parameters<StripeGateway['createCheckout']>[0]) {
    this.calls.push({ method: 'createCheckout', args: o });
    return 'https://checkout.stripe.test/c/pay/cs_test_1';
  }
  override async createExamCheckout(o: Parameters<StripeGateway['createExamCheckout']>[0]) {
    this.calls.push({ method: 'createExamCheckout', args: o });
    return { url: `https://checkout.stripe.test/c/pay/cs_exam_${o.purchaseId}`, sessionId: `cs_exam_${o.purchaseId}` };
  }
  override async cancelSubscriptionNow(subscriptionId: string) {
    this.calls.push({ method: 'cancelSubscriptionNow', args: subscriptionId });
    if (this.failCancel) throw new Error('Stripe injoignable (simulé)');
  }
  override async createPortal(customerId: string, returnUrl: string) {
    this.calls.push({ method: 'createPortal', args: { customerId, returnUrl } });
    return 'https://billing.stripe.test/p/session_1';
  }
}

let seq = 0;
export const stripeEvent = (type: string, object: Record<string, unknown>, created = Math.floor(Date.now() / 1000)) => ({
  id: `evt_e2e_${Date.now()}_${++seq}`, object: 'event', type, created, data: { object },
});

export function signedWebhook(event: object, secret = WHSEC) {
  const payload = JSON.stringify(event);
  return { payload, signature: signer.generateTestHeaderString({ payload, secret }) };
}

export const subscriptionObject = (o: { id: string; customer: string; price?: string; status?: string; userId?: string; cancel?: boolean }) => ({
  id: o.id, object: 'subscription', customer: o.customer, status: o.status ?? 'active', cancel_at_period_end: o.cancel ?? false, cancel_at: null,
  metadata: o.userId ? { user_id: o.userId } : {},
  items: { data: [{ price: { id: o.price ?? 'price_premium' }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
});
