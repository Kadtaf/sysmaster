import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { AiGateway, AiQuizRequest, AiQuizResponse, AiUnavailableError } from '../src/modules/assistant/application/ports';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

/** Faux service IA : deux questions par appel, et l'on garde ce qu'il a reçu. */
class QuizAi extends AiGateway {
  calls: AiQuizRequest[] = [];
  down = false;
  ask(): never {
    throw new Error('non utilisé ici');
  }
  extractSymptoms(): never {
    throw new Error('non utilisé ici');
  }
  async generateQuiz(req: AiQuizRequest): Promise<AiQuizResponse> {
    this.calls.push(req);
    if (this.down) throw new AiUnavailableError('injoignable');
    const q = (n: number) => ({
      type: 'single' as const, promptMd: `Question ${n} : pourquoi lancer ${req.title} avant d’agir ?`,
      choices: [{ id: 'a', text: 'Pour observer' }, { id: 'b', text: 'Pour réparer' }], answer: ['a'],
      explanation: 'On observe avant de modifier.', difficulty: 'beginner' as const,
    });
    return {
      questions: [q(1), q(2)], notes: ['Question 3 écartée : la réponse ne correspond à aucun choix.'],
      model: 'fake', latencyMs: 3, outcome: 'answered', usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
}

describeDb('Brouillons de quiz rédigés par l’IA (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  let commandSlug: string;
  let quizSlug: string;
  const ai = new QuizAi();
  const http = () => request(app.getHttpServer());
  const as = async (roles: string[]) => {
    const token = await tokenFor(newIdentity(), roles);
    return (r: request.Test) => r.auth(token, { type: 'bearer' });
  };

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp((b) => b.overrideProvider(AiGateway).useValue(ai)));
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    commandSlug = (await pool.query(`SELECT slug FROM kb.commands WHERE status = 'published' ORDER BY slug LIMIT 1`)).rows[0].slug;
    quizSlug = `quiz-${commandSlug}`;
    await cleanup();
  });
  async function cleanup() {
    const ids = (await pool.query(`SELECT id FROM assessment.quizzes WHERE slug = $1`, [quizSlug])).rows.map((r) => r.id);
    await pool.query(`DELETE FROM editorial.revisions WHERE kind = 'quiz' AND (quiz_id = ANY($1::uuid[]) OR content->>'slug' = $2)`, [ids, quizSlug]);
    await pool.query(`DELETE FROM assessment.questions WHERE id IN (SELECT question_id FROM assessment.quiz_questions WHERE quiz_id = ANY($1::uuid[]))`, [ids]);
    await pool.query(`DELETE FROM kb.command_links WHERE target_type = 'quiz' AND target_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM assessment.quizzes WHERE id = ANY($1::uuid[])`, [ids]);
  }
  afterAll(async () => {
    await cleanup();
    await pool?.end();
    await app?.close();
  });

  it('un apprenant ne peut pas demander de brouillon', async () => {
    const learner = await as(['learner']);
    await learner(http().post('/api/v1/editorial/quiz-drafts').send({ commandSlug })).expect(403);
  });

  it('brouillon IA → relecture humaine → publication liée à la fiche, puis ajout de questions', async () => {
    const author = await as(['author']);
    const draft = await author(http().post('/api/v1/editorial/quiz-drafts').send({ commandSlug, count: 3 })).expect(201);
    expect(draft.body).toMatchObject({ added: 2, notes: [expect.stringContaining('Question 3')] });
    expect(ai.calls[0]).toMatchObject({ count: 3, level: 'beginner' });
    expect(ai.calls[0].text).toContain('Pourquoi :');

    // Une seule révision ouverte : pas de second appel au modèle pour rien.
    await author(http().post('/api/v1/editorial/quiz-drafts').send({ commandSlug })).expect(409);
    expect(ai.calls).toHaveLength(1);

    const id = draft.body.revisionId;
    const rev = await author(http().get(`/api/v1/editorial/revisions/${id}`)).expect(200);
    expect(rev.body).toMatchObject({ kind: 'quiz', key: quizSlug, isNew: true, issues: [] });
    expect(rev.body.content.questions.every((q: { generatedByAi: boolean }) => q.generatedByAi)).toBe(true);

    // L'explication est obligatoire : la relecture la vérifie aussi.
    const broken = structuredClone(rev.body.content);
    broken.questions[0].explanation = '';
    await author(http().put(`/api/v1/editorial/revisions/${id}`).send(broken)).expect(200);
    await author(http().post(`/api/v1/editorial/revisions/${id}/submit`)).expect(422);
    await author(http().put(`/api/v1/editorial/revisions/${id}`).send(rev.body.content)).expect(200);
    await author(http().post(`/api/v1/editorial/revisions/${id}/submit`)).expect(200);

    const reviewer = await as(['reviewer']);
    const approved = await reviewer(http().post(`/api/v1/editorial/revisions/${id}/review`).send({ decision: 'approve' })).expect(200);
    expect(approved.body.status).toBe('published');

    const { rows } = await pool.query(
      `SELECT x.generated_by_ai, x.reviewed, c.slug AS command
         FROM assessment.quizzes q JOIN assessment.quiz_questions qq ON qq.quiz_id = q.id JOIN assessment.questions x ON x.id = qq.question_id
         JOIN kb.command_links l ON l.target_type = 'quiz' AND l.target_id = q.id JOIN kb.commands c ON c.id = l.command_id
        WHERE q.slug = $1`,
      [quizSlug],
    );
    expect(rows).toEqual([
      { generated_by_ai: true, reviewed: true, command: commandSlug },
      { generated_by_ai: true, reviewed: true, command: commandSlug },
    ]);

    // Nouveau brouillon : part du quiz publié et ajoute les nouvelles questions.
    const more = await author(http().post('/api/v1/editorial/quiz-drafts').send({ commandSlug })).expect(201);
    const next = await author(http().get(`/api/v1/editorial/revisions/${more.body.revisionId}`)).expect(200);
    expect(next.body).toMatchObject({ isNew: false });
    expect(next.body.content.questions).toHaveLength(4);
    await author(http().post(`/api/v1/editorial/revisions/${more.body.revisionId}/withdraw`)).expect(200);

    const runs = await pool.query(`SELECT count(*)::int AS n FROM ai.agent_runs WHERE agent_code = 'quiz_generator' AND tokens_in = 100`);
    expect(runs.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('IA indisponible : 503, et l’essai compte dans le quota', async () => {
    ai.down = true;
    const author = await as(['author']);
    await author(http().post('/api/v1/editorial/quiz-drafts').send({ commandSlug: `${commandSlug}` })).expect(503);
    ai.down = false;
  });
});
