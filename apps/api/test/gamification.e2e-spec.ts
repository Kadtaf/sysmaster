import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { EventRegistry } from '../src/shared/events/event-registry';
import { OutboxRelay } from '../src/shared/events/outbox-relay';
import { createSystemdPath, dropPath } from './helpers/fixtures';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
// Parcours limité au cours systemd : les parcours réels évoluent avec le contenu.
const PATH = 'parcours-test-gamification';

const L = {
  systemctl: '00000000-0000-4000-8500-000000000003', // 30 min → 40 XP
  journalctl: '00000000-0000-4000-8500-000000000006', // 25 min → 35 XP
  unite: '00000000-0000-4000-8500-000000000007', // 35 min → 45 XP
};

describeDb('Gamification et relais d\'événements (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  let relay: OutboxRelay;
  const http = () => request(app.getHttpServer());

  /**
   * Fait tourner le relais jusqu'à ce que la condition soit vraie. D'autres suites (ou le minuteur
   * du relais) peuvent verrouiller un lot au même moment (SKIP LOCKED) : on réessaie un court instant.
   */
  async function settle<T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
    const deadline = Date.now() + 5000;
    for (;;) {
      await relay.drain();
      const value = await read();
      if (ok(value) || Date.now() > deadline) return value;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await createSystemdPath(pool, PATH);
    relay = app.get(OutboxRelay);
  });
  afterAll(async () => {
    await dropPath(pool, PATH);
    await pool?.end();
    await app?.close();
  });

  it('le tableau de bord et le profil exigent une connexion', () => http().get('/api/v1/me/dashboard').expect(401));

  it('leçons, parcours terminé et diagnostic rapportent XP, badges et série ; le tableau de bord le reflète', async () => {
    const identity = newIdentity();
    const token = await tokenFor(identity);
    const auth = (r: request.Test) => r.auth(token, { type: 'bearer' });
    const dashboard = async () => (await auth(http().get('/api/v1/me/dashboard')).expect(200)).body;

    // Nouvel inscrit : on lui propose de choisir un parcours.
    const empty = await dashboard();
    expect(empty.gamification).toMatchObject({ totalXp: 0, level: 1, streakDays: 0 });
    expect(empty.recommendations).toEqual([expect.objectContaining({ kind: 'start', href: '/parcours' })]);

    await auth(http().post(`/api/v1/learning/paths/${PATH}/enroll`)).expect(200);
    await auth(http().post(`/api/v1/learning/lessons/${L.systemctl}/complete`)).expect(200);

    const afterFirst = await settle(dashboard, (d) => d.gamification.totalXp >= 40);
    expect(afterFirst.gamification).toMatchObject({ totalXp: 40, lessonsCompleted: 1, streakDays: 1 });
    expect(afterFirst.gamification.badges.find((b: { code: string }) => b.code === 'first_lesson').earnedAt).not.toBeNull();
    expect(afterFirst.gamification.recentXp[0]).toMatchObject({ amount: 40 });
    // La prochaine leçon recommandée est la suivante dans l'ordre.
    expect(afterFirst.recommendations).toContainEqual(
      expect.objectContaining({ kind: 'continue', href: '/cours/linux-systemd/journalctl-diagnostic' }),
    );

    await auth(http().post(`/api/v1/learning/lessons/${L.journalctl}/complete`)).expect(200);
    await auth(http().post(`/api/v1/learning/lessons/${L.unite}/complete`)).expect(200);
    await auth(http().post('/api/v1/diagnostic/analyze'))
      .send({ platform: 'windows', description: 'Mon PC redémarre seul, surtout en jeu, et il chauffe' })
      .expect(201);

    // 40 + 35 + 45 (leçons) + 200 (parcours terminé) + 15 (diagnostic) = 335
    const done = await settle(dashboard, (d) => d.gamification.totalXp >= 335);
    expect(done.gamification).toMatchObject({
      totalXp: 335, lessonsCompleted: 3, pathsCompleted: 1, diagnosticsCompleted: 1, streakDays: 1,
    });
    const earned = done.gamification.badges.filter((b: { earnedAt: unknown }) => b.earnedAt).map((b: { code: string }) => b.code);
    expect(earned.sort()).toEqual(['first_diagnostic', 'first_lesson', 'path_completed']);
    expect(done.gamification.level).toBeGreaterThan(1);
    // Compétences du cours systemd toutes acquises : elles apparaissent en points forts.
    expect(done.strengths.length).toBeGreaterThan(0);
    expect(done.strengths.every((s: { pct: number }) => s.pct >= 60)).toBe(true);

    // Classement : nom abrégé, rang personnel ; on peut s'en retirer.
    const board = await auth(http().get('/api/v1/gamification/leaderboard?limit=100')).expect(200);
    expect(board.body.me).toMatchObject({ name: 'Test U.', totalXp: 335, isMe: true });
    expect(JSON.stringify(board.body)).not.toContain(identity.email);

    await auth(http().put('/api/v1/me/leaderboard-visibility')).send({ visible: false }).expect(204);
    const hidden = await auth(http().get('/api/v1/gamification/leaderboard?limit=100')).expect(200);
    expect(hidden.body.me).toBeNull();
    expect((await dashboard()).gamification.showInLeaderboard).toBe(false);
  });

  it('rejouer un événement déjà traité ne compte pas l\'XP deux fois', async () => {
    const identity = newIdentity();
    const token = await tokenFor(identity);
    const auth = (r: request.Test) => r.auth(token, { type: 'bearer' });
    await auth(http().post(`/api/v1/learning/lessons/${L.systemctl}/complete`)).expect(200);
    const profile = async () => (await auth(http().get('/api/v1/me/dashboard')).expect(200)).body.gamification;
    await settle(profile, (g) => g.totalXp >= 40);

    // Simule une panne après traitement mais avant le marquage « publié » : l'événement repasse.
    const { rowCount } = await pool.query(
      `UPDATE platform.outbox_events SET published_at = NULL
        WHERE type = 'learning.lesson.completed.v1' AND payload->>'userId' = (SELECT id::text FROM iam.users WHERE idp_subject = $1)`,
      [identity.sub],
    );
    expect(rowCount).toBe(1);
    await relay.drain();
    expect(await profile()).toMatchObject({ totalXp: 40, lessonsCompleted: 1 });
  });

  it('un consommateur en échec est retenté plus tard, sans bloquer les autres événements', async () => {
    const type = `test.boom.${Date.now()}.v1`;
    app.get(EventRegistry).subscribe('test-failing', [type], async () => {
      throw new Error('panne simulée');
    });
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
       VALUES ('test', gen_random_uuid(), $1, '{}') RETURNING id`,
      [type],
    );
    try {
      const read = async () =>
        (await pool.query(
          `SELECT attempts, last_error, published_at, next_attempt_at > now() AS deferred
             FROM platform.outbox_events WHERE id = $1`,
          [rows[0].id],
        )).rows[0];
      const state = await settle(read, (r) => r.attempts >= 1);
      expect(state).toMatchObject({ attempts: 1, published_at: null, deferred: true });
      expect(state.last_error).toContain('test-failing: panne simulée');
      // Repoussé : un nouveau passage immédiat ne le retente pas.
      await relay.drain();
      expect((await read()).attempts).toBe(1);
      // L'échec n'a pas été mémorisé comme « traité » : il sera bien rejoué.
      const processed = await pool.query(`SELECT 1 FROM platform.processed_events WHERE consumer = 'test-failing' AND event_id = $1`, [rows[0].id]);
      expect(processed.rowCount).toBe(0);
    } finally {
      await pool.query('DELETE FROM platform.outbox_events WHERE id = $1', [rows[0].id]);
    }
  });
});
