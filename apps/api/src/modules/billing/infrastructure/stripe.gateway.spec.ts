import Stripe from 'stripe';
import { InvalidWebhookError } from '../application/ports';
import { StripeGateway } from './stripe.gateway';

const secret = 'whsec_test_secret';
const sign = (payload: string, s = secret) => new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload, secret: s });

const subscriptionEvent = {
  id: 'evt_1',
  object: 'event',
  type: 'customer.subscription.updated',
  created: 1_790_000_000,
  data: {
    object: {
      id: 'sub_1',
      object: 'subscription',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      cancel_at: null,
      metadata: { user_id: 'u-1' },
      items: { data: [{ price: { id: 'price_premium' }, current_period_end: 1_792_000_000 }] },
    },
  },
};

describe('StripeGateway', () => {
  it('désactivé sans clé : aucune requête possible', async () => {
    const g = new StripeGateway({ prices: 'premium:price_premium' });
    expect(g.enabled).toBe(false);
    await expect(g.createCustomer('u')).rejects.toThrow(/pas encore ouvert/);
    expect(() => g.verifyWebhook(Buffer.from('{}'), 'x')).toThrow(InvalidWebhookError);
  });

  it('associe offres et prix', () => {
    const g = new StripeGateway({ secretKey: 'sk_test_x', webhookSecret: secret, prices: 'premium:price_premium,pro:price_pro' });
    expect(g.enabled).toBe(true);
    expect(g.priceFor('pro')).toBe('price_pro');
    expect(g.planForPrice('price_premium')).toBe('premium');
    expect(g.planForPrice('price_autre')).toBeNull();
  });

  it('vérifie la signature et traduit un abonnement (période portée par la ligne)', () => {
    const g = new StripeGateway({ secretKey: 'sk_test_x', webhookSecret: secret });
    const payload = JSON.stringify(subscriptionEvent);
    const v = g.verifyWebhook(Buffer.from(payload), sign(payload));
    expect(v).toMatchObject({ id: 'evt_1', type: 'customer.subscription.updated' });
    expect(v.event).toEqual({
      kind: 'subscription', subscriptionId: 'sub_1', customerId: 'cus_1', priceId: 'price_premium', status: 'active',
      currentPeriodEnd: new Date(1_792_000_000 * 1000), cancelAtPeriodEnd: false, userId: 'u-1',
    });
  });

  it('refuse une signature fausse, absente ou un corps modifié', () => {
    const g = new StripeGateway({ secretKey: 'sk_test_x', webhookSecret: secret });
    const payload = JSON.stringify(subscriptionEvent);
    expect(() => g.verifyWebhook(Buffer.from(payload), sign(payload, 'whsec_autre'))).toThrow(InvalidWebhookError);
    expect(() => g.verifyWebhook(Buffer.from(payload), undefined)).toThrow(InvalidWebhookError);
    expect(() => g.verifyWebhook(Buffer.from(payload.replace('active', 'trialing')), sign(payload))).toThrow(InvalidWebhookError);
  });

  it('note sans effet un type d’événement inutile ici', () => {
    const g = new StripeGateway({ secretKey: 'sk_test_x', webhookSecret: secret });
    const payload = JSON.stringify({ id: 'evt_2', object: 'event', type: 'charge.succeeded', created: 1, data: { object: {} } });
    expect(g.verifyWebhook(Buffer.from(payload), sign(payload)).event).toBeNull();
  });

  it('traduit le paiement d’un examen : payé, en attente (prélèvement), expiré, remboursé', () => {
    const g = new StripeGateway({ secretKey: 'sk_test_x', webhookSecret: secret });
    const session = (payment_status: string) => ({
      id: 'cs_1', object: 'checkout.session', mode: 'payment', payment_status, payment_intent: 'pi_1', customer: 'cus_1',
      metadata: { kind: 'exam', purchase_id: 'p-1' },
    });
    const run = (type: string, object: object) => {
      const payload = JSON.stringify({ id: 'evt_x', object: 'event', type, created: 1, data: { object } });
      return g.verifyWebhook(Buffer.from(payload), sign(payload)).event;
    };
    const base = { kind: 'exam_payment', purchaseId: 'p-1', checkoutSessionId: 'cs_1', paymentIntentId: 'pi_1' };
    expect(run('checkout.session.completed', session('paid'))).toEqual({ ...base, outcome: 'paid' });
    expect(run('checkout.session.completed', session('unpaid'))).toEqual({ ...base, outcome: 'pending' });
    expect(run('checkout.session.async_payment_succeeded', session('paid'))).toEqual({ ...base, outcome: 'paid' });
    expect(run('checkout.session.async_payment_failed', session('unpaid'))).toEqual({ ...base, outcome: 'failed' });
    expect(run('checkout.session.expired', session('unpaid'))).toEqual({ ...base, outcome: 'expired' });
    expect(run('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_1', refunded: true })).toEqual({ kind: 'refund', paymentIntentId: 'pi_1' });
    // Remboursement partiel : l'achat reste valable.
    expect(run('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_1', refunded: false })).toBeNull();
  });

  describe('résiliation immédiate (effacement du compte)', () => {
    const gateway = (sub: { status?: string; missing?: boolean }) => {
      const g = new StripeGateway({ secretKey: 'sk_test_x', webhookSecret: secret, prices: 'premium:price_premium' });
      const cancel = jest.fn().mockResolvedValue({});
      const retrieve = jest.fn(async () => {
        if (sub.missing) throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
        return { status: sub.status };
      });
      (g as unknown as { client: unknown }).client = { subscriptions: { retrieve, cancel } };
      return { g, cancel };
    };

    it('résilie un abonnement en cours, avec une clé d’idempotence', async () => {
      const { g, cancel } = gateway({ status: 'active' });
      await g.cancelSubscriptionNow('sub_1');
      expect(cancel).toHaveBeenCalledWith('sub_1', {}, { idempotencyKey: 'erasure-cancel-sub_1' });
    });

    it('sans effet sur un abonnement déjà résilié ou inconnu de Stripe', async () => {
      for (const o of [{ status: 'canceled' }, { status: 'incomplete_expired' }, { missing: true }]) {
        const { g, cancel } = gateway(o);
        await expect(g.cancelSubscriptionNow('sub_1')).resolves.toBeUndefined();
        expect(cancel).not.toHaveBeenCalled();
      }
    });
  });

  describe('remboursement (effacement du compte)', () => {
    const gateway = (fail?: string) => {
      const g = new StripeGateway({ secretKey: 'sk_test_x', webhookSecret: secret, prices: 'premium:price_premium' });
      const create = jest.fn(async () => {
        if (fail) throw Object.assign(new Error(fail), { code: fail });
        return {};
      });
      (g as unknown as { client: unknown }).client = { refunds: { create } };
      return { g, create };
    };

    it('rembourse en totalité, avec une clé d’idempotence', async () => {
      const { g, create } = gateway();
      await g.refundPayment('pi_1');
      expect(create).toHaveBeenCalledWith({ payment_intent: 'pi_1', reason: 'requested_by_customer' }, { idempotencyKey: 'erasure-refund-pi_1' });
    });

    it('déjà remboursé : sans effet ; autre erreur : remontée', async () => {
      await expect(gateway('charge_already_refunded').g.refundPayment('pi_1')).resolves.toBeUndefined();
      await expect(gateway('api_error').g.refundPayment('pi_1')).rejects.toThrow('api_error');
    });
  });
});
