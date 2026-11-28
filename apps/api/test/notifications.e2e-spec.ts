import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { EmailSender } from '../src/modules/notification/infrastructure/email-sender';
import { Mailer, OutgoingEmail } from '../src/modules/notification/infrastructure/mailer';
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
    expect((await author.as(http().get('/api/v1/me/notifications')).expect(200)).body).toEqual({ items: [], unread: 0, emailEnabled: false });
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

describeDb('Notifications par e-mail (e2e)', () => {
  const SECRET = 'e2e-secret-de-liens-de-desabonnement-0123456789';
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  let relay: OutboxRelay;
  let sender: EmailSender;
  const users: string[] = [];
  const sent: OutgoingEmail[] = [];
  let failing = false;
  /** Serveur d'envoi simulé : la configuration est complète, rien ne part sur le réseau. */
  class FakeMailer extends Mailer {
    constructor() {
      super({ smtpUrl: 'smtp://127.0.0.1:1', from: 'SysMaster <no-reply@sysmaster.test>', linkSecret: SECRET });
    }
    override async send(m: OutgoingEmail) {
      if (failing) throw new Error('SMTP injoignable (simulé)');
      sent.push(m);
    }
  }
  const mailer = new FakeMailer();
  const http = () => request(app.getHttpServer());

  async function member(roles = ['learner']) {
    const identity = newIdentity();
    const token = await tokenFor(identity, roles);
    const as = (r: request.Test) => r.auth(token, { type: 'bearer' });
    await as(http().get('/api/v1/me')).expect(200);
    const id = (await pool.query(`SELECT id FROM iam.users WHERE idp_subject = $1`, [identity.sub])).rows[0].id as string;
    users.push(id);
    return { id, as, email: identity.email };
  }
  const emails = async (userId: string) =>
    (await pool.query(`SELECT type, sent_at IS NOT NULL AS sent, attempts, next_attempt_at IS NOT NULL AS retry FROM notification.notifications
                        WHERE user_id = $1 AND channel = 'email' ORDER BY created_at`, [userId])).rows;
  async function settle(userId: string, n: number) {
    const deadline = Date.now() + 5000;
    for (;;) {
      await relay.drain();
      const rows = await emails(userId);
      if (rows.length >= n || Date.now() > deadline) return rows;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  async function mentorAndLearner() {
    const mentor = await member(['mentor']);
    const learner = await member();
    await mentor.as(http().put('/api/v1/community/mentors/me').send({ bio: 'Je réponds volontiers aux questions sur Linux.', topics: ['linux'], maxMentees: 3 })).expect(200);
    const ask = () => learner.as(http().post('/api/v1/community/mentorships')
      .send({ mentorUserId: mentor.id, topic: 'Réviser <systemd>', message: 'Je cherche une méthode pour réviser systemd.' }));
    return { mentor, learner, ask };
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(Mailer).useValue(mailer)));
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    relay = app.get(OutboxRelay);
    sender = app.get(EmailSender);
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM community.mentorships WHERE mentor_id = ANY($1::uuid[]) OR mentee_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.mentor_profiles WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool?.end();
    await app?.close();
  });
  afterEach(() => (failing = false));

  it('mentorat : e-mail préparé, envoyé avec le désabonnement en un clic ; la réponse du forum reste dans l’application', async () => {
    const { mentor, ask } = await mentorAndLearner();
    await ask().expect(201);
    expect(await settle(mentor.id, 1)).toEqual([{ type: 'mentorship', sent: false, attempts: 0, retry: false }]);

    await sender.run();
    const mail = sent.find((m) => m.to === mentor.email)!;
    expect(mail.subject).toBe('SysMaster : Nouvelle demande de mentorat');
    expect(mail.html).toContain('Réviser &lt;systemd&gt;');
    expect(mail.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(await emails(mentor.id)).toEqual([{ type: 'mentorship', sent: true, attempts: 1, retry: false }]);

    // Désabonnement en un clic, comme le ferait la messagerie : jeton dans l'adresse.
    const link = /<([^>]+)>/.exec(mail.headers!['List-Unsubscribe'])![1];
    const token = new URL(link).searchParams.get('token')!;
    await http().post('/api/v1/notifications/unsubscribe').query({ token }).type('form').send('List-Unsubscribe=One-Click').expect(200, { type: 'mentorship' });
    await http().post('/api/v1/notifications/unsubscribe').send({ token: `${token.slice(0, -4)}AAAA` }).expect(400);
    const prefs = (await mentor.as(http().get('/api/v1/me/notifications/preferences')).expect(200)).body;
    expect(prefs).toContainEqual({ type: 'mentorship', channel: 'email', enabled: false });
    expect(prefs).toContainEqual({ type: 'community_reply', channel: 'email', enabled: false });
    expect((await mentor.as(http().get('/api/v1/me/notifications')).expect(200)).body.emailEnabled).toBe(true);
  });

  it('serveur d’envoi en panne : essai noté, nouvel essai plus tard ; compte supprimé : rien ne part', async () => {
    const { mentor, learner, ask } = await mentorAndLearner();
    await ask().expect(201);
    await settle(mentor.id, 1);
    failing = true;
    await sender.run();
    expect(await emails(mentor.id)).toEqual([{ type: 'mentorship', sent: false, attempts: 1, retry: true }]);

    // Le mentor accepte : l'apprenant aurait un e-mail, mais son compte est supprimé entre-temps.
    const id = (await pool.query(`SELECT id FROM community.mentorships WHERE mentee_id = $1`, [learner.id])).rows[0].id;
    await mentor.as(http().post(`/api/v1/community/mentorships/${id}/action`).send({ action: 'accept' })).expect(200);
    await settle(learner.id, 1);
    await pool.query(`UPDATE iam.users SET status = 'deleted', email = 'supprime-' || id || '@invalid' WHERE id = $1`, [learner.id]);
    failing = false;
    await sender.run();
    expect(await emails(learner.id)).toEqual([]);
    expect(sent.some((m) => m.to === learner.email)).toBe(false);
  });
});
