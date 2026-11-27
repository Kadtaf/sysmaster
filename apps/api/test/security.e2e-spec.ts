import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Sécurité (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  afterAll(async () => {
    await app?.close();
  });

  it('en-têtes de sécurité (helmet) sur les réponses de l’API', async () => {
    const res = await http().get('/api/v1/health/live').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('vérification publique des certificats : 429 avec Retry-After au-delà de 30 par minute', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await http().get(`/api/v1/certificates/SM-INCONNU-${i}`)).status);
    expect(codes.slice(0, 30).every((c) => c === 404)).toBe(true);
    const last = await http().get('/api/v1/certificates/SM-INCONNU-x').expect(429);
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
    expect(last.headers['ratelimit-limit']).toBe('30');
    // Les autres routes ne sont pas touchées par cette limite.
    await http().get('/api/v1/certificates/public-key').expect(200);
  });

  it('X-Forwarded-For ne permet pas de contourner la limite sans proxy déclaré', async () => {
    const res = await http().get('/api/v1/certificates/SM-INCONNU-y').set('x-forwarded-for', '203.0.113.9');
    expect(res.status).toBe(429);
  });
});
