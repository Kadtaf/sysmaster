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
});
