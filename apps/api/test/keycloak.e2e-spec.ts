import 'reflect-metadata';
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
});
