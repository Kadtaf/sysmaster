import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { TokenVerifier } from '../src/modules/iam/application/ports';
import { JoseTokenVerifier } from '../src/modules/iam/infrastructure/jose-token-verifier';

/**
 * Authentification de bout en bout sans Keycloak : on remplace les clés du royaume par une paire
 * générée ici, ce qui permet de fabriquer des jetons valides, expirés ou mal adressés.
 * Le test contre un vrai Keycloak est dans keycloak.e2e-spec.ts.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const ISSUER = 'http://test-idp/realms/sysmaster';

describeDb('Authentification et autorisation (e2e)', () => {
  let app: INestApplication;
  let privateKey: KeyLike;
  let pool: Pool;

  const token = (claims: Record<string, unknown>, opts: { aud?: string; exp?: string | number; iss?: string } = {}) =>
    new SignJWT({ email_verified: true, realm_access: { roles: ['learner'] }, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? 'sysmaster-api')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(privateKey);

  const newIdentity = () => {
    const id = randomUUID();
    return { sub: id, email: `user-${id}@test.local`, name: 'Test Utilisateur' };
  };

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;
    const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
    const verifier = new JoseTokenVerifier(createLocalJWKSet({ keys: [jwk] }), { issuer: ISSUER, audience: 'sysmaster-api' });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TokenVerifier)
      .useValue(verifier)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('les routes publiques restent accessibles sans jeton', () => http().get('/api/v1/kb/commands').expect(200));

  it('GET /me sans jeton → 401', () => http().get('/api/v1/me').expect(401));

  it('refuse un jeton expiré, mal adressé, d\'un autre émetteur ou falsifié', async () => {
    const id = newIdentity();
    await http().get('/api/v1/me').auth(await token(id, { exp: Math.floor(Date.now() / 1000) - 60 }), { type: 'bearer' }).expect(401);
    await http().get('/api/v1/me').auth(await token(id, { aud: 'autre-api' }), { type: 'bearer' }).expect(401);
    await http().get('/api/v1/me').auth(await token(id, { iss: 'http://pirate/realms/x' }), { type: 'bearer' }).expect(401);
    const forged = (await token(id)).replace(/\.[^.]+$/, '.c2lnbmF0dXJl');
    await http().get('/api/v1/me').auth(forged, { type: 'bearer' }).expect(401);
  });

  it('refuse un jeton invalide même sur une route publique', async () =>
    http().get('/api/v1/kb/commands').auth('pas-un-jwt', { type: 'bearer' }).expect(401));

  it('crée le compte à la première connexion et publie iam.user.registered.v1', async () => {
    const id = newIdentity();
    const res = await http().get('/api/v1/me').auth(await token(id), { type: 'bearer' }).expect(200);
    expect(res.body).toMatchObject({ email: id.email, displayName: 'Test Utilisateur', roles: ['learner'], subject: id.sub });

    const events = await pool.query(
      `SELECT payload FROM platform.outbox_events WHERE type = 'iam.user.registered.v1' AND aggregate_id = $1`,
      [res.body.id],
    );
    expect(events.rowCount).toBe(1);

    // Deuxième connexion : même compte, pas de nouvel événement.
    const again = await http().get('/api/v1/me').auth(await token(id), { type: 'bearer' }).expect(200);
    expect(again.body.id).toBe(res.body.id);
  });

  it('relie un compte existant par e-mail vérifié, refuse si l\'e-mail n\'est pas vérifié', async () => {
    const id = newIdentity();
    const { rows } = await pool.query(
      `INSERT INTO iam.users (email, display_name) VALUES ($1, 'Importé') RETURNING id`,
      [id.email],
    );
    await http().get('/api/v1/me').auth(await token({ ...id, email_verified: false }), { type: 'bearer' }).expect(403);
    const res = await http().get('/api/v1/me').auth(await token(id), { type: 'bearer' }).expect(200);
    expect(res.body.id).toBe(rows[0].id);
  });

  // Une page qui appelle plusieurs routes en parallèle dès la première connexion (ex. /compte) :
  // chaque requête provisionne le compte, aucune ne doit échouer ni créer un doublon.
  it('premières requêtes simultanées : un seul compte, aucune erreur (création et rattachement)', async () => {
    const fresh = newIdentity();
    const jwt = await token(fresh);
    const created = await Promise.all(Array.from({ length: 6 }, () => http().get('/api/v1/me').auth(jwt, { type: 'bearer' })));
    expect(created.map((r) => r.status)).toEqual(Array(6).fill(200));
    expect(new Set(created.map((r) => r.body.id)).size).toBe(1);
    const events = await pool.query(
      `SELECT 1 FROM platform.outbox_events WHERE type = 'iam.user.registered.v1' AND aggregate_id = $1`,
      [created[0].body.id],
    );
    expect(events.rowCount).toBe(1);

    const imported = newIdentity();
    const { rows } = await pool.query(`INSERT INTO iam.users (email, display_name) VALUES ($1, 'Importé') RETURNING id`, [imported.email]);
    const jwt2 = await token(imported);
    const linked = await Promise.all(Array.from({ length: 6 }, () => http().get('/api/v1/me').auth(jwt2, { type: 'bearer' })));
    expect(linked.map((r) => r.status)).toEqual(Array(6).fill(200));
    expect(linked.every((r) => r.body.id === rows[0].id)).toBe(true);
  });

  it('synchronise les rôles depuis Keycloak et applique @Roles', async () => {
    const id = newIdentity();
    await http().get('/api/v1/admin/users').auth(await token(id), { type: 'bearer' }).expect(403);

    const admin = await token({ ...id, realm_access: { roles: ['learner', 'admin', 'role-inconnu'] } });
    const list = await http().get('/api/v1/admin/users?limit=5').auth(admin, { type: 'bearer' }).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    const me = await http().get('/api/v1/me').auth(admin, { type: 'bearer' }).expect(200);
    expect(me.body.roles.sort()).toEqual(['admin', 'learner']);

    // Rôle retiré dans Keycloak → retiré dans l'application.
    const demoted = await token({ ...id, realm_access: { roles: ['learner'] } });
    await http().get('/api/v1/admin/users').auth(demoted, { type: 'bearer' }).expect(403);
  });

  it('rattache un diagnostic à l\'utilisateur connecté', async () => {
    const id = newIdentity();
    const auth = await token(id);
    const me = await http().get('/api/v1/me').auth(auth, { type: 'bearer' }).expect(200);
    const res = await http()
      .post('/api/v1/diagnostic/analyze')
      .auth(auth, { type: 'bearer' })
      .send({ platform: 'windows', description: 'Mon PC redémarre seul' })
      .expect(201);
    const { rows } = await pool.query('SELECT user_id FROM diagnostic.sessions WHERE id = $1', [res.body.sessionId]);
    expect(rows[0].user_id).toBe(me.body.id);
  });
});
