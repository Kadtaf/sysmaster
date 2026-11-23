import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/**
 * Tests de bout en bout contre une vraie base PostgreSQL migrée et alimentée (pnpm db:reset).
 * Ignorés si DATABASE_URL n'est pas défini (ex. poste sans Docker). La CI les exécute toujours.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('API (e2e, PostgreSQL)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });
  afterAll(() => app?.close());

  it('GET /health', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('GET /learning/paths', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/learning/paths').expect(200);
    expect(res.body.map((p: { slug: string }) => p.slug)).toContain('administrateur-linux');
  });

  it('GET /kb/commands?q=journal trouve journalctl', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/kb/commands').query({ q: 'journalctl' }).expect(200);
    expect(res.body[0].slug).toBe('linux-journalctl');
  });

  it('la recherche ignore les accents : « journaux evenements » trouve Get-WinEvent', async () => {
    const search = async (q: string) =>
      (await request(app.getHttpServer()).get('/api/v1/kb/commands').query({ q }).expect(200)).body.map((c: { slug: string }) => c.slug);
    const sans = await search('journaux evenements');
    expect(sans).toContain('windows-get-winevent');
    expect(sans).toEqual(await search('journaux événements'));
  });

  it('GET /kb/commands/linux-rm-rf applique la règle P-2', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/kb/commands/linux-rm-rf').expect(200);
    expect(res.body).toMatchObject({ riskLevel: 'critical', maskedUntilRisksRead: true, copyAllowed: false });
  });

  it('GET /kb/commands/linux-systemctl renvoie alternatives, exemples et sources', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/kb/commands/linux-systemctl').expect(200);
    expect(res.body.alternatives[0].slug).toBe('linux-journalctl');
    expect(res.body.examples.length).toBeGreaterThan(0);
    expect(res.body.sources[0].publisher).toBe('Linux man-pages');
  });

  it('GET /kb/commands/inexistante → 404', () =>
    request(app.getHttpServer()).get('/api/v1/kb/commands/inexistante').expect(404));

  it('POST /diagnostic/analyze : « Mon PC redémarre seul en jeu et chauffe »', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/analyze')
      .send({ platform: 'windows', description: 'Mon PC redémarre seul, surtout en jeu, et il chauffe' })
      .expect(201);
    expect(res.body.sessionId).toEqual(expect.any(String));
    expect(res.body.hypotheses[0].cause).toBe('overheating');
    expect(res.body.hypotheses[0].actionPlan.length).toBeGreaterThan(0);
  });

  it('POST /diagnostic/analyze refuse une requête vide', () =>
    request(app.getHttpServer()).post('/api/v1/diagnostic/analyze').send({ platform: 'windows' }).expect(400));
});
