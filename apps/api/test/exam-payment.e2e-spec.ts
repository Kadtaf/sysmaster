import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { PaymentGateway } from '../src/modules/billing/application/ports';
import { createTestApp, newIdentity } from './helpers/test-app';
import { OfflineStripe, signedWebhook, stripeEvent, subscriptionObject } from './helpers/offline-stripe';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const CODE = 'LINUX-ADMIN'; // 79 € au catalogue

describeDb('Paiement des examens (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const stripe = new OfflineStripe();
  const users: string[] = [];
  const http = () => request(app.getHttpServer());
  const webhook = (event: object) => {
    const { payload, signature } = signedWebhook(event);
    return http().post('/api/v1/billing/webhook').set('content-type', 'application/json').set('stripe-signature', signature).send(payload);
  };

  async function learner(labs = true) {
    const identity = newIdentity();
    const token = await tokenFor(identity);
    const as = (r: request.Test) => r.auth(token, { type: 'bearer' });
    await as(http().get('/api/v1/me')).expect(200);
    const id = (await pool.query(`SELECT id FROM iam.users WHERE idp_subject = $1`, [identity.sub])).rows[0].id as string;
    users.push(id);
    if (labs) {
      await pool.query(
        `INSERT INTO labs.instances (template_id, user_id, status, score, expires_at, ended_at)
         SELECT t.id, $1, 'solved', 100, now(), now() FROM labs.lab_templates t
          JOIN assessment.certifications c ON t.slug = ANY(c.required_labs) WHERE c.code = $2`,
        [id, CODE],
      );
    }
    return { id, as };
  }

  /** Paiement d'une tentative jusqu'au webhook de Stripe ; renvoie l'achat. */
  async function pay(as: (r: request.Test) => request.Test) {
    const res = await as(http().post(`/api/v1/certifications/${CODE}/purchase`)).expect(200);
    const purchaseId = res.body.url.split('cs_exam_')[1];
    const sessionId = `cs_exam_${purchaseId}`;
    await webhook(stripeEvent('checkout.session.completed', {
      id: sessionId, object: 'checkout.session', mode: 'payment', payment_status: 'paid', payment_intent: `pi_${purchaseId}`,
      customer: 'cus_x', client_reference_id: null, metadata: { kind: 'exam', purchase_id: purchaseId },
    })).expect(200);
    return { purchaseId, sessionId };
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(PaymentGateway).useValue(stripe)));
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM billing.exam_purchases WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM assessment.exam_sessions WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM labs.instances WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool?.end();
    await app?.close();
  });

  it('payer, puis commencer : une tentative par paiement, reprise sans nouveau paiement', async () => {
    const { id, as } = await learner();
    const before = (await as(http().get(`/api/v1/certifications/${CODE}`)).expect(200)).body;
    expect(before.payment).toEqual({ required: true, amountCents: 7900, discountPct: 0 });
    expect(before.me.paid).toBe(false);

    // Sans paiement : 402, avec le montant.
    const refused = await as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(402);
    expect(refused.body.amountCents).toBe(7900);

    const { purchaseId, sessionId } = await pay(as);
    const sent = stripe.calls.filter((c) => c.method === 'createExamCheckout').at(-1)!.args as Record<string, unknown>;
    expect(sent).toMatchObject({ userId: id, purchaseId, amountCents: 7900, currency: 'EUR' });
    expect(String(sent.successUrl)).toMatch(new RegExp(`/certifications/${CODE}\\?paiement=ok$`));
    expect((await as(http().get(`/api/v1/certifications/${CODE}`)).expect(200)).body.me.paid).toBe(true);

    // Un webhook signé mais d'une autre session ne paie pas un autre achat.
    const { rows: [other] } = await pool.query(
      `INSERT INTO billing.exam_purchases (user_id, certification_code, list_price_cents, amount_cents, stripe_checkout_session_id)
       VALUES ($1, $2, 7900, 7900, 'cs_autre') RETURNING id`,
      [id, CODE],
    );
    await webhook(stripeEvent('checkout.session.completed', {
      id: sessionId, object: 'checkout.session', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_y',
      customer: 'cus_x', metadata: { kind: 'exam', purchase_id: other.id },
    })).expect(200);
    expect((await pool.query(`SELECT status FROM billing.exam_purchases WHERE id = $1`, [other.id])).rows[0].status).toBe('pending');

    // Déjà payé : pas de second paiement.
    await as(http().post(`/api/v1/certifications/${CODE}/purchase`)).expect(409);

    const exam = await as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(201);
    const row = (await pool.query(`SELECT status, exam_session_id FROM billing.exam_purchases WHERE id = $1`, [purchaseId])).rows[0];
    expect(row).toEqual({ status: 'consumed', exam_session_id: exam.body.id });
    // Reprendre l'examen en cours ne coûte rien de plus.
    const resumed = await as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(201);
    expect(resumed.body.id).toBe(exam.body.id);
    expect((await as(http().get(`/api/v1/certifications/${CODE}`)).expect(200)).body.me.paid).toBe(false);
  });

  it('remise de l’offre Premium (−20 %) et remboursement avant usage', async () => {
    const { id, as } = await learner();
    await webhook(stripeEvent('customer.subscription.created', subscriptionObject({ id: `sub_exam_${Date.now()}`, customer: `cus_exam_${Date.now()}`, userId: id }))).expect(200);
    const c = (await as(http().get(`/api/v1/certifications/${CODE}`)).expect(200)).body;
    expect(c.payment).toEqual({ required: true, amountCents: 6320, discountPct: 20 });

    const { purchaseId } = await pay(as);
    const row = (await pool.query(`SELECT list_price_cents, discount_pct, amount_cents, status FROM billing.exam_purchases WHERE id = $1`, [purchaseId])).rows[0];
    expect(row).toEqual({ list_price_cents: 7900, discount_pct: 20, amount_cents: 6320, status: 'paid' });

    await webhook(stripeEvent('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: `pi_${purchaseId}`, refunded: true })).expect(200);
    expect((await pool.query(`SELECT status FROM billing.exam_purchases WHERE id = $1`, [purchaseId])).rows[0].status).toBe('refunded');
    await as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(402);
  });

  it('pas de paiement pour un examen qu’on ne peut pas encore passer', async () => {
    const { as } = await learner(false);
    const calls = stripe.calls.length;
    const res = await as(http().post(`/api/v1/certifications/${CODE}/purchase`)).expect(403);
    expect(res.body.reasons.join(' ')).toMatch(/Lab pratique/);
    expect(stripe.calls.length).toBe(calls);
  });

  it('session de paiement expirée : l’achat reste impayé', async () => {
    const { as } = await learner();
    const res = await as(http().post(`/api/v1/certifications/${CODE}/purchase`)).expect(200);
    const purchaseId = res.body.url.split('cs_exam_')[1];
    await webhook(stripeEvent('checkout.session.expired', {
      id: `cs_exam_${purchaseId}`, object: 'checkout.session', mode: 'payment', payment_status: 'unpaid', payment_intent: null,
      customer: 'cus_x', metadata: { kind: 'exam', purchase_id: purchaseId },
    })).expect(200);
    expect((await pool.query(`SELECT status FROM billing.exam_purchases WHERE id = $1`, [purchaseId])).rows[0].status).toBe('expired');
    await as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(402);
  });
});
