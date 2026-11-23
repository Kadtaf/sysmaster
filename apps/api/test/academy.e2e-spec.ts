import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createTestApp } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

// Identifiants des données de démo (db/seeds)
const L = {
  systemctl: '00000000-0000-4000-8500-000000000003',
  journalctl: '00000000-0000-4000-8500-000000000006',
  unite: '00000000-0000-4000-8500-000000000007',
};

describeDb('Académie (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });

  it('le plan d\'un cours est public, sans état de progression pour un visiteur', async () => {
    const res = await http().get('/api/v1/learning/courses/linux-systemd').expect(200);
    const lessons = res.body.modules.flatMap((m: { lessons: unknown[] }) => m.lessons);
    expect(lessons.map((l: { slug: string }) => l.slug)).toEqual(['systemctl-bases', 'journalctl-diagnostic', 'unite-personnalisee']);
    expect(lessons.every((l: { status: unknown }) => l.status === null)).toBe(true);
  });

  it('une leçon est lisible par tous, avec navigation précédente/suivante', async () => {
    const res = await http().get('/api/v1/learning/courses/linux-systemd/lessons/journalctl-diagnostic').expect(200);
    expect(res.body).toMatchObject({
      title: 'Comprendre pourquoi un service échoue',
      previous: { slug: 'systemctl-bases' },
      next: { slug: 'unite-personnalisee' },
    });
    expect(res.body.contentMd).toContain('## Pourquoi');
  });

  it('valider exige une connexion', () => http().post(`/api/v1/learning/lessons/${L.systemctl}/complete`).expect(401));

  it('parcours complet : inscription, ordre imposé, progression, événement', async () => {
    const token = await tokenFor();
    const auth = (r: request.Test) => r.auth(token, { type: 'bearer' });

    const enrolled = await auth(http().post('/api/v1/learning/paths/administrateur-linux/enroll')).expect(200);
    expect(enrolled.body).toMatchObject({ pathSlug: 'administrateur-linux', progressPct: 0, completedAt: null });

    // Ordre : la 2e leçon est verrouillée tant que la 1re n'est pas validée, et on dit laquelle faire.
    const locked = await auth(http().post(`/api/v1/learning/lessons/${L.journalctl}/complete`)).expect(409);
    expect(locked.body.blockedBy).toEqual({ slug: 'systemctl-bases', title: 'systemctl : démarrer, arrêter, activer' });

    const first = await auth(http().post(`/api/v1/learning/lessons/${L.systemctl}/complete`)).expect(200);
    expect(first.body).toMatchObject({ alreadyCompleted: false, next: { slug: 'journalctl-diagnostic' } });
    expect(first.body.enrollments[0].progressPct).toBe(33.33);

    // Idempotent : pas de second événement.
    const again = await auth(http().post(`/api/v1/learning/lessons/${L.systemctl}/complete`)).expect(200);
    expect(again.body.alreadyCompleted).toBe(true);

    await auth(http().post(`/api/v1/learning/lessons/${L.journalctl}/complete`)).expect(200);
    const last = await auth(http().post(`/api/v1/learning/lessons/${L.unite}/complete`)).expect(200);
    expect(last.body.enrollments[0]).toMatchObject({ progressPct: 100, completedAt: expect.any(String) });
    expect(last.body.next).toBeNull();

    const course = await auth(http().get('/api/v1/learning/courses/linux-systemd')).expect(200);
    expect(course.body.modules[0].lessons.map((l: { status: string }) => l.status)).toEqual(['completed', 'completed', 'completed']);

    const me = await auth(http().get('/api/v1/me')).expect(200);
    const events = await pool.query(
      `SELECT count(*)::int AS n FROM platform.outbox_events
        WHERE type = 'learning.lesson.completed.v1' AND payload->>'userId' = $1`,
      [me.body.id],
    );
    expect(events.rows[0].n).toBe(3);
  });

  it('une inscription tardive reprend les leçons déjà validées', async () => {
    const token = await tokenFor();
    await http().post(`/api/v1/learning/lessons/${L.systemctl}/complete`).auth(token, { type: 'bearer' }).expect(200);
    const res = await http().post('/api/v1/learning/paths/ingenieur-devops/enroll').auth(token, { type: 'bearer' }).expect(200);
    // Parcours DevOps = cours systemd (3 leçons) + Docker (2 leçons) : 1 / 5.
    expect(res.body.progressPct).toBe(20);
    const path = await http().get('/api/v1/learning/paths/ingenieur-devops').auth(token, { type: 'bearer' }).expect(200);
    expect(path.body.courses.map((c: { completedCount: number }) => c.completedCount)).toEqual([1, 0]);
    expect(path.body.enrollment.progressPct).toBe(20);
  });

  it('404 sur un parcours, un cours ou une leçon inconnus', async () => {
    await http().get('/api/v1/learning/paths/inconnu').expect(404);
    await http().get('/api/v1/learning/courses/inconnu').expect(404);
    await http().get('/api/v1/learning/courses/linux-systemd/lessons/inconnue').expect(404);
    const token = await tokenFor();
    await http().post('/api/v1/learning/lessons/00000000-0000-4000-8500-999999999999/complete').auth(token, { type: 'bearer' }).expect(404);
  });
});
