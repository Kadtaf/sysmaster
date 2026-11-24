import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Quiz d’entraînement (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  let commandSlug: string;
  let quizId: string;
  const ids: string[] = [];
  const slug = `quiz-test-${Date.now().toString(36)}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const cmd = (await pool.query(`SELECT id, slug FROM kb.commands WHERE status = 'published' ORDER BY slug LIMIT 1`)).rows[0];
    commandSlug = cmd.slug;
    quizId = (await pool.query(`INSERT INTO assessment.quizzes (slug, title, kind, platform) VALUES ($1, 'Quiz de test', 'practice', 'linux') RETURNING id`, [slug])).rows[0].id;
    const questions = [
      ['single', 'Pourquoi observer avant d’agir ?', [{ id: 'a', text: 'Pour savoir' }, { id: 'b', text: 'Pour rien' }], ['a'], 'On agit en connaissance de cause.'],
      ['multiple', 'Cochez les commandes en lecture seule.', [{ id: 'a', text: 'df' }, { id: 'b', text: 'ls' }, { id: 'c', text: 'rm' }], ['a', 'b'], 'rm supprime.'],
    ] as const;
    for (const [i, [type, prompt, choices, answer, explanation]] of questions.entries()) {
      const id = (await pool.query(
        `INSERT INTO assessment.questions (type, prompt_md, choices, answer, explanation, difficulty, platform, reviewed)
         VALUES ($1, $2, $3, $4, $5, 'beginner', 'linux', true) RETURNING id`,
        [type, prompt, JSON.stringify(choices), JSON.stringify(answer), explanation],
      )).rows[0].id;
      ids.push(id);
      await pool.query(`INSERT INTO assessment.quiz_questions (quiz_id, question_id, position) VALUES ($1, $2, $3)`, [quizId, id, i]);
    }
    await pool.query(`INSERT INTO kb.command_links (command_id, target_type, target_id) VALUES ($1, 'quiz', $2)`, [cmd.id, quizId]);
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM kb.command_links WHERE target_id = $1`, [quizId]);
    await pool.query(`DELETE FROM assessment.attempts WHERE quiz_id = $1`, [quizId]);
    await pool.query(`DELETE FROM assessment.questions WHERE id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM assessment.quizzes WHERE id = $1`, [quizId]);
    await pool?.end();
    await app?.close();
  });

  it('liste les quiz d’une fiche et montre un quiz sans ses réponses', async () => {
    const list = await http().get(`/api/v1/quizzes?command=${commandSlug}`).expect(200);
    expect(list.body).toContainEqual({ slug, title: 'Quiz de test', questionCount: 2 });
    const quiz = await http().get(`/api/v1/quizzes/${slug}`).expect(200);
    expect(quiz.body).toMatchObject({ slug, commandSlug, passScore: 70 });
    expect(quiz.body.questions).toHaveLength(2);
    expect(JSON.stringify(quiz.body)).not.toMatch(/answer|explanation|connaissance de cause/);
    await http().get('/api/v1/quizzes/inexistant').expect(404);
  });

  it('corrige une tentative anonyme sans l’enregistrer, et celle d’un apprenant en l’enregistrant', async () => {
    const anon = await http().post(`/api/v1/quizzes/${slug}/attempts`).send({ answers: { [ids[0]]: ['a'], [ids[1]]: ['a', 'b', 'c'] } }).expect(200);
    expect(anon.body).toMatchObject({ score: 50, passed: false, correctCount: 1, total: 2, recorded: false });
    expect(anon.body.results[1]).toMatchObject({ correct: false, answer: ['a', 'b'], explanation: 'rm supprime.' });

    const token = await tokenFor(newIdentity());
    const mine = await http().post(`/api/v1/quizzes/${slug}/attempts`).auth(token, { type: 'bearer' })
      .send({ answers: { [ids[0]]: ['a'], [ids[1]]: ['b', 'a'] } }).expect(200);
    expect(mine.body).toMatchObject({ score: 100, passed: true, recorded: true });
    const { rows } = await pool.query(`SELECT score::float, passed FROM assessment.attempts WHERE quiz_id = $1`, [quizId]);
    expect(rows).toEqual([{ score: 100, passed: true }]);

    await http().post(`/api/v1/quizzes/${slug}/attempts`).send({ answers: { 'pas-un-uuid': ['a'] } }).expect(400);
  });
});
