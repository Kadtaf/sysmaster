import 'reflect-metadata';
import { createHash, randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/**
 * Test d'intégration avec un vrai Keycloak (royaume infra/keycloak/sysmaster-realm.json).
 * Exécuté si KEYCLOAK_E2E_URL est défini (ex. http://localhost:8080) ; la CI le fait.
 * Il valide le royaume lui-même : audience, rôles, e-mail vérifié, liaison aux comptes de démo.
 */
const kc = process.env.KEYCLOAK_E2E_URL;
const describeKc = kc && process.env.DATABASE_URL ? describe : describe.skip;

async function passwordGrant(username: string): Promise<string> {
  const res = await fetch(`${kc}/realms/sysmaster/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'sysmaster-e2e',
      username,
      password: 'Demo-SysMaster-2026!',
      scope: 'openid',
    }),
  });
  if (!res.ok) throw new Error(`Keycloak ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/**
 * Parcours de l'application mobile : code d'autorisation + PKCE S256 avec le client public
 * « sysmaster-mobile », en remplissant le vrai formulaire de connexion Keycloak.
 */
const MOBILE = { clientId: 'sysmaster-mobile', redirectUri: 'sysmaster://auth' };
const b64url = (b: Buffer) => b.toString('base64url');

function authorizeUrl(params: Record<string, string>) {
  return `${kc}/realms/sysmaster/protocol/openid-connect/auth?${new URLSearchParams({
    client_id: MOBILE.clientId, redirect_uri: MOBILE.redirectUri, response_type: 'code', scope: 'openid', state: 'etat-1', ...params,
  })}`;
}

async function mobileLogin(username: string): Promise<{ access_token: string; refresh_token: string }> {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const page = await fetch(authorizeUrl({ code_challenge: challenge, code_challenge_method: 'S256' }));
  const html = await page.text();
  const cookies = page.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const action = /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
  if (!action) throw new Error(`Formulaire de connexion introuvable (${page.status})`);
  const login = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies },
    body: new URLSearchParams({ username, password: 'Demo-SysMaster-2026!', credentialId: '' }),
  });
  const location = new URL(login.headers.get('location') ?? 'invalid:');
  if (`${location.protocol}//${location.host}` !== MOBILE.redirectUri || location.searchParams.get('state') !== 'etat-1') {
    throw new Error(`Redirection inattendue : ${location.href}`);
  }
  const res = await fetch(`${kc}/realms/sysmaster/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: MOBILE.clientId, redirect_uri: MOBILE.redirectUri,
      code: location.searchParams.get('code') ?? '', code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Échange du code refusé ${res.status}: ${await res.text()}`);
  return (await res.json()) as { access_token: string; refresh_token: string };
}

async function mobileToken(params: Record<string, string>) {
  return fetch(`${kc}/realms/sysmaster/protocol/openid-connect/${params.grant_type ? 'token' : 'logout'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: MOBILE.clientId, ...params }),
  });
}

describeKc('Keycloak réel (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.OIDC_ISSUER = `${kc}/realms/sysmaster`;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });
  afterAll(() => app?.close());

  it('alice (apprenante) est reliée à son compte de démo', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(await passwordGrant('alice@sysmaster.local'), { type: 'bearer' })
      .expect(200);
    expect(res.body).toMatchObject({ id: '00000000-0000-4000-8000-000000000002', email: 'alice@sysmaster.local', roles: ['learner'] });
  });

  it('seul l\'administrateur accède à /admin/users', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .auth(await passwordGrant('alice@sysmaster.local'), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .auth(await passwordGrant('admin@sysmaster.local'), { type: 'bearer' })
      .expect(200);
  });
  it('application mobile : connexion PKCE, jeton accepté par l\'API, rotation puis fin de session', async () => {
    const tokens = await mobileLogin('alice@sysmaster.local');
    const me = await request(app.getHttpServer()).get('/api/v1/me').auth(tokens.access_token, { type: 'bearer' }).expect(200);
    expect(me.body).toMatchObject({ id: '00000000-0000-4000-8000-000000000002', roles: ['learner'] });

    const refreshed = await mobileToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as { refresh_token: string };
    // Rotation : l'ancien jeton de rafraîchissement ne sert plus.
    expect((await mobileToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status).toBe(400);

    expect((await mobileToken({ refresh_token: next.refresh_token })).status).toBeLessThan(300);
    expect((await mobileToken({ grant_type: 'refresh_token', refresh_token: next.refresh_token })).status).toBe(400);
  });

  it('client mobile : PKCE obligatoire, redirection exacte, pas de mot de passe direct', async () => {
    const noPkce = await fetch(authorizeUrl({}), { redirect: 'manual' });
    expect(noPkce.headers.get('location') ?? '').toContain('error=invalid_request');
    const otherRedirect = await fetch(authorizeUrl({ redirect_uri: 'sysmaster://autre', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' }));
    expect(otherRedirect.status).toBe(400);
    const password = await mobileToken({ grant_type: 'password', username: 'alice@sysmaster.local', password: 'Demo-SysMaster-2026!' });
    expect(password.status).toBe(400);
    expect(await password.json()).toMatchObject({ error: 'unauthorized_client' });
  });
});
