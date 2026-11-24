import { INestApplication } from '@nestjs/common';
import type { AssistantAnswer } from '@sysmaster/contracts';
import request from 'supertest';
import { AiAskRequest, AiAskResponse, AiGateway, AiStreamEvent, AiUnavailableError } from '../src/modules/assistant/application/ports';
import { createTestApp } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const answer: AssistantAnswer = {
  summary: 'Lire les journaux du service',
  explanation: 'journalctl affiche les journaux systemd.',
  steps: [{
    title: 'Lire les journaux', why: 'Comprendre la cause', how: 'Filtrer par unité', command: 'journalctl -u nginx -n 50',
    shell: 'bash', when: 'Après un échec', risk: 'low', riskNote: 'Lecture seule', alternatives: [],
    maskedUntilRisksRead: false, copyAllowed: true, flaggedBy: [],
  }],
  sources: [], checkQuestions: [], verified: false, outOfScope: false, notes: [],
};

/** Faux service IA en flux : deux morceaux de texte, puis la réponse ; ou une coupure après le premier morceau. */
class StreamingAi extends AiGateway {
  mode: 'ok' | 'down' | 'cut' = 'ok';
  extractSymptoms(): never {
    throw new Error('non utilisé ici');
  }
  async ask(): Promise<AiAskResponse> {
    throw new Error('le flux ne doit pas passer par ask()');
  }
  async askStream(_req: AiAskRequest, onEvent: (e: AiStreamEvent) => void): Promise<AiAskResponse> {
    if (this.mode === 'down') throw new AiUnavailableError('injoignable');
    onEvent({ event: 'meta', data: { agent: 'diagnostician', domain: 'linux', consulted: [{ ref: 1, title: 'journalctl', kind: 'kb_command' }] } });
    onEvent({ event: 'delta', data: { field: 'summary', text: 'Lire les journaux' } });
    if (this.mode === 'cut') throw new AiUnavailableError('flux interrompu');
    onEvent({ event: 'delta', data: { field: 'summary', text: ' du service' } });
    return {
      answer, agent: 'diagnostician', domain: 'linux', model: 'fake', latencyMs: 5, outcome: 'answered',
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
}

function events(text: string): { event: string; data: any }[] {
  return text.trim().split('\n\n').map((block) => ({
    event: /^event: (.*)$/m.exec(block)![1],
    data: JSON.parse(/^data: (.*)$/m.exec(block)![1]),
  }));
}

describeDb('Assistant en flux (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  const ai = new StreamingAi();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(AiGateway).useValue(ai)));
  });
  afterAll(() => app?.close());
  beforeEach(() => {
    ai.mode = 'ok';
  });

  it('exige une connexion', () => http().post('/api/v1/assistant/ask/stream').send({ question: 'Pourquoi nginx échoue ?' }).expect(401));

  it('envoie meta, le texte au fil de l’eau, puis la réponse enregistrée', async () => {
    const token = await tokenFor();
    const res = await http().post('/api/v1/assistant/ask/stream').auth(token, { type: 'bearer' })
      .send({ question: 'Mon service nginx ne démarre pas' }).expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    const list = events(res.text);
    expect(list.map((e) => e.event)).toEqual(['meta', 'delta', 'delta', 'reply']);
    // Les commandes n'arrivent qu'avec la réponse finale, validée.
    expect(JSON.stringify(list.slice(0, -1))).not.toContain('journalctl -u');
    const reply = list[3].data;
    expect(reply).toMatchObject({ agent: 'diagnostician', outcome: 'answered', answer: { summary: answer.summary } });
    const turns = await http().get(`/api/v1/assistant/conversations/${reply.conversationId}`).auth(token, { type: 'bearer' }).expect(200);
    expect(turns.body[0].reply.summary).toBe(answer.summary);
  });

  it('service injoignable avant le premier événement : erreur HTTP ordinaire', async () => {
    ai.mode = 'down';
    const token = await tokenFor();
    await http().post('/api/v1/assistant/ask/stream').auth(token, { type: 'bearer' }).send({ question: 'Mon service nginx ne démarre pas' }).expect(503);
  });

  it('coupure en cours de flux : événement error, question gardée dans l’historique', async () => {
    ai.mode = 'cut';
    const token = await tokenFor();
    const res = await http().post('/api/v1/assistant/ask/stream').auth(token, { type: 'bearer' }).send({ question: 'Mon service nginx ne démarre pas' }).expect(200);
    const list = events(res.text);
    expect(list.map((e) => e.event)).toEqual(['meta', 'delta', 'error']);
    expect(list[2].data.status).toBe(503);
    const conversations = await http().get('/api/v1/assistant/conversations').auth(token, { type: 'bearer' }).expect(200);
    expect(conversations.body).toHaveLength(1);
  });
});
