import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OutboxRelay } from '../src/shared/events/outbox-relay';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const LAB = 'linux-port-80-occupe';

describeDb('Labs simulés (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let relay: OutboxRelay;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    relay = app.get(OutboxRelay);
  });
  afterAll(async () => {
    await app?.close();
  });

  async function learner() {
    const token = await tokenFor(newIdentity());
    return <T extends request.Test>(r: T) => r.auth(token, { type: 'bearer' });
  }

  it('catalogue et énoncé publics, sans indices ni solution', async () => {
    const list = (await http().get('/api/v1/labs').expect(200)).body;
    expect(list).toContainEqual(expect.objectContaining({ slug: LAB, runtime: 'simulation', category: 'linux' }));
    const detail = (await http().get(`/api/v1/labs/${LAB}`).expect(200)).body;
    expect(detail).toMatchObject({ slug: LAB, hintCount: 3 });
    expect(detail.checks).toContain('nginx est démarré');
    expect(JSON.stringify(detail)).not.toMatch(/systemctl disable apache2/);
    await http().get('/api/v1/labs/inexistant').expect(404);
  });

  it('démarrer un lab exige une connexion', () => http().post(`/api/v1/labs/${LAB}/instances`).expect(401));

  it('un lab sur environnement réel n’est pas encore démarrable', async () => {
    const auth = await learner();
    await auth(http().post('/api/v1/labs/linux-nginx-failed/instances')).expect(409);
  });

  it('de la panne à la résolution : commandes, indice, vérification, solution et XP', async () => {
    const auth = await learner();
    const started = (await auth(http().post(`/api/v1/labs/${LAB}/instances`)).expect(200)).body;
    expect(started).toMatchObject({ status: 'running', prompt: 'root@web01:~#', transcript: [], hints: [], hintCount: 3, solutionMd: null });

    // Reprendre le lab renvoie la même session.
    const resumed = (await auth(http().post(`/api/v1/labs/${LAB}/instances`)).expect(200)).body;
    expect(resumed.id).toBe(started.id);

    const cmd = async (command: string) =>
      (await auth(http().post(`/api/v1/lab-instances/${started.id}/commands`)).send({ command }).expect(200)).body;

    expect((await cmd('ss -tlnp')).output).toContain('apache2');
    const early = (await auth(http().post(`/api/v1/lab-instances/${started.id}/check`)).expect(200)).body;
    expect(early.solved).toBe(false);
    expect(early.instance.solutionMd).toBeNull();

    const hinted = (await auth(http().post(`/api/v1/lab-instances/${started.id}/hints`)).expect(200)).body;
    expect(hinted.hints).toHaveLength(1);

    await cmd('systemctl stop apache2');
    await cmd('systemctl disable apache2');
    expect((await cmd('systemctl start nginx')).exitCode).toBe(0);

    const done = (await auth(http().post(`/api/v1/lab-instances/${started.id}/check`)).expect(200)).body;
    expect(done.solved).toBe(true);
    expect(done.checks.every((c: { passed: boolean }) => c.passed)).toBe(true);
    expect(done.instance).toMatchObject({ status: 'solved', score: 85 });
    expect(done.instance.solutionMd).toContain('disable');
    expect(done.instance.transcript).toHaveLength(4);

    // Une session résolue ne reçoit plus de commandes ; vérifier à nouveau ne rapporte rien de plus.
    await auth(http().post(`/api/v1/lab-instances/${started.id}/commands`)).send({ command: 'ls' }).expect(409);
    await auth(http().post(`/api/v1/lab-instances/${started.id}/check`)).expect(200);

    // Un indice utilisé : 30 XP et le badge du premier lab, pas celui « sans indice ».
    const deadline = Date.now() + 5000;
    let g: { totalXp: number; badges: { code: string; earnedAt: string | null }[] };
    for (;;) {
      await relay.drain();
      g = (await auth(http().get('/api/v1/me/dashboard')).expect(200)).body.gamification;
      if (g.totalXp >= 30 || Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(g.totalXp).toBe(30);
    const earned = g.badges.filter((b) => b.earnedAt).map((b) => b.code);
    expect(earned).toContain('first_lab');
    expect(earned).not.toContain('lab_no_hint');

    // Recommencer repart d'une machine neuve.
    const fresh = (await auth(http().post(`/api/v1/labs/${LAB}/instances?fresh=true`)).expect(200)).body;
    expect(fresh.id).not.toBe(started.id);
    expect(fresh).toMatchObject({ status: 'running', transcript: [] });
  });

  it('une session appartient à son apprenant', async () => {
    const alice = await learner();
    const bob = await learner();
    const s = (await alice(http().post(`/api/v1/labs/${LAB}/instances`)).expect(200)).body;
    await bob(http().get(`/api/v1/lab-instances/${s.id}`)).expect(403);
    await bob(http().post(`/api/v1/lab-instances/${s.id}/commands`)).send({ command: 'ls' }).expect(403);
    await bob(http().get('/api/v1/lab-instances/pas-un-uuid')).expect(404);
  });

  it('refuse une commande mal formée et explique une commande refusée par prudence', async () => {
    const auth = await learner();
    const s = (await auth(http().post('/api/v1/labs/linux-disque-plein-nginx/instances')).expect(200)).body;
    await auth(http().post(`/api/v1/lab-instances/${s.id}/commands`)).send({ command: 'x'.repeat(501) }).expect(400);
    const r = (await auth(http().post(`/api/v1/lab-instances/${s.id}/commands`)).send({ command: 'rm -rf /var/log' }).expect(200)).body;
    expect(r.exitCode).toBe(1);
    expect(r.warning).toMatch(/journaux/);
  });
});
