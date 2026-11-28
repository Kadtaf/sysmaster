import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { PaymentGateway } from '../src/modules/billing/application/ports';
import { createTestApp, newIdentity } from './helpers/test-app';
import { OfflineStripe, signedWebhook, stripeEvent } from './helpers/offline-stripe';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const DAY = 86_400_000;

describeDb('Licences achetées en ligne (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const stripe = new OfflineStripe();
  const users: string[] = [];
  const http = () => request(app.getHttpServer());
  let admin: (r: request.Test) => request.Test;

  const webhook = (event: object) => {
    const { payload, signature } = signedWebhook(event);
    return http().post('/api/v1/billing/webhook').set('content-type', 'application/json').set('stripe-signature', signature).send(payload);
  };
  const paid = (sessionId: string, purchaseId: string, type = 'checkout.session.completed') =>
    stripeEvent(type, {
      id: sessionId, object: 'checkout.session', mode: 'payment', payment_status: 'paid', payment_intent: `pi_${purchaseId}`,
      customer: 'cus_x', client_reference_id: null, metadata: { kind: 'seats', purchase_id: purchaseId },
    });

  async function person(roles = ['learner']) {
    const identity = newIdentity();
    const token = await tokenFor(identity, roles);
    const as = (r: request.Test) => r.auth(token, { type: 'bearer' });
    const me = await as(http().get('/api/v1/me')).expect(200);
    users.push(me.body.id);
    return { id: me.body.id as string, as };
  }

  /** Commande jusqu'à la page Stripe ; renvoie la commande et sa session. */
  async function order(as: (r: request.Test) => request.Test, path: string, body: object) {
    const res = await as(http().post(path).send(body)).expect(200);
    const purchaseId = String(res.body.url).split('cs_seats_')[1]!;
    return { purchaseId, sessionId: `cs_seats_${purchaseId}` };
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(PaymentGateway).useValue(stripe)));
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    admin = (await person(['admin'])).as;
  });
  afterAll(async () => {
    const { rows } = await pool.query<{ organization_id: string }>(
      `SELECT DISTINCT organization_id FROM billing.seat_purchases WHERE buyer_id = ANY($1::uuid[]) AND action = 'new' AND organization_id IS NOT NULL`, [users],
    );
    await pool.query(`DELETE FROM billing.seat_purchases WHERE buyer_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM iam.organizations WHERE id = ANY($1::uuid[])`, [rows.map((r) => r.organization_id)]);
    await pool.query(`UPDATE billing.plans SET price_cents = NULL WHERE code = 'school'`);
    await pool?.end();
    await app?.close();
  });

  it('sans prix fixé, seule la voie du devis existe', async () => {
    await pool.query(`UPDATE billing.plans SET price_cents = NULL WHERE code = 'school'`);
    const catalog = (await http().get('/api/v1/billing/plans').expect(200)).body;
    expect(catalog.seatOffers.find((o: { kind: string }) => o.kind === 'school')).toBeUndefined();
    expect(catalog.onlineSeatMax).toBe(50);
    const { as } = await person();
    await as(http().post('/api/v1/organizations/purchase').send({ kind: 'school', name: 'Lycée test', seats: 3 })).expect(409);
  });

  it('seul un administrateur fixe le prix du siège, et seulement pour une offre par siège', async () => {
    const { as } = await person();
    await as(http().patch('/api/v1/admin/organizations/seat-prices/school').send({ priceCents: 4900 })).expect(403);
    await admin(http().patch('/api/v1/admin/organizations/seat-prices/pro').send({ priceCents: 4900 })).expect(404);
    await admin(http().patch('/api/v1/admin/organizations/seat-prices/school').send({ priceCents: 4900 })).expect(204);
    const catalog = (await http().get('/api/v1/billing/plans').expect(200)).body;
    expect(catalog.seatOffers).toContainEqual(expect.objectContaining({ kind: 'school', plan: 'school', unitPriceCents: 4900 }));
    const audit = await pool.query(`SELECT metadata FROM platform.audit_log WHERE action = 'billing.seat_price' AND target_id = 'school' ORDER BY created_at DESC LIMIT 1`);
    expect(audit.rows[0]?.metadata).toMatchObject({ after: 4900 });
  });

  it('acheter, payer : l’organisation est créée, l’acheteur en est propriétaire et a les droits Pro', async () => {
    await pool.query(`UPDATE billing.plans SET price_cents = 4900 WHERE code = 'school'`);
    const buyer = await person();
    await buyer.as(http().post('/api/v1/organizations/purchase').send({ kind: 'school', name: 'Lycée test', seats: 51 })).expect(400);

    const { purchaseId, sessionId } = await order(buyer.as, '/api/v1/organizations/purchase', { kind: 'school', name: 'Lycée Jean-Zay (test)', seats: 3 });
    const sent = stripe.calls.filter((c) => c.method === 'createSeatCheckout').at(-1)!.args as Record<string, unknown>;
    expect(sent).toMatchObject({ purchaseId, userId: buyer.id, quantity: 3, unitAmountCents: 4900, currency: 'EUR' });
    expect(String(sent.successUrl)).toMatch(/\/organisation\?paiement=ok$/);
    // Rien tant que Stripe n'a pas confirmé.
    expect((await buyer.as(http().get('/api/v1/organizations/mine')).expect(200)).body).toEqual([]);

    // Une session signée mais différente ne paie pas cette commande.
    await webhook(paid('cs_autre', purchaseId)).expect(200);
    expect((await buyer.as(http().get('/api/v1/organizations/mine')).expect(200)).body).toEqual([]);

    const event = paid(sessionId, purchaseId);
    await webhook(event).expect(200);
    const again = await webhook(event).expect(200);
    expect(again.body.duplicate).toBe(true);
    // Un second événement (paiement différé confirmé) n'ouvre pas une deuxième organisation.
    await webhook(paid(sessionId, purchaseId, 'checkout.session.async_payment_succeeded')).expect(200);

    const mine = (await buyer.as(http().get('/api/v1/organizations/mine')).expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: 'Lycée Jean-Zay (test)', kind: 'school', role: 'org_owner', licence: { state: 'active' } });
    const detail = (await buyer.as(http().get(`/api/v1/organizations/${mine[0].id}`)).expect(200)).body;
    expect(detail).toMatchObject({ seats: 3, seatsUsed: 1, canManage: true, licence: { seatPlan: 'pro' } });
    expect(detail.slug).toMatch(/^lycee-jean-zay-test-[0-9a-f]{6}$/);
    const months = (Date.parse(detail.licence.endsAt) - Date.now()) / (30.4 * DAY);
    expect(months).toBeGreaterThan(11.8);
    expect(months).toBeLessThan(12.2);
    expect((await buyer.as(http().get('/api/v1/me/billing')).expect(200)).body.plan).toBe('pro');

    const purchase = (await pool.query(`SELECT status, organization_id, amount_cents FROM billing.seat_purchases WHERE id = $1`, [purchaseId])).rows[0];
    expect(purchase).toEqual({ status: 'paid', organization_id: mine[0].id, amount_cents: 14_700 });
    const audit = await pool.query(`SELECT 1 FROM platform.audit_log WHERE action = 'organization.licence_purchased' AND target_id = $1`, [mine[0].id]);
    expect(audit.rowCount).toBe(1);

    // L'export RGPD de l'acheteur contient sa commande, sans données de carte.
    const exported = (await buyer.as(http().get('/api/v1/me/privacy/export')).expect(200)).body;
    expect(JSON.stringify(exported)).toContain('Lycée Jean-Zay (test)');
  });

  it('ajouter des sièges au prorata et renouveler pour 12 mois ; gestionnaires seulement', async () => {
    await pool.query(`UPDATE billing.plans SET price_cents = 4900 WHERE code = 'school'`);
    const owner = await person();
    const first = await order(owner.as, '/api/v1/organizations/purchase', { kind: 'school', name: 'Collège test', seats: 2 });
    await webhook(paid(first.sessionId, first.purchaseId)).expect(200);
    const orgId = (await owner.as(http().get('/api/v1/organizations/mine')).expect(200)).body[0].id as string;

    // Licence ramenée à 73 jours restants : un siège ajouté coûte un cinquième du prix annuel.
    await pool.query(`UPDATE iam.organizations SET licence_ends_at = now() + interval '73 days' - interval '1 minute' WHERE id = $1`, [orgId]);
    const offer = (await owner.as(http().get(`/api/v1/organizations/${orgId}/licence-offer`)).expect(200)).body;
    expect(offer).toMatchObject({ purchasable: true, unitPriceCents: 4900, maxSeats: 50, renew: { minSeats: 1 }, addSeats: { remainingDays: 73, pricePerSeatCents: 980 } });

    const add = await order(owner.as, `/api/v1/organizations/${orgId}/purchase`, { action: 'add_seats', seats: 2 });
    expect((stripe.calls.at(-1)!.args as Record<string, unknown>)).toMatchObject({ quantity: 2, unitAmountCents: 980 });
    await webhook(paid(add.sessionId, add.purchaseId)).expect(200);
    expect((await owner.as(http().get(`/api/v1/organizations/${orgId}`)).expect(200)).body.seats).toBe(4);

    const before = (await pool.query<{ e: Date }>(`SELECT licence_ends_at AS e FROM iam.organizations WHERE id = $1`, [orgId])).rows[0]!.e;
    const renew = await order(owner.as, `/api/v1/organizations/${orgId}/purchase`, { action: 'renew', seats: 3 });
    await webhook(paid(renew.sessionId, renew.purchaseId)).expect(200);
    const after = (await owner.as(http().get(`/api/v1/organizations/${orgId}`)).expect(200)).body;
    expect(after.seats).toBe(3);
    // 12 mois ajoutés à la fin en cours, pas à aujourd'hui.
    const gainedDays = (Date.parse(after.licence.endsAt) - before.getTime()) / DAY;
    expect(gainedDays).toBeGreaterThanOrEqual(365);
    expect(gainedDays).toBeLessThanOrEqual(366);

    // Licence expirée : plus d'ajout, seulement le renouvellement.
    await pool.query(`UPDATE iam.organizations SET licence_ends_at = now() - interval '1 day' WHERE id = $1`, [orgId]);
    expect((await owner.as(http().get(`/api/v1/organizations/${orgId}/licence-offer`)).expect(200)).body.addSeats).toBeNull();
    await owner.as(http().post(`/api/v1/organizations/${orgId}/purchase`).send({ action: 'add_seats', seats: 1 })).expect(409);

    // Ni un inconnu, ni un simple membre.
    const stranger = await person();
    await stranger.as(http().get(`/api/v1/organizations/${orgId}/licence-offer`)).expect(404);
    await stranger.as(http().post(`/api/v1/organizations/${orgId}/purchase`).send({ action: 'renew', seats: 5 })).expect(404);
    await pool.query(`INSERT INTO iam.memberships (organization_id, user_id, role_code) VALUES ($1, $2, 'member')`, [orgId, stranger.id]);
    await stranger.as(http().post(`/api/v1/organizations/${orgId}/purchase`).send({ action: 'renew', seats: 5 })).expect(403);
    // Deux sièges pris : renouveler pour un seul est refusé.
    await owner.as(http().post(`/api/v1/organizations/${orgId}/purchase`).send({ action: 'renew', seats: 1 })).expect(409);
  });

  it('session expirée : la commande est close sans rien ouvrir', async () => {
    await pool.query(`UPDATE billing.plans SET price_cents = 4900 WHERE code = 'school'`);
    const buyer = await person();
    const { purchaseId, sessionId } = await order(buyer.as, '/api/v1/organizations/purchase', { kind: 'school', name: 'École abandonnée', seats: 1 });
    await webhook(stripeEvent('checkout.session.expired', {
      id: sessionId, object: 'checkout.session', mode: 'payment', payment_status: 'unpaid', payment_intent: null,
      customer: 'cus_x', metadata: { kind: 'seats', purchase_id: purchaseId },
    })).expect(200);
    const row = (await pool.query(`SELECT status, organization_id FROM billing.seat_purchases WHERE id = $1`, [purchaseId])).rows[0];
    expect(row).toEqual({ status: 'expired', organization_id: null });
  });
});
