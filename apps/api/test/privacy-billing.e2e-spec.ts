import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { PaymentGateway } from '../src/modules/billing/application/ports';
import { PrivacyService } from '../src/modules/privacy/application/privacy.service';
import { createTestApp, newIdentity } from './helpers/test-app';
import { OfflineStripe, signedWebhook, stripeEvent, subscriptionObject } from './helpers/offline-stripe';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('RGPD et paiement (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const stripe = new OfflineStripe();
  const http = () => request(app.getHttpServer());
  const webhook = (event: object) => {
    const { payload, signature } = signedWebhook(event);
    return http().post('/api/v1/billing/webhook').set('content-type', 'application/json').set('stripe-signature', signature).send(payload);
  };
  /** Échéance avancée pour ce compte seul (voir privacy.e2e-spec.ts), puis effacement. */
  const eraseNow = async (userId: string) => {
    await pool.query(`UPDATE iam.users SET deletion_due_at = now() - interval '1 second' WHERE id = $1`, [userId]);
    await app.get(PrivacyService).eraseDue(new Date());
  };

  /** Abonné Premium, avec une facture payée. */
  async function subscriber() {
    const identity = newIdentity();
    const token = await tokenFor(identity);
    const as = (r: request.Test) => r.auth(token, { type: 'bearer' });
    const id = (await as(http().get('/api/v1/me')).expect(200)).body.id as string;
    const n = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sub = `sub_rgpd_${n}`;
    const customer = `cus_rgpd_${n}`;
    await webhook(stripeEvent('customer.subscription.created', subscriptionObject({ id: sub, customer, userId: id }))).expect(200);
    await webhook(stripeEvent('invoice.paid', {
      id: `in_rgpd_${n}`, object: 'invoice', customer, status: 'paid', amount_paid: 999, amount_due: 999, currency: 'eur',
      hosted_invoice_url: 'https://invoice.stripe.test/i/rgpd', invoice_pdf: null, created: Math.floor(Date.now() / 1000),
    })).expect(200);
    return { id, as, sub };
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(PaymentGateway).useValue(stripe)));
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });
  afterEach(() => (stripe.failCancel = false));

  it('export : abonnement et factures, sans donnée de carte', async () => {
    const me = await subscriber();
    const data = (await me.as(http().get('/api/v1/me/privacy/export')).expect(200)).body.data;
    expect(data.abonnements).toEqual([expect.objectContaining({ plan_code: 'premium', status: 'active' })]);
    expect(data.factures).toEqual([expect.objectContaining({ amount_cents: 999, currency: 'EUR', url: 'https://invoice.stripe.test/i/rgpd' })]);
    expect(data.achatsExamens).toEqual([]);
  });

  it('effacement : plus de paiement pendant le délai, abonnement résilié, factures gardées', async () => {
    // Pendant le délai d'annulation : on ne fait pas payer un compte qui va disparaître.
    const leaving = await tokenFor(newIdentity());
    const asLeaving = (r: request.Test) => r.auth(leaving, { type: 'bearer' });
    await asLeaving(http().get('/api/v1/me')).expect(200);
    await asLeaving(http().post('/api/v1/me/privacy/erasure').send({ confirmation: 'SUPPRIMER' })).expect(200);
    const refused = await asLeaving(http().post('/api/v1/me/billing/checkout').send({ plan: 'premium' })).expect(409);
    expect(refused.body.message).toMatch(/suppression/);
    await asLeaving(http().delete('/api/v1/me/privacy/erasure')).expect(200);
    await asLeaving(http().post('/api/v1/me/billing/checkout').send({ plan: 'premium' })).expect(200);

    const me = await subscriber();
    await me.as(http().post('/api/v1/me/privacy/erasure').send({ confirmation: 'SUPPRIMER' })).expect(200);

    await eraseNow(me.id);
    expect(stripe.calls.filter((c) => c.method === 'cancelSubscriptionNow').map((c) => c.args)).toContain(me.sub);
    const log = (await pool.query(`SELECT stripe_subscriptions_pending FROM iam.erasure_log WHERE user_id = $1`, [me.id])).rows[0];
    expect(log.stripe_subscriptions_pending).toEqual([]);
    // Pièces comptables : gardées, rattachées au compte anonymisé.
    const kept = await pool.query(
      `SELECT i.amount_cents FROM billing.invoices i JOIN billing.customers c ON c.id = i.customer_id WHERE c.user_id = $1`, [me.id]);
    expect(kept.rows).toEqual([{ amount_cents: 999 }]);
  });

  it('Stripe injoignable : l’effacement a lieu, la résiliation est reprise par la tâche horaire', async () => {
    const me = await subscriber();
    await me.as(http().post('/api/v1/me/privacy/erasure').send({ confirmation: 'SUPPRIMER' })).expect(200);
    stripe.failCancel = true;
    await eraseNow(me.id);
    const pending = async () => (await pool.query(`SELECT stripe_subscriptions_pending p FROM iam.erasure_log WHERE user_id = $1`, [me.id])).rows[0].p;
    expect((await pool.query(`SELECT status FROM iam.users WHERE id = $1`, [me.id])).rows[0].status).toBe('deleted');
    expect(await pending()).toEqual([me.sub]);

    // Toujours en panne : rien ne change.
    await app.get(PrivacyService).runJobs();
    expect(await pending()).toEqual([me.sub]);

    stripe.failCancel = false;
    await app.get(PrivacyService).runJobs();
    expect(await pending()).toEqual([]);
  });
});
