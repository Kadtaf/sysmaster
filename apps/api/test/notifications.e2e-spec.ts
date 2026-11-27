import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { OutboxRelay } from '../src/shared/events/outbox-relay';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Notifications (e2e)', () => {
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

  /** Fait tourner le relais jusqu'à voir `n` notifications (d'autres suites peuvent tenir un lot un instant). */
  async function inbox(as: (r: request.Test) => request.Test, n: number) {
    const deadline = Date.now() + 5000;
    for (;;) {
      await relay.drain();
      const body = (await as(http().get('/api/v1/me/notifications')).expect(200)).body;
      if (body.items.length >= n || Date.now() > deadline) return body;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const question = (title: string) => ({
    categorySlug: 'linux', kind: 'question', title, tags: ['systemd'],
    bodyMd: 'Le service redémarre en boucle depuis la mise à jour, et le journal ne dit rien de clair.',
  });

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    relay = app.get(OutboxRelay);
  });
  afterAll(async () => {
    await pool.query(`UPDATE community.threads SET accepted_post_id = NULL WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.posts WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.threads WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.mentorships WHERE mentor_id = ANY($1::uuid[]) OR mentee_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.mentor_profiles WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool?.end();
    await app?.close();
  });

  it('réponse et réponse acceptée : prévenus, sans se prévenir soi-même ; lu, tout lu', async () => {
    const alice = await member();
    const bob = await member();
    const { id } = (await alice.as(http().post('/api/v1/community/threads').send(question('Mon service redémarre en boucle'))).expect(201)).body;
    // Répondre à son propre sujet ne notifie personne.
    await alice.as(http().post(`/api/v1/community/threads/${id}/posts`).send({ bodyMd: 'Précision : cela arrive aussi au démarrage.' })).expect(201);
    const posted = (await bob.as(http().post(`/api/v1/community/threads/${id}/posts`).send({ bodyMd: 'Regarde `systemctl status` puis `journalctl -u` du service.' })).expect(201)).body;
    const postId = posted.posts.find((p: { mine: boolean }) => p.mine).id;

    const forAlice = await inbox(alice.as, 1);
    expect(forAlice.unread).toBe(1);
    expect(forAlice.items).toEqual([expect.objectContaining({
      type: 'community_reply', title: 'Nouvelle réponse à votre sujet', body: '« Mon service redémarre en boucle »', href: `/communaute/${id}#post-${postId}`, read: false,
    })]);
    // Le contenu de la réponse n'est jamais recopié dans la notification.
    expect(JSON.stringify(forAlice)).not.toContain('systemctl');

    await alice.as(http().put(`/api/v1/community/threads/${id}/accepted`).send({ postId })).expect(200);
    const forBob = await inbox(bob.as, 1);
    expect(forBob.items[0]).toMatchObject({ type: 'answer_accepted', href: `/communaute/${id}#post-${postId}` });

    // On ne marque que les siennes.
    await bob.as(http().post(`/api/v1/me/notifications/${forAlice.items[0].id}/read`)).expect(200, { marked: 0 });
    await alice.as(http().post(`/api/v1/me/notifications/${forAlice.items[0].id}/read`)).expect(200, { marked: 1 });
    await alice.as(http().post('/api/v1/me/notifications/not-a-uuid/read')).expect(400);
    expect((await alice.as(http().get('/api/v1/me/notifications/unread')).expect(200)).body).toEqual({ unread: 0 });
    await bob.as(http().post('/api/v1/me/notifications/read-all')).expect(200, { marked: 1 });
    await http().get('/api/v1/me/notifications').expect(401);
  });

  it('préférences : un type coupé ne crée plus de notification', async () => {
    const author = await member();
    const helper = await member();
    const prefs = (await author.as(http().get('/api/v1/me/notifications/preferences')).expect(200)).body;
    expect(prefs).toContainEqual({ type: 'community_reply', channel: 'in_app', enabled: true });
    await author.as(http().put('/api/v1/me/notifications/preferences').send({ preferences: [{ type: 'inconnu', channel: 'in_app', enabled: false }] })).expect(400);
    const saved = (await author.as(http().put('/api/v1/me/notifications/preferences')
      .send({ preferences: [{ type: 'community_reply', channel: 'in_app', enabled: false }] })).expect(200)).body;
    expect(saved).toContainEqual({ type: 'community_reply', channel: 'in_app', enabled: false });
    expect(saved).toContainEqual({ type: 'mentorship', channel: 'in_app', enabled: true });

    const { id } = (await author.as(http().post('/api/v1/community/threads').send(question('Sujet sans notification de réponse'))).expect(201)).body;
    await helper.as(http().post(`/api/v1/community/threads/${id}/posts`).send({ bodyMd: 'Une réponse qui ne doit pas notifier son auteur.' })).expect(201);
    await relay.drain();
    await new Promise((r) => setTimeout(r, 200));
    await relay.drain();
    expect((await author.as(http().get('/api/v1/me/notifications')).expect(200)).body).toEqual({ items: [], unread: 0 });
  });

  it('mentorat : demande pour le mentor, acceptation pour l’apprenant', async () => {
    const mentor = await member(['mentor']);
    const learner = await member();
    await mentor.as(http().put('/api/v1/community/mentors/me').send({ bio: 'Je réponds volontiers aux questions sur Linux.', topics: ['linux'], maxMentees: 2 })).expect(200);
    const req = (await learner.as(http().post('/api/v1/community/mentorships')
      .send({ mentorUserId: mentor.id, topic: 'Préparer LINUX-ADMIN', message: 'Je cherche une méthode pour réviser systemd.' })).expect(201)).body;
    expect((await inbox(mentor.as, 1)).items[0]).toMatchObject({ type: 'mentorship', title: 'Nouvelle demande de mentorat', body: 'Sujet : Préparer LINUX-ADMIN', href: `/communaute/mentorat/${req.id}` });
    await mentor.as(http().post(`/api/v1/community/mentorships/${req.id}/action`).send({ action: 'accept' })).expect(200);
    expect((await inbox(learner.as, 1)).items[0]).toMatchObject({ title: 'Votre demande de mentorat est acceptée' });
    // Celui qui agit n'est pas prévenu de sa propre action.
    expect((await mentor.as(http().get('/api/v1/me/notifications')).expect(200)).body.items).toHaveLength(1);
  });
});
