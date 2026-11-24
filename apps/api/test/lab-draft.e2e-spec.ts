import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { AiGateway, AiLabRequest, AiLabResponse, AiUnavailableError } from '../src/modules/assistant/application/ports';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const SLUG = 'linux-e2e-rapports';
const CONF = '/etc/rapports/rapports.conf';

/** Un lab jouable : le service « rapports » échoue faute de configuration. `fixes` : la démarche répare-t-elle ? */
function lab(fixes: boolean): NonNullable<AiLabResponse['lab']> {
  return {
    slug: SLUG,
    title: 'Le service de rapports ne démarre plus',
    briefMd: 'Le service **rapports** est en échec depuis ce matin. Remettez-le en marche.',
    objectives: ['Lire le journal d’un service en échec'],
    hints: ['Que dit le journal ?', `Il manque ${CONF}.`],
    solutionMd: 'Cause : le fichier de configuration a disparu lors d’un nettoyage. Démarche : lire le journal, recréer le fichier, redémarrer. Prévention : versionner la configuration.',
    machine: {
      hostname: 'srv', cwd: '/root', clock: '2026-11-24T08:00:00.000Z', nextPid: 2000,
      dirs: ['/etc', '/etc/rapports', '/root', '/var', '/var/log'],
      files: { '/var/log/syslog': { size: 10, content: '' } },
      mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 21474836480, baseUsedBytes: 5368709120 }],
      services: {
        rapports: { description: 'Rapports', active: 'failed', enabled: true, process: 'rapports', ports: [8080], needsFiles: [CONF], journal: [] },
      },
    },
    validators: [{ description: 'Le service rapports tourne', check: { kind: 'service_active', service: 'rapports' } }],
    walkthrough: fixes
      ? ['systemctl status rapports', `echo 'port=8080' > ${CONF}`, 'systemctl start rapports']
      : ['systemctl status rapports', 'systemctl start rapports'],
  };
}

/** Faux service IA : la première proposition ne répare pas, la correction si. */
class LabAi extends AiGateway {
  calls: AiLabRequest[] = [];
  mode: 'repairable' | 'garbage' | 'down' = 'repairable';
  ask(): never {
    throw new Error('non utilisé ici');
  }
  extractSymptoms(): never {
    throw new Error('non utilisé ici');
  }
  async generateLab(req: AiLabRequest): Promise<AiLabResponse> {
    this.calls.push(req);
    if (this.mode === 'down') throw new AiUnavailableError('injoignable');
    const usage = { inputTokens: 900, outputTokens: 700, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const out = this.mode === 'garbage'
      ? { ...lab(true), machine: { hostname: 'srv' } }
      : lab(req.previous !== undefined);
    return { lab: out, notes: [], raw: JSON.stringify(out), model: 'fake', latencyMs: 5, outcome: 'answered', usage };
  }
}

describeDb('Brouillons de labs rédigés par l’IA (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const ai = new LabAi();
  const http = () => request(app.getHttpServer());
  const as = async (roles: string[]) => {
    const token = await tokenFor(newIdentity(), roles);
    return (r: request.Test) => r.auth(token, { type: 'bearer' });
  };
  const topic = 'Un service maison ne démarre plus après un nettoyage de /etc.';

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(AiGateway).useValue(ai)));
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await cleanup();
  });
  const cleanup = () => pool.query(`DELETE FROM editorial.revisions WHERE kind = 'lab' AND content->>'slug' LIKE $1`, [`${SLUG}%`]);
  afterAll(async () => {
    await cleanup();
    await pool?.end();
    await app?.close();
  });

  it('un apprenant ne peut pas demander de brouillon', async () => {
    const learner = await as(['learner']);
    await learner(http().post('/api/v1/editorial/lab-drafts').send({ topic, category: 'linux' })).expect(403);
  });

  it('sujet trop court : refusé avant tout appel au modèle', async () => {
    const author = await as(['author']);
    await author(http().post('/api/v1/editorial/lab-drafts').send({ topic: 'disque', category: 'linux' })).expect(400);
    expect(ai.calls).toHaveLength(0);
  });

  it('démarche rejouée, problème renvoyé au modèle, correction vérifiée, puis révision à relire', async () => {
    const author = await as(['author']);
    const res = await author(http().post('/api/v1/editorial/lab-drafts').send({ topic, category: 'cyber', difficulty: 'intermediate' })).expect(201);
    expect(res.body).toMatchObject({ attempts: 2, remainingIssues: [] });

    // Premier appel : un lab publié de la même catégorie sert de modèle, avec la liste des commandes simulées.
    const [first, second] = ai.calls;
    expect(JSON.parse(first.example).category).toBe('cyber');
    expect(first.reference).toContain('ufw');
    expect(first.reference).toContain('firewall_allows');
    expect(first.previous).toBeUndefined();
    // Second appel : la proposition et ce que le simulateur a relevé.
    expect(second.previous).toContain(SLUG);
    expect(second.issues!.join(' ')).toContain('ne répare pas la machine');

    const rev = await author(http().get(`/api/v1/editorial/revisions/${res.body.revisionId}`)).expect(200);
    expect(rev.body).toMatchObject({ kind: 'lab', key: SLUG, isNew: true, issues: [] });
    expect(rev.body.content).toMatchObject({ category: 'cyber', difficulty: 'intermediate' });

    const runs = await pool.query(`SELECT count(*)::int AS n FROM ai.agent_runs WHERE agent_code = 'lab_generator' AND tokens_in = 900`);
    expect(runs.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('proposition inexploitable même après correction : 422 avec les raisons, aucune révision', async () => {
    ai.mode = 'garbage';
    const author = await as(['author']);
    const before = (await pool.query(`SELECT count(*)::int AS n FROM editorial.revisions WHERE kind = 'lab'`)).rows[0].n;
    const res = await author(http().post('/api/v1/editorial/lab-drafts').send({ topic, category: 'linux' })).expect(422);
    expect(res.body.issues.join(' ')).toMatch(/machine/);
    expect((await pool.query(`SELECT count(*)::int AS n FROM editorial.revisions WHERE kind = 'lab'`)).rows[0].n).toBe(before);
  });

  it('IA indisponible : 503', async () => {
    ai.mode = 'down';
    const author = await as(['author']);
    await author(http().post('/api/v1/editorial/lab-drafts').send({ topic, category: 'linux' })).expect(503);
    ai.mode = 'repairable';
  });
});
