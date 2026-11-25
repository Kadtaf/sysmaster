import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Communauté : groupes d’étude et mentorat (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function member(roles = ['learner']) {
    const identity = newIdentity();
    const token = await tokenFor(identity, roles);
    const as = (r: request.Test) => r.auth(token, { type: 'bearer' });
    await as(http().get('/api/v1/me')).expect(200);
    const id = (await pool.query(`SELECT id FROM iam.users WHERE idp_subject = $1`, [identity.sub])).rows[0].id as string;
    users.push(id);
    return { id, as };
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM community.messages WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.mentorships WHERE mentor_id = ANY($1::uuid[]) OR mentee_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.mentor_profiles WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.study_groups WHERE owner_id = ANY($1::uuid[])`, [users]);
    await pool?.end();
    await app?.close();
  });

  it('groupe public : rejoindre, écrire entre membres, limite de places, départ du responsable', async () => {
    const owner = await member();
    const { id } = (await owner.as(http().post('/api/v1/community/groups').send({ name: 'Révisions LPIC-1', goal: 'Passer l’examen en mars', maxMembers: 2 })).expect(201)).body;
    const alice = await member();
    const late = await member();

    const listed = (await http().get('/api/v1/community/groups').expect(200)).body;
    expect(listed.find((g: { id: string }) => g.id === id)).toMatchObject({ memberCount: 1, isPublic: true, me: null });
    // Un visiteur voit le groupe, pas ses membres ; un non-membre ne lit pas les messages.
    expect((await http().get(`/api/v1/community/groups/${id}`).expect(200)).body.members).toEqual([]);
    await alice.as(http().get(`/api/v1/community/groups/${id}/messages`)).expect(404);

    const joined = (await alice.as(http().post(`/api/v1/community/groups/${id}/join`)).expect(200)).body;
    expect(joined).toMatchObject({ memberCount: 2, me: { member: true, owner: false } });
    expect(joined.members).toHaveLength(2);
    expect(JSON.stringify(joined)).not.toContain('@');
    const full = await late.as(http().post(`/api/v1/community/groups/${id}/join`)).expect(409);
    expect(full.body.message).toContain('complet');

    const after = (await alice.as(http().post(`/api/v1/community/groups/${id}/messages`).send({ bodyMd: 'On fait un point jeudi ?' })).expect(201)).body;
    expect(after).toMatchObject({ canWrite: true, items: [{ mine: true, bodyMd: 'On fait un point jeudi ?' }] });
    const msgId = after.items[0].id;
    await late.as(http().post(`/api/v1/community/messages/${msgId}/hide`)).expect(404);
    await owner.as(http().post(`/api/v1/community/messages/${msgId}/hide`)).expect(200);
    expect((await alice.as(http().get(`/api/v1/community/groups/${id}/messages`)).expect(200)).body.items[0]).toMatchObject({ hidden: true, bodyMd: '' });

    // Le responsable part : Alice reprend le groupe ; puis elle part à son tour, le groupe ferme.
    expect((await owner.as(http().post(`/api/v1/community/groups/${id}/leave`)).expect(200)).body).toEqual({ closed: false });
    expect((await alice.as(http().get(`/api/v1/community/groups/${id}`)).expect(200)).body.me).toEqual({ member: true, owner: true });
    expect((await alice.as(http().post(`/api/v1/community/groups/${id}/leave`)).expect(200)).body).toEqual({ closed: true });
    await http().get(`/api/v1/community/groups/${id}`).expect(404);
  });

  it('groupe privé : invisible sans être membre, rejoint avec le code', async () => {
    const owner = await member();
    const { id } = (await owner.as(http().post('/api/v1/community/groups').send({ name: 'Équipe infra', isPublic: false })).expect(201)).body;
    const code = (await owner.as(http().get(`/api/v1/community/groups/${id}`)).expect(200)).body.inviteCode as string;
    expect(code).toMatch(/^[2-9A-Z]{8}$/);

    const bob = await member();
    await bob.as(http().get(`/api/v1/community/groups/${id}`)).expect(404);
    expect((await http().get('/api/v1/community/groups').expect(200)).body.map((g: { id: string }) => g.id)).not.toContain(id);
    await bob.as(http().post(`/api/v1/community/groups/${id}/join`)).expect(404);
    const joined = (await bob.as(http().post('/api/v1/community/groups/join').send({ code: code.toLowerCase() })).expect(200)).body;
    expect(joined).toMatchObject({ id, me: { member: true }, inviteCode: null });
  });

  it('mentorat : profil réservé aux mentors, demande, acceptation, échanges, fin', async () => {
    const profile = { bio: 'Administrateur Linux depuis dix ans, j’aime expliquer.', topics: ['Linux', 'linux', 'Réseau'], maxMentees: 1 };
    const learner = await member();
    await learner.as(http().put('/api/v1/community/mentors/me').send(profile)).expect(403);

    const mentor = await member(['mentor']);
    const saved = (await mentor.as(http().put('/api/v1/community/mentors/me').send(profile)).expect(200)).body;
    expect(saved).toMatchObject({ topics: ['linux', 'réseau'], accepting: true, activeMentees: 0, maxMentees: 1 });
    const found = (await http().get('/api/v1/community/mentors?topic=Linux').expect(200)).body;
    expect(found.map((m: { userId: string }) => m.userId)).toContain(mentor.id);

    const ask = { mentorUserId: mentor.id, topic: 'Préparer LINUX-ADMIN', message: 'Je bloque sur les droits et systemd, je cherche une méthode.' };
    await mentor.as(http().post('/api/v1/community/mentorships').send({ ...ask, mentorUserId: mentor.id })).expect(409);
    const req = (await learner.as(http().post('/api/v1/community/mentorships').send(ask)).expect(201)).body;
    expect(req).toMatchObject({ role: 'mentee', status: 'requested', other: { displayName: expect.any(String) } });
    expect((await learner.as(http().post('/api/v1/community/mentorships').send(ask)).expect(409)).body.message).toContain('déjà en cours');

    // Pas d'échanges avant l'acceptation ; un tiers ne voit rien.
    await learner.as(http().post(`/api/v1/community/mentorships/${req.id}/messages`).send({ bodyMd: 'Bonjour !' })).expect(403);
    const stranger = await member();
    await stranger.as(http().get(`/api/v1/community/mentorships/${req.id}/messages`)).expect(404);
    await learner.as(http().post(`/api/v1/community/mentorships/${req.id}/action`).send({ action: 'accept' })).expect(409);

    const accepted = (await mentor.as(http().post(`/api/v1/community/mentorships/${req.id}/action`).send({ action: 'accept' })).expect(200)).body;
    expect(accepted).toMatchObject({ role: 'mentor', status: 'active', respondedAt: expect.any(String) });
    await learner.as(http().post(`/api/v1/community/mentorships/${req.id}/messages`).send({ bodyMd: 'Merci ! On commence par les droits ?' })).expect(201);
    const mine = (await mentor.as(http().get('/api/v1/community/mentorships')).expect(200)).body;
    expect(mine.mentor).toMatchObject({ activeMentees: 1 });

    // Complet : un autre apprenant ne peut plus demander.
    const other = await member();
    expect((await other.as(http().post('/api/v1/community/mentorships').send(ask)).expect(409)).body.message).toContain('autant d’apprenants');

    await learner.as(http().post(`/api/v1/community/mentorships/${req.id}/action`).send({ action: 'end' })).expect(200);
    const read = (await mentor.as(http().get(`/api/v1/community/mentorships/${req.id}/messages`)).expect(200)).body;
    expect(read).toMatchObject({ canWrite: false, items: [{ bodyMd: 'Merci ! On commence par les droits ?' }] });
  });
});
