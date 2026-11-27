import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { UserProvisioner } from '../src/modules/iam/application/user-provisioner';
import { PrivacyService } from '../src/modules/privacy/application/privacy.service';
import { createTestApp, newIdentity } from './helpers/test-app';
import { PaymentGateway } from '../src/modules/billing/application/ports';
import { OfflineStripe, signedWebhook, stripeEvent, subscriptionObject } from './helpers/offline-stripe';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('RGPD : export, effacement, conservation (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const http = () => request(app.getHttpServer());

  async function member() {
    const identity = newIdentity();
    const token = await tokenFor(identity);
    const as = (r: request.Test) => r.auth(token, { type: 'bearer' });
    await as(http().get('/api/v1/me')).expect(200);
    const id = (await pool.query(`SELECT id FROM iam.users WHERE idp_subject = $1`, [identity.sub])).rows[0].id as string;
    return { id, identity, as };
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });

  it('export : mes données, et rien des autres membres', async () => {
    const me = await member();
    const other = await member();
    const { id: groupId } = (await me.as(http().post('/api/v1/community/groups').send({ name: 'Révisions RGPD', description: 'Un groupe pour réviser ensemble.', goal: 'Réussir', isPublic: true, maxMembers: 5 })).expect(201)).body;
    await other.as(http().post(`/api/v1/community/groups/${groupId}/join`)).expect(200);
    await me.as(http().post(`/api/v1/community/groups/${groupId}/messages`).send({ bodyMd: 'Mon message à moi.' })).expect(201);
    await other.as(http().post(`/api/v1/community/groups/${groupId}/messages`).send({ bodyMd: 'Le message de quelqu’un d’autre.' })).expect(201);

    const res = await me.as(http().get('/api/v1/me/privacy/export')).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body).toMatchObject({ format: 'sysmaster-export/1', data: { profil: { id: me.id, email: me.identity.email } } });
    expect(res.body.data.messages.map((m: { body_md: string }) => m.body_md)).toEqual(['Mon message à moi.']);
    expect(JSON.stringify(res.body)).not.toContain('quelqu’un d’autre');
    expect(JSON.stringify(res.body)).not.toContain(other.identity.email);
    await http().get('/api/v1/me/privacy/export').expect(401);
  });

  it('effacement : confirmation, annulation, puis exécution à échéance', async () => {
    const me = await member();
    const other = await member();
    const { id: groupId } = (await me.as(http().post('/api/v1/community/groups').send({ name: 'Groupe transmis', description: 'Le groupe survivra à son responsable.', goal: 'Tester', isPublic: true, maxMembers: 5 })).expect(201)).body;
    await other.as(http().post(`/api/v1/community/groups/${groupId}/join`)).expect(200);
    await me.as(http().post(`/api/v1/community/groups/${groupId}/messages`).send({ bodyMd: 'Message privé à effacer.' })).expect(201);
    const thread = (await me.as(http().post('/api/v1/community/threads').send({ categorySlug: 'linux', title: 'Question qui doit rester lisible', bodyMd: 'Le contenu public reste, sans mon nom.', tags: [] })).expect(201)).body;

    await me.as(http().post('/api/v1/me/privacy/erasure').send({ confirmation: 'oui' })).expect(400);
    const scheduled = (await me.as(http().post('/api/v1/me/privacy/erasure').send({ confirmation: 'SUPPRIMER' })).expect(200)).body;
    expect(scheduled.erasure).toMatchObject({ status: 'scheduled', cancellable: true });
    await me.as(http().post('/api/v1/me/privacy/erasure').send({ confirmation: 'SUPPRIMER' })).expect(409);
    await me.as(http().delete('/api/v1/me/privacy/erasure')).expect(200);
    expect((await me.as(http().get('/api/v1/me/privacy')).expect(200)).body.erasure).toEqual({ status: 'none' });

    await me.as(http().post('/api/v1/me/privacy/erasure').send({ confirmation: 'SUPPRIMER' })).expect(200);
    const privacy = app.get(PrivacyService);
    // Avant l'échéance : rien n'est effacé.
    await privacy.eraseDue(new Date());
    expect((await pool.query(`SELECT status FROM iam.users WHERE id = $1`, [me.id])).rows[0].status).toBe('active');
    // Après le délai de grâce. L'échéance est avancée pour ce compte seul : avancer l'horloge effacerait
    // aussi les comptes que les autres suites, lancées en parallèle, ont mis en attente.
    await pool.query(`UPDATE iam.users SET deletion_due_at = now() - interval '1 second' WHERE id = $1`, [me.id]);
    await privacy.eraseDue(new Date());

    const u = (await pool.query(`SELECT email, display_name, idp_subject, status FROM iam.users WHERE id = $1`, [me.id])).rows[0];
    expect(u).toEqual({ email: `supprime-${me.id}@invalid`, display_name: 'Compte supprimé', idp_subject: null, status: 'deleted' });
    expect((await pool.query(`SELECT count(*)::int AS n FROM community.messages WHERE author_id = $1`, [me.id])).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT owner_id FROM community.study_groups WHERE id = $1`, [groupId])).rows[0].owner_id).toBe(other.id);
    const log = (await pool.query(`SELECT idp_deleted, idp_subject, counts FROM iam.erasure_log WHERE user_id = $1`, [me.id])).rows[0];
    // Pas de client d'administration Keycloak en test : le registre garde l'identifiant Keycloak, et lui seul, pour finir le travail.
    expect(log).toMatchObject({ idp_deleted: false, idp_subject: me.identity.sub });
    expect(log.counts['community.messages']).toBe(1);
    const shown = (await http().get(`/api/v1/community/threads/${thread.id}`).expect(200)).body;
    expect(JSON.stringify(shown)).toContain('Compte supprimé');
    expect(JSON.stringify(shown)).not.toContain(me.identity.email);

    // Se reconnecter avec le même compte Keycloak crée un compte neuf, vide. Le cache d'authentification
    // ne dépasse jamais l'échéance (voir UserProvisioner) ; ici le temps est simulé, on le vide.
    (app.get(UserProvisioner) as unknown as { cache: Map<string, unknown> }).cache.clear();
    await me.as(http().get('/api/v1/me')).expect(200);
    const fresh = (await pool.query(`SELECT id FROM iam.users WHERE idp_subject = $1`, [me.identity.sub])).rows[0].id;
    expect(fresh).not.toBe(me.id);
  });

  it('conservation : les vieilles conversations de l’assistant sont purgées', async () => {
    const me = await member();
    const old = (await pool.query(
      `INSERT INTO ai.conversations (user_id, title, created_at) VALUES ($1, 'Ancienne', now() - interval '400 days') RETURNING id`,
      [me.id],
    )).rows[0].id;
    await pool.query(`INSERT INTO ai.messages (conversation_id, role, content, created_at) VALUES ($1, 'user', '{"text":"vieux"}', now() - interval '400 days')`, [old]);
    const recent = (await pool.query(`INSERT INTO ai.conversations (user_id, title) VALUES ($1, 'Récente') RETURNING id`, [me.id])).rows[0].id;
    await app.get(PrivacyService).runJobs();
    const left = (await pool.query(`SELECT id FROM ai.conversations WHERE user_id = $1`, [me.id])).rows.map((r) => r.id);
    expect(left).toEqual([recent]);
  });
});

// Dans le même fichier que les autres tests d'effacement : un effacement à échéance traite tous les
// comptes dus, et deux suites en parallèle s'effaceraient leurs comptes l'une à l'autre.
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
    // Une tentative d'examen payée, pas encore utilisée.
    const pi = `pi_rgpd_${n}`;
    const purchase = (await pool.query(
      `INSERT INTO billing.exam_purchases (user_id, certification_code, list_price_cents, discount_pct, amount_cents, status, stripe_payment_intent_id, paid_at)
       VALUES ($1, 'LINUX-ADMIN', 7900, 20, 6320, 'paid', $2, now()) RETURNING id`, [id, pi])).rows[0].id as string;
    return { id, as, sub, pi, purchase };
  }
  const purchaseStatus = async (id: string) => (await pool.query(`SELECT status FROM billing.exam_purchases WHERE id = $1`, [id])).rows[0].status;

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(PaymentGateway).useValue(stripe)));
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });
  afterEach(() => (stripe.failing = false));

  it('export : abonnement et factures, sans donnée de carte', async () => {
    const me = await subscriber();
    const data = (await me.as(http().get('/api/v1/me/privacy/export')).expect(200)).body.data;
    expect(data.abonnements).toEqual([expect.objectContaining({ plan_code: 'premium', status: 'active' })]);
    expect(data.factures).toEqual([expect.objectContaining({ amount_cents: 999, currency: 'EUR', url: 'https://invoice.stripe.test/i/rgpd' })]);
    expect(data.achatsExamens).toEqual([expect.objectContaining({ certification_code: 'LINUX-ADMIN', amount_cents: 6320, status: 'paid' })]);
  });

  it('effacement : plus de paiement pendant le délai, abonnement résilié, examen non utilisé remboursé, factures gardées', async () => {
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
    expect(stripe.calls.filter((c) => c.method === 'refundPayment').map((c) => c.args)).toContain(me.pi);
    expect(await purchaseStatus(me.purchase)).toBe('refunded');
    const log = (await pool.query(`SELECT stripe_subscriptions_pending s, stripe_refunds_pending r FROM iam.erasure_log WHERE user_id = $1`, [me.id])).rows[0];
    expect(log).toEqual({ s: [], r: [] });
    // Pièces comptables : gardées, rattachées au compte anonymisé.
    const kept = await pool.query(
      `SELECT i.amount_cents FROM billing.invoices i JOIN billing.customers c ON c.id = i.customer_id WHERE c.user_id = $1`, [me.id]);
    expect(kept.rows).toEqual([{ amount_cents: 999 }]);
  });

  it('Stripe injoignable : l’effacement a lieu, résiliation et remboursement sont repris par la tâche horaire', async () => {
    const me = await subscriber();
    await me.as(http().post('/api/v1/me/privacy/erasure').send({ confirmation: 'SUPPRIMER' })).expect(200);
    stripe.failing = true;
    await eraseNow(me.id);
    const pending = async () => (await pool.query(
      `SELECT stripe_subscriptions_pending s, stripe_refunds_pending r FROM iam.erasure_log WHERE user_id = $1`, [me.id])).rows[0];
    expect((await pool.query(`SELECT status FROM iam.users WHERE id = $1`, [me.id])).rows[0].status).toBe('deleted');
    expect(await pending()).toEqual({ s: [me.sub], r: [me.pi] });
    expect(await purchaseStatus(me.purchase)).toBe('paid');

    // Toujours en panne : rien ne change.
    await app.get(PrivacyService).runJobs();
    expect(await pending()).toEqual({ s: [me.sub], r: [me.pi] });

    stripe.failing = false;
    await app.get(PrivacyService).runJobs();
    expect(await pending()).toEqual({ s: [], r: [] });
    expect(await purchaseStatus(me.purchase)).toBe('refunded');
  });
});
