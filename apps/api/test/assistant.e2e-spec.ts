import { INestApplication } from '@nestjs/common';
import type { AssistantAnswer } from '@sysmaster/contracts';
import request from 'supertest';
import { AiAskRequest, AiAskResponse, AiGateway, AiUnavailableError } from '../src/modules/assistant/application/ports';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const answer: AssistantAnswer = {
  summary: 'Lire les journaux du service',
  explanation: 'journalctl affiche les journaux systemd.',
  steps: [{
    title: 'Lire les journaux', why: 'Comprendre la cause de l’échec', how: 'Filtrer par unité', command: 'journalctl -u nginx -n 50',
    shell: 'bash', when: 'Après un échec de démarrage', risk: 'low', riskNote: 'Lecture seule', alternatives: [],
    maskedUntilRisksRead: false, copyAllowed: true, flaggedBy: [],
  }],
  sources: [{ ref: 1, title: 'journalctl', url: '/commandes/journalctl', kind: 'kb_command', slug: 'journalctl' }],
  checkQuestions: ['Que fait l’option -u ?'], verified: true, outOfScope: false, notes: [],
};

/** Faux service IA : on pilote ses réponses et on observe ce qu'il reçoit. */
class FakeAi extends AiGateway {
  calls: AiAskRequest[] = [];
  down = false;
  async ask(req: AiAskRequest): Promise<AiAskResponse> {
    this.calls.push(req);
    if (this.down) throw new AiUnavailableError('service IA injoignable');
    return {
      answer, agent: 'diagnostician', domain: 'linux', model: 'fake', latencyMs: 5, outcome: 'answered',
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
}

describeDb('Assistant (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  const ai = new FakeAi();
  const http = () => request(app.getHttpServer());
  const previousQuota = process.env.ASSISTANT_DAILY_QUOTA;

  beforeAll(async () => {
    process.env.ASSISTANT_DAILY_QUOTA = '3';
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(AiGateway).useValue(ai)));
  });
  afterAll(async () => {
    process.env.ASSISTANT_DAILY_QUOTA = previousQuota;
    await app?.close();
  });
  beforeEach(() => {
    ai.calls = [];
    ai.down = false;
  });

  it('exige une connexion', () => http().post('/api/v1/assistant/ask').send({ question: 'Pourquoi nginx échoue ?' }).expect(401));

  it('refuse une question invalide', async () => {
    const token = await tokenFor();
    await http().post('/api/v1/assistant/ask').auth(token, { type: 'bearer' }).send({ question: 'a' }).expect(400);
  });

  it('répond, conserve la conversation et transmet l’historique au tour suivant', async () => {
    const token = await tokenFor();
    const auth = (r: request.Test) => r.auth(token, { type: 'bearer' });

    const first = await auth(http().post('/api/v1/assistant/ask')).send({ question: 'Mon service nginx ne démarre pas', platform: 'linux' }).expect(200);
    expect(first.body).toMatchObject({ agent: 'diagnostician', domain: 'linux', outcome: 'answered', remainingToday: 2 });
    expect(first.body.answer.steps[0].command).toBe('journalctl -u nginx -n 50');
    expect(ai.calls[0]).toMatchObject({ question: 'Mon service nginx ne démarre pas', platform: 'linux', level: 'beginner', history: [] });

    const conversationId = first.body.conversationId;
    await auth(http().post('/api/v1/assistant/ask')).send({ question: 'Et ensuite ?', conversationId }).expect(200);
    expect(ai.calls[1].history).toEqual([{ question: 'Mon service nginx ne démarre pas', summary: answer.summary }]);

    const list = await auth(http().get('/api/v1/assistant/conversations')).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: conversationId, title: 'Mon service nginx ne démarre pas' })]);

    const turns = await auth(http().get(`/api/v1/assistant/conversations/${conversationId}`)).expect(200);
    expect(turns.body.map((t: { question: string }) => t.question)).toEqual(['Mon service nginx ne démarre pas', 'Et ensuite ?']);
    expect(turns.body[0].reply.summary).toBe(answer.summary);

    await auth(http().put(`/api/v1/assistant/messages/${first.body.messageId}/feedback`)).send({ rating: 1, comment: 'clair' }).expect(204);
    // Un second avis remplace le premier.
    await auth(http().put(`/api/v1/assistant/messages/${first.body.messageId}/feedback`)).send({ rating: -1 }).expect(204);
  });

  it('une conversation ou une réponse d’un autre utilisateur reste invisible', async () => {
    const owner = await tokenFor();
    const other = await tokenFor();
    const res = await http().post('/api/v1/assistant/ask').auth(owner, { type: 'bearer' }).send({ question: 'Comment lister les fichiers ?' }).expect(200);
    const asOther = (r: request.Test) => r.auth(other, { type: 'bearer' });

    await asOther(http().get(`/api/v1/assistant/conversations/${res.body.conversationId}`)).expect(404);
    await asOther(http().post('/api/v1/assistant/ask')).send({ question: 'Je continue ?', conversationId: res.body.conversationId }).expect(404);
    await asOther(http().put(`/api/v1/assistant/messages/${res.body.messageId}/feedback`)).send({ rating: 1 }).expect(404);
    expect(ai.calls).toHaveLength(1);
  });

  it('applique le quota quotidien', async () => {
    const token = await tokenFor(newIdentity());
    const ask = () => http().post('/api/v1/assistant/ask').auth(token, { type: 'bearer' }).send({ question: 'Que fait ls -la ?' });
    for (let i = 0; i < 3; i++) await ask().expect(200);
    const res = await ask().expect(429);
    expect(res.body.message).toContain('3 questions');
    expect(ai.calls).toHaveLength(3);
  });

  it('service IA indisponible : 503, et la question reste dans l’historique', async () => {
    const token = await tokenFor();
    const auth = (r: request.Test) => r.auth(token, { type: 'bearer' });
    ai.down = true;
    await auth(http().post('/api/v1/assistant/ask')).send({ question: 'Pourquoi le disque est plein ?' }).expect(503);

    const [conversation] = (await auth(http().get('/api/v1/assistant/conversations')).expect(200)).body;
    const turns = await auth(http().get(`/api/v1/assistant/conversations/${conversation.id}`)).expect(200);
    expect(turns.body).toEqual([expect.objectContaining({ question: 'Pourquoi le disque est plein ?', reply: null })]);
  });
});
