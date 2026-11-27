import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { PaymentGateway } from '../src/modules/billing/application/ports';
import { createTestApp } from './helpers/test-app';
import { OfflineStripe, signedWebhook, stripeEvent, subscriptionObject, WHSEC } from './helpers/offline-stripe';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const evt = stripeEvent;
const subscription = subscriptionObject;

describeDb('Paiement (e2e)', () => {
  describe('sans clé Stripe', () => {
    let app: INestApplication;
    let tokenFor: (typeof createTestApp extends (...a: never[]) => Promise<infer R> ? R : never)['tokenFor'];
    beforeAll(async () => {
      delete process.env.STRIPE_SECRET_KEY;
      ({ app, tokenFor } = await createTestApp());
    });
    afterAll(() => app?.close());

    it('les offres s’affichent mais rien ne se paie, et le webhook est fermé', async () => {
      const http = () => request(app.getHttpServer());
      const plans = await http().get('/api/v1/billing/plans').expect(200);
      expect(plans.body.enabled).toBe(false);
      expect(plans.body.plans.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['free', 'premium', 'pro']));
      expect(plans.body.plans.every((p: { purchasable: boolean }) => !p.purchasable)).toBe(true);
      const free = plans.body.plans.find((p: { code: string }) => p.code === 'free');
      expect(free).toMatchObject({ priceCents: 0, aiQuestionsPerDay: 10 });

      const token = await tokenFor();
      await http().post('/api/v1/me/billing/checkout').auth(token, { type: 'bearer' }).send({ plan: 'premium' }).expect(503);
      const me = await http().get('/api/v1/me/billing').auth(token, { type: 'bearer' }).expect(200);
      expect(me.body).toMatchObject({ enabled: false, plan: 'free', subscription: null, canManage: false, invoices: [] });
      await http().post('/api/v1/billing/webhook').set('stripe-signature', 'x').send({}).expect(503);
    });
  });

  describe('avec Stripe (appels sortants simulés)', () => {
    let app: INestApplication;
    let pool: Pool;
    let tokenFor: (typeof createTestApp extends (...a: never[]) => Promise<infer R> ? R : never)['tokenFor'];
    const stripe = new OfflineStripe();
    const http = () => request(app.getHttpServer());
    const webhook = (event: object, secret = WHSEC) => {
      const { payload, signature } = signedWebhook(event, secret);
      return http().post('/api/v1/billing/webhook').set('content-type', 'application/json').set('stripe-signature', signature).send(payload);
    };

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL });
      ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(PaymentGateway).useValue(stripe)));
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
    });

    it('souscription : paiement, webhook signé, offre appliquée au quota IA, résiliation', async () => {
      const token = await tokenFor();
      const auth = (r: request.Test) => r.auth(token, { type: 'bearer' });
      const me = await auth(http().get('/api/v1/me')).expect(200);
      const userId: string = me.body.id;

      const plans = await http().get('/api/v1/billing/plans').expect(200);
      expect(plans.body.enabled).toBe(true);
      expect(plans.body.plans.find((p: { code: string }) => p.code === 'pro').purchasable).toBe(true);
      expect(plans.body.plans.find((p: { code: string }) => p.code === 'enterprise').purchasable).toBe(false);

      // Offre inconnue ou sur devis : refusée avant tout appel à Stripe.
      await auth(http().post('/api/v1/me/billing/checkout')).send({ plan: 'enterprise' }).expect(400);

      const checkout = await auth(http().post('/api/v1/me/billing/checkout')).send({ plan: 'premium' }).expect(200);
      expect(checkout.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
      const sent = stripe.calls.find((c) => c.method === 'createCheckout')!.args as Record<string, string>;
      expect(sent).toMatchObject({ priceId: 'price_premium', userId });
      expect(sent.successUrl).toMatch(/\/abonnement\?paiement=ok$/);
      // Aucune donnée personnelle envoyée à la création du client : seulement l'identifiant interne.
      expect(stripe.calls.find((c) => c.method === 'createCustomer')!.args).toBe(userId);
      const customer = (await pool.query(`SELECT stripe_customer_id FROM billing.customers WHERE user_id = $1`, [userId])).rows[0].stripe_customer_id;

      // Un second paiement réutilise le même client.
      await auth(http().post('/api/v1/me/billing/checkout')).send({ plan: 'pro' }).expect(200);
      expect(stripe.calls.filter((c) => c.method === 'createCustomer')).toHaveLength(1);

      // Avant le webhook, rien n'a changé.
      expect((await auth(http().get('/api/v1/me/billing')).expect(200)).body.plan).toBe('free');
      const billing = app.get(BillingService);
      expect(await billing.aiDailyCap(userId)).toBe(10);

      // Signature fausse : refusée, rien d'écrit.
      const subId = `sub_e2e_${Date.now()}`;
      const created = evt('customer.subscription.created', subscription({ id: subId, customer, userId }));
      await webhook(created, 'whsec_pirate').expect(400);
      expect((await auth(http().get('/api/v1/me/billing')).expect(200)).body.plan).toBe('free');

      await webhook(created).expect(200, { received: true, duplicate: false });
      // Stripe renvoie parfois le même événement : sans effet la seconde fois.
      await webhook(created).expect(200, { received: true, duplicate: true });

      const status = (await auth(http().get('/api/v1/me/billing')).expect(200)).body;
      expect(status).toMatchObject({ plan: 'premium', canManage: true, subscription: { plan: 'premium', status: 'active', cancelAtPeriodEnd: false } });
      expect(await billing.aiDailyCap(userId)).toBe(100);

      // Déjà abonné : on ne paie pas deux fois, on passe par le portail.
      await auth(http().post('/api/v1/me/billing/checkout')).send({ plan: 'pro' }).expect(409);
      const portal = await auth(http().post('/api/v1/me/billing/portal')).expect(200);
      expect(portal.body.url).toMatch(/^https:\/\/billing\.stripe\.test\//);

      // Passage à Pro par le portail, puis un vieil événement arrivé en retard : ignoré.
      const now = Math.floor(Date.now() / 1000);
      await webhook(evt('customer.subscription.updated', subscription({ id: subId, customer, price: 'price_pro' }), now + 10)).expect(200);
      await webhook(evt('customer.subscription.updated', subscription({ id: subId, customer, price: 'price_premium' }), now - 100)).expect(200);
      expect((await auth(http().get('/api/v1/me/billing')).expect(200)).body.plan).toBe('pro');
      expect(await billing.aiDailyCap(userId)).toBe(500);

      // Facture payée, visible dans Mon abonnement.
      await webhook(evt('invoice.paid', {
        id: `in_e2e_${Date.now()}`, object: 'invoice', customer, status: 'paid', amount_paid: 1999, amount_due: 1999, currency: 'eur',
        hosted_invoice_url: 'https://invoice.stripe.test/i/1', invoice_pdf: null, created: now,
      }, now + 11)).expect(200);
      const invoices = (await auth(http().get('/api/v1/me/billing')).expect(200)).body.invoices;
      expect(invoices).toEqual([expect.objectContaining({ amountCents: 1999, currency: 'EUR', status: 'paid', url: 'https://invoice.stripe.test/i/1' })]);

      // Résiliation effective : retour à l'offre gratuite.
      await webhook(evt('customer.subscription.deleted', subscription({ id: subId, customer, price: 'price_pro', status: 'canceled' }), now + 20)).expect(200);
      expect((await auth(http().get('/api/v1/me/billing')).expect(200)).body).toMatchObject({ plan: 'free', subscription: { status: 'canceled' } });
      expect(await billing.aiDailyCap(userId)).toBe(10);
    });

    it('abonnement d’un client pas encore lié : rattaché grâce aux métadonnées posées au paiement', async () => {
      const token = await tokenFor();
      const me = await request(app.getHttpServer()).get('/api/v1/me').auth(token, { type: 'bearer' }).expect(200);
      const customer = `cus_e2e_orphelin_${Date.now()}`;
      await webhook(evt('customer.subscription.created', subscription({ id: `sub_e2e_o_${Date.now()}`, customer, userId: me.body.id }))).expect(200);
      const st = await request(app.getHttpServer()).get('/api/v1/me/billing').auth(token, { type: 'bearer' }).expect(200);
      expect(st.body.plan).toBe('premium');
    });

    it('prix inconnu : aucune offre devinée, erreur pour que Stripe renvoie l’événement plus tard', async () => {
      const token = await tokenFor();
      const me = await request(app.getHttpServer()).get('/api/v1/me').auth(token, { type: 'bearer' }).expect(200);
      const e = evt('customer.subscription.created', subscription({ id: `sub_e2e_x_${Date.now()}`, customer: `cus_e2e_x_${Date.now()}`, userId: me.body.id, price: 'price_inconnu' }));
      await webhook(e).expect(500);
      const st = await request(app.getHttpServer()).get('/api/v1/me/billing').auth(token, { type: 'bearer' }).expect(200);
      expect(st.body.plan).toBe('free');
      // Rien n'est noté : le renvoi de Stripe sera traité normalement.
      const noted = await pool.query(`SELECT 1 FROM billing.stripe_webhook_events WHERE stripe_event_id = $1`, [e.id]);
      expect(noted.rowCount).toBe(0);
    });
  });
});
