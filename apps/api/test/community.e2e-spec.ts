import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { OutboxRelay } from '../src/shared/events/outbox-relay';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Communauté : questions-réponses, votes, réponse acceptée, modération (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  let relay: OutboxRelay;
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

  const question = (title: string) => ({
    categorySlug: 'linux', kind: 'question', title, tags: ['Systemd', 'systemd', 'Journaux'],
    bodyMd: 'Le service sauvegarde-nocturne échoue chaque nuit depuis la mise à jour, sans message clair.',
  });

  async function xpFor(userId: string, reason: string): Promise<number> {
    const deadline = Date.now() + 5000;
    for (;;) {
      await relay.drain();
      const { rows } = await pool.query(`SELECT coalesce(sum(amount), 0)::int AS xp FROM gamification.xp_ledger WHERE user_id = $1 AND reason = $2`, [userId, reason]);
      if (rows[0].xp > 0 || Date.now() > deadline) return rows[0].xp;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    relay = app.get(OutboxRelay);
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM community.reports WHERE reporter_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.votes WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool.query(`UPDATE community.threads SET accepted_post_id = NULL WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.posts WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.threads WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool?.end();
    await app?.close();
  });

  it('un visiteur lit les catégories et les sujets, mais ne publie pas', async () => {
    const cats = (await http().get('/api/v1/community/categories').expect(200)).body;
    expect(cats[0]).toMatchObject({ slug: 'linux', name: 'Linux' });
    const list = (await http().get('/api/v1/community/threads?category=linux').expect(200)).body;
    expect(list).toMatchObject({ page: 1, pageSize: 20 });
    expect(JSON.stringify(list)).not.toContain('@');
    await http().post('/api/v1/community/threads').send(question('Une question sans être connecté')).expect(401);
  });

  it('question, réponse, votes, réponse acceptée et XP d’entraide', async () => {
    const alice = await member();
    const bob = await member();

    const { id } = (await alice.as(http().post('/api/v1/community/threads').send(question('Service de sauvegarde en échec chaque nuit'))).expect(201)).body;
    const similar = (await http().get('/api/v1/community/similar').query({ q: 'sauvegarde echec nuit' }).expect(200)).body;
    expect(similar.map((s: { id: string }) => s.id)).toContain(id);
    // Recherche sans accents.
    const found = (await http().get('/api/v1/community/threads').query({ q: 'echec sauvegarde' }).expect(200)).body;
    expect(found.items.map((t: { id: string }) => t.id)).toContain(id);

    let thread = (await bob.as(http().post(`/api/v1/community/threads/${id}/posts`).send({ bodyMd: 'Regarde `journalctl -u sauvegarde-nocturne` : la cause y est presque toujours.' })).expect(201)).body;
    expect(thread).toMatchObject({ tags: ['systemd', 'journaux'], postCount: 1, can: { reply: true, accept: false } });
    const postId = thread.posts[0].id as string;

    await alice.as(http().put(`/api/v1/community/threads/${id}/vote`).send({ value: 1 })).expect(403);
    expect((await alice.as(http().put(`/api/v1/community/posts/${postId}/vote`).send({ value: 1 })).expect(200)).body).toEqual({ score: 1, myVote: 1 });
    expect((await alice.as(http().put(`/api/v1/community/posts/${postId}/vote`).send({ value: -1 })).expect(200)).body.score).toBe(-1);
    expect((await alice.as(http().put(`/api/v1/community/posts/${postId}/vote`).send({ value: 1 })).expect(200)).body.score).toBe(1);

    await bob.as(http().put(`/api/v1/community/threads/${id}/accepted`).send({ postId })).expect(403);
    thread = (await alice.as(http().put(`/api/v1/community/threads/${id}/accepted`).send({ postId })).expect(200)).body;
    expect(thread).toMatchObject({ answered: true, acceptedPostId: postId, can: { accept: true } });
    expect(thread.posts[0]).toMatchObject({ accepted: true, myVote: 1 });
    expect(await xpFor(bob.id, 'community.answer_accepted')).toBe(25);

    // Retirer puis remettre l'acceptation ne redonne pas d'XP.
    await alice.as(http().put(`/api/v1/community/threads/${id}/accepted`).send({ postId: null })).expect(200);
    await alice.as(http().put(`/api/v1/community/threads/${id}/accepted`).send({ postId })).expect(200);
    await relay.drain();
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM gamification.xp_ledger WHERE user_id = $1 AND reason = 'community.answer_accepted'`, [bob.id]);
    expect(rows[0].n).toBe(1);

    await bob.as(http().put(`/api/v1/community/posts/${postId}`).send({ bodyMd: 'Commence par `journalctl -u sauvegarde-nocturne -b` : la cause y est presque toujours.' })).expect(200);
    await alice.as(http().put(`/api/v1/community/posts/${postId}`).send({ bodyMd: 'Je modifie la réponse de quelqu’un d’autre, ce qui est interdit.' })).expect(403);
  });

  it('trois signalements masquent un message ; un modérateur tranche', async () => {
    const author = await member();
    const { id } = (await author.as(http().post('/api/v1/community/threads').send({ ...question('Sujet qui sera signalé plusieurs fois'), kind: 'discussion' })).expect(201)).body;
    const reporters = [await member(), await member(), await member()];

    await author.as(http().post('/api/v1/community/reports').send({ targetType: 'thread', targetId: id, reason: 'Je me signale' })).expect(400);
    for (const [i, r] of reporters.entries()) {
      await r.as(http().post('/api/v1/community/reports').send({ targetType: 'thread', targetId: id, reason: 'Publicité déguisée' })).expect(200);
      // Signaler deux fois ne compte qu'une.
      if (i === 0) await r.as(http().post('/api/v1/community/reports').send({ targetType: 'thread', targetId: id, reason: 'Publicité déguisée, encore' })).expect(200);
    }

    // Masqué pour les autres, visible pour son auteur (qui voit pourquoi).
    await http().get(`/api/v1/community/threads/${id}`).expect(404);
    await reporters[0].as(http().get(`/api/v1/community/threads/${id}`)).expect(404);
    const own = (await author.as(http().get(`/api/v1/community/threads/${id}`)).expect(200)).body;
    expect(own.hidden.reason).toContain('plusieurs signalements');
    expect(own.can.reply).toBe(false);

    await reporters[0].as(http().get('/api/v1/community/moderation')).expect(403);
    const mod = await member(['moderator']);
    const queue = (await mod.as(http().get('/api/v1/community/moderation')).expect(200)).body;
    const item = queue.find((q: { targetId: string }) => q.targetId === id);
    expect(item.reports).toHaveLength(3);

    expect((await mod.as(http().post('/api/v1/community/moderation').send({ targetType: 'thread', targetId: id, action: 'restore', note: 'Lien utile, pas de la publicité.' })).expect(200)).body).toEqual({ resolved: 3 });
    await http().get(`/api/v1/community/threads/${id}`).expect(200);

    await mod.as(http().put(`/api/v1/community/threads/${id}/lock`).send({ locked: true })).expect(200);
    const blocked = await reporters[1].as(http().post(`/api/v1/community/threads/${id}/posts`).send({ bodyMd: 'Une réponse arrivée après le verrouillage du sujet.' })).expect(403);
    expect(blocked.body.message).toContain('verrouillé');
  });

  it('validation : catégorie inconnue, titre trop court', async () => {
    const u = await member();
    const res = await u.as(http().post('/api/v1/community/threads').send({ ...question('Court'), categorySlug: 'linux' })).expect(400);
    expect(res.body.issues[0].field).toBe('title');
    await u.as(http().post('/api/v1/community/threads').send({ ...question('Une catégorie qui n’existe pas'), categorySlug: 'inexistante' })).expect(400);
    await http().get('/api/v1/community/threads/pas-un-uuid').expect(404);
  });
});
