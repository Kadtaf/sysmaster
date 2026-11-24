import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { AiExtractRequest, AiExtractResponse, AiGateway, AiUnavailableError } from '../src/modules/assistant/application/ports';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

/** Faux service IA : renvoie « le PC redémarre seul » avec une citation tirée du texte reçu. */
class FakeAi extends AiGateway {
  calls: AiExtractRequest[] = [];
  down = false;
  ask(): never {
    throw new Error('non utilisé ici');
  }
  async extractSymptoms(req: AiExtractRequest): Promise<AiExtractResponse> {
    this.calls.push(req);
    if (this.down) throw new AiUnavailableError('HTTP 503');
    return {
      symptoms: [{ code: 'unexpected_reboot', quote: req.description.slice(0, 20), source: 'description' }],
      logFindings: [{ summary: 'Arrêt inattendu signalé par Windows.', quote: 'Kernel-Power 41' }],
      notes: [],
      model: 'fake',
      usage: { inputTokens: 900, outputTokens: 40, cacheReadTokens: 800, cacheWriteTokens: 0 },
      latencyMs: 12,
      outcome: 'answered',
    };
  }
}

describeDb('Diagnostic assisté par l’IA (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const ai = new FakeAi();
  const http = () => request(app.getHttpServer());
  const previousQuota = process.env.ASSISTANT_DAILY_QUOTA;
  const body = { platform: 'windows', description: 'Mon ordinateur s’éteint et se rallume pendant les parties', evidence: 'Critique Kernel-Power 41', useAi: true };

  beforeAll(async () => {
    process.env.ASSISTANT_DAILY_QUOTA = '2';
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(AiGateway).useValue(ai)));
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    process.env.ASSISTANT_DAILY_QUOTA = previousQuota;
    await pool?.end();
    await app?.close();
  });
  beforeEach(() => {
    ai.calls = [];
    ai.down = false;
  });

  it('exige une connexion pour l’analyse par l’IA ; sans IA, le diagnostic reste anonyme', async () => {
    await http().post('/api/v1/diagnostic/analyze').send(body).expect(401);
    const res = await http().post('/api/v1/diagnostic/analyze').send({ ...body, useAi: false, description: 'Le PC redémarre seul' }).expect(201);
    expect(res.body.extraction).toMatchObject({ method: 'rules', note: null });
    expect(ai.calls).toHaveLength(0);
  });

  it('symptômes repérés par l’IA, cités, enregistrés avec leur origine ; usage tracé pour le quota et les coûts', async () => {
    const identity = newIdentity();
    const token = await tokenFor(identity);
    const res = await http().post('/api/v1/diagnostic/analyze').auth(token, { type: 'bearer' }).send(body).expect(201);

    // Catalogue envoyé : celui de la plateforme, jamais les causes.
    expect(ai.calls[0].catalogue.some((s) => s.code === 'unexpected_reboot')).toBe(true);
    expect(res.body.detectedSymptoms).toEqual([{ code: 'unexpected_reboot', label: 'Le PC redémarre seul' }]);
    expect(res.body.extraction).toMatchObject({
      method: 'ai',
      remainingToday: 1,
      quotes: [{ code: 'unexpected_reboot', label: 'Le PC redémarre seul', source: 'description' }],
      logFindings: [{ quote: 'Kernel-Power 41' }],
    });
    expect(res.body.hypotheses.length).toBeGreaterThan(0);

    const { rows: symptoms } = await pool.query(`SELECT source FROM diagnostic.session_symptoms WHERE session_id = $1`, [res.body.sessionId]);
    expect(symptoms).toEqual([{ source: 'extracted_ai' }]);
    const { rows: runs } = await pool.query(
      `SELECT r.agent_code, r.outcome, r.tokens_in, r.cache_read_tokens FROM ai.agent_runs r JOIN iam.users u ON u.id = r.user_id WHERE u.idp_subject = $1`,
      [identity.sub],
    );
    expect(runs).toEqual([{ agent_code: 'symptom_extractor', outcome: 'ok', tokens_in: 900, cache_read_tokens: 800 }]);
  });

  it('quota commun : l’essai suivant est refusé, même si le service IA était en panne (repli compté)', async () => {
    const token = await tokenFor();
    const auth = (r: request.Test) => r.auth(token, { type: 'bearer' });

    ai.down = true;
    const degraded = await auth(http().post('/api/v1/diagnostic/analyze')).send({ ...body, description: 'Le PC redémarre seul' }).expect(201);
    expect(degraded.body.extraction).toMatchObject({ method: 'rules', note: expect.stringContaining('indisponible') });
    expect(degraded.body.detectedSymptoms.map((s: { code: string }) => s.code)).toContain('unexpected_reboot');

    ai.down = false;
    await auth(http().post('/api/v1/diagnostic/analyze')).send(body).expect(201);
    const refused = await auth(http().post('/api/v1/diagnostic/analyze')).send(body).expect(429);
    expect(refused.body.message).toContain('2 demandes');
  });
});
