import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createTestApp, newIdentity } from './helpers/test-app';

/**
 * Licences par siège (docs/03 §2.11) : ouverture par un admin, invitations, sièges, droits Pro,
 * ce que voient gestionnaires et membres, fin de licence.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Organisations et licences (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

  /** Une personne : son jeton et son id (le compte est créé au premier appel). */
  async function person(roles = ['learner']) {
    const identity = newIdentity();
    const jwt = await tokenFor(identity, roles);
    const me = await http().get('/api/v1/me').auth(jwt, { type: 'bearer' }).expect(200);
    return { jwt, id: me.body.id as string, email: identity.email };
  }

  async function openLicence(seats: number, ownerEmail: string, admin: { jwt: string }) {
    const slug = `org-${randomUUID().slice(0, 8)}`;
    const res = await http().post('/api/v1/admin/organizations').auth(admin.jwt, { type: 'bearer' })
      .send({ name: `École ${slug}`, slug, kind: 'school', seats, licenceEndsAt: inDays(365), ownerEmail }).expect(201);
    return { id: res.body.organization.id as string, slug, ownerLink: res.body.ownerInvitation.link as string, body: res.body };
  }

  it('une licence complète : ouverture, invitations, sièges, droits Pro, progression, départ', async () => {
    const admin = await person(['learner', 'admin']);
    const owner = await person();
    const learner = await person();
    const stranger = await person();

    // Seul un administrateur SysMaster ouvre une licence.
    await http().post('/api/v1/admin/organizations').auth(learner.jwt, { type: 'bearer' }).send({}).expect(403);
    const org = await openLicence(3, owner.email, admin);
    expect(org.body.ownerInvitation).toMatchObject({ email: owner.email, role: 'org_owner', emailed: false });
    expect(org.body.ownerInvitation.token).toBeUndefined();
    await http().post('/api/v1/admin/organizations').auth(admin.jwt, { type: 'bearer' })
      .send({ name: 'Doublon', slug: org.slug, kind: 'company', seats: 1, licenceEndsAt: inDays(30), ownerEmail: owner.email }).expect(409);

    // Aperçu public : adresse masquée. Le lien ne vaut que pour l'adresse invitée.
    const preview = await http().post('/api/v1/organizations/invitations/preview').send({ token: tokenOf(org.ownerLink) }).expect(200);
    expect(preview.body).toMatchObject({ role: 'org_owner', state: 'pending', kind: 'school' });
    expect(preview.body.emailHint).not.toContain(owner.email.split('@')[0]);
    await http().post('/api/v1/organizations/invitations/accept').auth(stranger.jwt, { type: 'bearer' }).send({ token: tokenOf(org.ownerLink) }).expect(409);
    await http().post('/api/v1/organizations/invitations/accept').auth(owner.jwt, { type: 'bearer' }).send({ token: tokenOf(org.ownerLink) }).expect(200);
    await http().post('/api/v1/organizations/invitations/accept').auth(owner.jwt, { type: 'bearer' }).send({ token: tokenOf(org.ownerLink) }).expect(409);

    // 3 sièges : le propriétaire + 2 invitations ; une troisième est refusée, un doublon ignoré.
    const inv = await http().post(`/api/v1/organizations/${org.id}/invitations`).auth(owner.jwt, { type: 'bearer' })
      .send({ emails: [learner.email, 'autre@exemple.fr', learner.email.toUpperCase()] }).expect(201);
    expect(inv.body.invitations).toHaveLength(2);
    await http().post(`/api/v1/organizations/${org.id}/invitations`).auth(owner.jwt, { type: 'bearer' })
      .send({ emails: ['encore@exemple.fr'] }).expect(409);
    const again = await http().post(`/api/v1/organizations/${org.id}/invitations`).auth(owner.jwt, { type: 'bearer' })
      .send({ emails: [learner.email] }).expect(201);
    expect(again.body).toEqual({ invitations: [], skipped: [learner.email] });

    // Annuler une invitation libère son siège.
    const other = inv.body.invitations.find((i: { email: string }) => i.email === 'autre@exemple.fr');
    await http().delete(`/api/v1/organizations/${org.id}/invitations/${other.id}`).auth(owner.jwt, { type: 'bearer' }).expect(204);
    let detail = await http().get(`/api/v1/organizations/${org.id}`).auth(owner.jwt, { type: 'bearer' }).expect(200);
    expect(detail.body).toMatchObject({ seats: 3, seatsUsed: 2, canManage: true, licence: { state: 'active', seatPlan: 'pro' } });

    // L'admin ne peut pas descendre sous les sièges pris.
    await http().patch(`/api/v1/admin/organizations/${org.id}`).auth(admin.jwt, { type: 'bearer' }).send({ seats: 1 }).expect(409);

    // Avant : offre gratuite. Après acceptation : Pro par la licence.
    expect((await http().get('/api/v1/me/billing').auth(learner.jwt, { type: 'bearer' }).expect(200)).body).toMatchObject({ plan: 'free', licence: null });
    const learnerLink = inv.body.invitations.find((i: { email: string }) => i.email === learner.email).link;
    await http().post('/api/v1/organizations/invitations/accept').auth(learner.jwt, { type: 'bearer' }).send({ token: tokenOf(learnerLink) }).expect(200);
    const billing = await http().get('/api/v1/me/billing').auth(learner.jwt, { type: 'bearer' }).expect(200);
    expect(billing.body).toMatchObject({ plan: 'pro', licence: { plan: 'pro', organization: `École ${org.slug}` } });

    // Un membre voit l'organisation sans les adresses ni les invitations, pas la progression.
    detail = await http().get(`/api/v1/organizations/${org.id}`).auth(learner.jwt, { type: 'bearer' }).expect(200);
    expect(detail.body.canManage).toBe(false);
    expect(detail.body.invitations).toEqual([]);
    expect(detail.body.members.every((m: { email: string }) => m.email === '')).toBe(true);
    await http().get(`/api/v1/organizations/${org.id}/progress`).auth(learner.jwt, { type: 'bearer' }).expect(403);
    await http().post(`/api/v1/organizations/${org.id}/invitations`).auth(learner.jwt, { type: 'bearer' }).send({ emails: ['x@exemple.fr'] }).expect(403);
    // Qui n'est pas membre ne la voit pas du tout.
    await http().get(`/api/v1/organizations/${org.id}`).auth(stranger.jwt, { type: 'bearer' }).expect(404);

    // Progression : apprentissage seulement.
    await pool.query(`INSERT INTO gamification.user_stats (user_id, total_xp, level, lessons_completed, labs_solved, last_activity_date)
                      VALUES ($1, 420, 3, 7, 2, '2026-11-20') ON CONFLICT (user_id) DO UPDATE SET total_xp = 420, level = 3, lessons_completed = 7, labs_solved = 2, last_activity_date = '2026-11-20'`, [learner.id]);
    const progress = await http().get(`/api/v1/organizations/${org.id}/progress`).auth(owner.jwt, { type: 'bearer' }).expect(200);
    const row = progress.body.members.find((m: { userId: string }) => m.userId === learner.id);
    expect(row).toMatchObject({ level: 3, totalXp: 420, lessonsCompleted: 7, labsSolved: 2, lastActivity: '2026-11-20', paths: [], certificates: [] });
    expect(Object.keys(row).sort()).toEqual(['certificates', 'displayName', 'labsSolved', 'lastActivity', 'lessonsCompleted', 'level', 'paths', 'role', 'totalXp', 'userId']);
    const csv = await http().get(`/api/v1/organizations/${org.id}/progress.csv`).auth(owner.jwt, { type: 'bearer' }).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Nom;Rôle;Niveau;XP');
    expect(csv.text).toContain(';420;7;2;');

    // Rôles : un gestionnaire peut nommer un formateur, pas toucher au propriétaire ni à lui-même.
    await http().patch(`/api/v1/organizations/${org.id}/members/${learner.id}`).auth(owner.jwt, { type: 'bearer' }).send({ role: 'instructor' }).expect(204);
    await http().get(`/api/v1/organizations/${org.id}/progress`).auth(learner.jwt, { type: 'bearer' }).expect(200);
    await http().patch(`/api/v1/organizations/${org.id}/members/${owner.id}`).auth(owner.jwt, { type: 'bearer' }).send({ role: 'member' }).expect(403);
    await http().patch(`/api/v1/organizations/${org.id}/members/${learner.id}`).auth(owner.jwt, { type: 'bearer' }).send({ role: 'org_owner' }).expect(400);

    // Le seul propriétaire ne peut pas partir ; un membre si, et perd le siège.
    await http().delete(`/api/v1/organizations/${org.id}/members/${owner.id}`).auth(owner.jwt, { type: 'bearer' }).expect(409);
    await http().delete(`/api/v1/organizations/${org.id}/members/${owner.id}`).auth(learner.jwt, { type: 'bearer' }).expect(403);
    await http().delete(`/api/v1/organizations/${org.id}/members/${learner.id}`).auth(learner.jwt, { type: 'bearer' }).expect(204);
    expect((await http().get('/api/v1/me/billing').auth(learner.jwt, { type: 'bearer' }).expect(200)).body.plan).toBe('free');

    // Journal d'audit : sans adresse e-mail.
    const audit = await pool.query(`SELECT action, metadata::text FROM platform.audit_log WHERE target_type = 'organization' AND target_id = $1`, [org.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['organization.created', 'organization.invited', 'organization.joined', 'organization.left']));
    expect(audit.rows.some((r) => r.metadata.includes('@'))).toBe(false);
  });

  it('licence terminée : plus de droits Pro ni d’invitations ; prolongée par l’admin', async () => {
    const admin = await person(['learner', 'admin']);
    const owner = await person();
    const org = await openLicence(5, owner.email, admin);
    await http().post('/api/v1/organizations/invitations/accept').auth(owner.jwt, { type: 'bearer' }).send({ token: tokenOf(org.ownerLink) }).expect(200);
    expect((await http().get('/api/v1/me/billing').auth(owner.jwt, { type: 'bearer' }).expect(200)).body.plan).toBe('pro');

    await pool.query(`UPDATE iam.organizations SET licence_ends_at = now() - interval '1 day' WHERE id = $1`, [org.id]);
    expect((await http().get('/api/v1/me/billing').auth(owner.jwt, { type: 'bearer' }).expect(200)).body).toMatchObject({ plan: 'free', licence: null });
    await http().post(`/api/v1/organizations/${org.id}/invitations`).auth(owner.jwt, { type: 'bearer' }).send({ emails: ['a@exemple.fr'] }).expect(409);
    const mine = await http().get('/api/v1/organizations/mine').auth(owner.jwt, { type: 'bearer' }).expect(200);
    expect(mine.body).toEqual([expect.objectContaining({ id: org.id, role: 'org_owner', licence: expect.objectContaining({ state: 'expired' }) })]);

    await http().patch(`/api/v1/admin/organizations/${org.id}`).auth(admin.jwt, { type: 'bearer' }).send({ licenceEndsAt: inDays(30) }).expect(200);
    expect((await http().get('/api/v1/me/billing').auth(owner.jwt, { type: 'bearer' }).expect(200)).body.plan).toBe('pro');
    const list = await http().get('/api/v1/admin/organizations').auth(admin.jwt, { type: 'bearer' }).expect(200);
    expect(list.body.find((o: { id: string }) => o.id === org.id)).toMatchObject({ owners: [owner.email], seatsUsed: 1, licence: { state: 'active' } });
  });

  it('une invitation expirée ne s’accepte plus et ne bloque pas une nouvelle invitation', async () => {
    const admin = await person(['learner', 'admin']);
    const owner = await person();
    const late = await person();
    const org = await openLicence(3, owner.email, admin);
    await http().post('/api/v1/organizations/invitations/accept').auth(owner.jwt, { type: 'bearer' }).send({ token: tokenOf(org.ownerLink) }).expect(200);
    const first = await http().post(`/api/v1/organizations/${org.id}/invitations`).auth(owner.jwt, { type: 'bearer' }).send({ emails: [late.email] }).expect(201);
    await pool.query(`UPDATE iam.organization_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`, [first.body.invitations[0].id]);
    const res = await http().post('/api/v1/organizations/invitations/accept').auth(late.jwt, { type: 'bearer' }).send({ token: tokenOf(first.body.invitations[0].link) }).expect(409);
    expect(res.body.message).toContain('expiré');
    const second = await http().post(`/api/v1/organizations/${org.id}/invitations`).auth(owner.jwt, { type: 'bearer' }).send({ emails: [late.email] }).expect(201);
    await http().post('/api/v1/organizations/invitations/accept').auth(late.jwt, { type: 'bearer' }).send({ token: tokenOf(second.body.invitations[0].link) }).expect(200);
  });

  it('jeton inconnu ou mal formé', async () => {
    await http().post('/api/v1/organizations/invitations/preview').send({ token: 'x'.repeat(43) }).expect(404);
    await http().post('/api/v1/organizations/invitations/preview').send({ token: 'court' }).expect(400);
  });
});
