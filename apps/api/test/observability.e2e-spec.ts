import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { registry } from '../src/shared/observability/metrics';
import { createTestApp } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Observabilité (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  afterAll(async () => {
    await app?.close();
  });

  it('sondes : vivant sans base, prêt avec base', async () => {
    await http().get('/api/v1/health/live').expect(200, { status: 'ok' });
    await http().get('/api/v1/health/ready').expect(200);
  });

  it('identifiant de requête : repris s’il est sain, remplacé sinon', async () => {
    const kept = await http().get('/api/v1/health/live').set('x-request-id', 'abc-123').expect(200);
    expect(kept.headers['x-request-id']).toBe('abc-123');
    const replaced = await http().get('/api/v1/health/live').set('x-request-id', 'a b <script>').expect(200);
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('métriques : durée par motif de route (pas par URL) et état de l’outbox', async () => {
    await http().get('/api/v1/kb/commands/linux-journalctl').expect(200);
    await http().get('/api/v1/nexiste/pas').expect(404);
    const text = await registry.metrics();
    expect(text).toContain('route="/api/v1/kb/commands/:slug"');
    expect(text).not.toContain('linux-journalctl');
    expect(text).toContain('route="unmatched"');
    expect(text).toMatch(/outbox_pending_events\{[^}]*\} \d+/);
    expect(text).toMatch(/outbox_dead_letter_events\{[^}]*\} \d+/);
  });
});
