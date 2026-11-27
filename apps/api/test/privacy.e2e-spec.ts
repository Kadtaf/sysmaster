import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { UserProvisioner } from '../src/modules/iam/application/user-provisioner';
import { PrivacyService } from '../src/modules/privacy/application/privacy.service';
import { createTestApp, newIdentity } from './helpers/test-app';

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
    // Après le délai de grâce.
    await privacy.eraseDue(new Date(Date.now() + 8 * 86_400_000));

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
