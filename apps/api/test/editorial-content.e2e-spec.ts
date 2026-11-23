import { INestApplication } from '@nestjs/common';
import type { CauseContent, CourseContent, PathContent } from '@sysmaster/contracts';
import { Pool } from 'pg';
import request from 'supertest';
import { OutboxRelay } from '../src/shared/events/outbox-relay';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Back-office : cours, parcours et causes de diagnostic (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const http = () => request(app.getHttpServer());
  const stamp = Date.now().toString(36);
  const courseSlug = `cours-test-${stamp}`;
  const pathSlug = `parcours-test-${stamp}`;
  const causeCode = `cause_test_${stamp}`;
  const symptomCode = `symptome_test_${stamp}`;

  const as = async (roles: string[]) => {
    const token = await tokenFor(newIdentity(), roles);
    return (r: request.Test) => r.auth(token, { type: 'bearer' });
  };
  type Auth = Awaited<ReturnType<typeof as>>;

  /** Crée, complète, soumet et fait approuver une révision ; renvoie son identifiant. */
  async function publish(author: Auth, reviewer: Auth, kind: string, content: object, from?: string) {
    const { body } = await author(http().post('/api/v1/editorial/revisions').send({ kind, from })).expect(201);
    await author(http().put(`/api/v1/editorial/revisions/${body.id}`).send(content)).expect(200);
    await author(http().post(`/api/v1/editorial/revisions/${body.id}/submit`)).expect(200);
    const approved = await reviewer(http().post(`/api/v1/editorial/revisions/${body.id}/review`).send({ decision: 'approve' })).expect(200);
    expect(approved.body.status).toBe('published');
    return body.id as string;
  }

  const lesson = (slug: string, title: string) => ({
    slug, title, type: 'reading' as const, estMinutes: 10, objectives: [`Comprendre ${title}`], contentMd: `## Pourquoi\n${title}.`, skills: [],
  });
  const course = (lessons: ReturnType<typeof lesson>[]): CourseContent => ({
    slug: courseSlug, title: 'Cours de test', summary: 'Pour tester le back-office', platform: 'linux', difficulty: 'beginner',
    isPremium: false, modules: [{ title: 'Module unique', lessons }],
  });

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM learning.enrollments WHERE path_id IN (SELECT id FROM learning.learning_paths WHERE slug = $1)`, [pathSlug]);
    await pool.query(`DELETE FROM learning.learning_paths WHERE slug = $1`, [pathSlug]);
    await pool.query(`DELETE FROM learning.courses WHERE slug = $1`, [courseSlug]);
    await pool.query(`DELETE FROM diagnostic.hypotheses WHERE cause_code = $1`, [causeCode]);
    await pool.query(`DELETE FROM diagnostic.causes WHERE code = $1`, [causeCode]);
    await pool.query(`DELETE FROM diagnostic.session_symptoms WHERE symptom_code = $1`, [symptomCode]);
    await pool.query(`DELETE FROM diagnostic.symptoms WHERE code = $1`, [symptomCode]);
    await pool?.end();
    await app?.close();
  });

  it('cours et parcours : publication, protection de la progression, recalcul des inscrits', async () => {
    const author = await author_();
    const reviewer = await as(['reviewer']);
    const learner = await as(['learner']);

    // Un cours de deux leçons, puis un parcours qui le contient.
    const draft = await author(http().post('/api/v1/editorial/revisions').send({ kind: 'course' })).expect(201);
    await author(http().put(`/api/v1/editorial/revisions/${draft.body.id}`).send(course([lesson('l1', 'Un'), lesson('l1', 'Deux')]))).expect(200);
    const dup = await author(http().post(`/api/v1/editorial/revisions/${draft.body.id}/submit`)).expect(422);
    expect(dup.body.issues[0].message).toContain('utilisé deux fois');
    await author(http().put(`/api/v1/editorial/revisions/${draft.body.id}`).send(course([lesson('l1', 'Un'), lesson('l2', 'Deux')]))).expect(200);
    await author(http().post(`/api/v1/editorial/revisions/${draft.body.id}/submit`)).expect(200);
    await reviewer(http().post(`/api/v1/editorial/revisions/${draft.body.id}/review`).send({ decision: 'approve' })).expect(200);

    const path: PathContent = {
      slug: pathSlug, title: 'Parcours de test', summary: 'Pour tester', career: 'sysadmin', difficulty: 'beginner', estHours: 2, courses: [courseSlug],
    };
    await publish(author, reviewer, 'path', path);
    const outline = await http().get(`/api/v1/learning/paths/${pathSlug}`).expect(200);
    expect(outline.body.courses.map((c: { slug: string }) => c.slug)).toEqual([courseSlug]);

    // Un apprenant valide la première leçon : 50 %.
    await learner(http().post(`/api/v1/learning/paths/${pathSlug}/enroll`)).expect(200);
    const l1 = await http().get(`/api/v1/learning/courses/${courseSlug}/lessons/l1`).expect(200);
    await learner(http().post(`/api/v1/learning/lessons/${l1.body.id}/complete`)).expect(200);
    const progress = async () =>
      (await learner(http().get('/api/v1/me/learning')).expect(200)).body.find((e: { pathSlug: string }) => e.pathSlug === pathSlug).progressPct;
    expect(await progress()).toBe(50);

    // Supprimer la leçon validée est refusé ; la déplacer et en ajouter une est accepté.
    const edit = await author(http().post('/api/v1/editorial/revisions').send({ kind: 'course', from: courseSlug })).expect(201);
    expect(edit.body).toMatchObject({ kind: 'course', isNew: false, key: courseSlug });
    await author(http().put(`/api/v1/editorial/revisions/${edit.body.id}`).send(course([lesson('l2', 'Deux')]))).expect(200);
    const refused = await author(http().post(`/api/v1/editorial/revisions/${edit.body.id}/submit`)).expect(422);
    expect(refused.body.issues[0].message).toContain('déjà été validée par 1 apprenant');

    const reorganised: CourseContent = {
      ...course([]),
      modules: [
        { title: 'Introduction', lessons: [lesson('l0', 'Zéro')] },
        { title: 'Suite', lessons: [lesson('l2', 'Deux'), lesson('l1', 'Un, renommée'), lesson('l3', 'Trois')] },
      ],
    };
    await author(http().put(`/api/v1/editorial/revisions/${edit.body.id}`).send(reorganised)).expect(200);
    await author(http().post(`/api/v1/editorial/revisions/${edit.body.id}/submit`)).expect(200);
    await reviewer(http().post(`/api/v1/editorial/revisions/${edit.body.id}/review`).send({ decision: 'approve' })).expect(200);

    // La leçon validée garde son identifiant (donc la progression) malgré le déplacement.
    const moved = await http().get(`/api/v1/learning/courses/${courseSlug}/lessons/l1`).expect(200);
    expect(moved.body).toMatchObject({ id: l1.body.id, title: 'Un, renommée', moduleTitle: 'Suite' });
    const plan = await http().get(`/api/v1/learning/courses/${courseSlug}`).expect(200);
    expect(plan.body.modules.map((m: { lessons: { slug: string }[] }) => m.lessons.map((l) => l.slug))).toEqual([['l0'], ['l2', 'l1', 'l3']]);

    // Le relais recalcule la progression des inscrits : 1 leçon sur 4.
    await app.get(OutboxRelay).drain();
    expect(await progress()).toBe(25);
  });

  it('causes de diagnostic : simulation sur les cas de référence avant publication', async () => {
    const author = await author_();
    const reviewer = await as(['reviewer']);

    // Base de démo intacte : chaque cas de référence trouve sa cause en tête.
    const same = await author(http().post('/api/v1/editorial/revisions').send({ kind: 'diagnostic_cause', from: 'psu_failure' })).expect(201);
    try {
      const baseline = await author(http().get(`/api/v1/editorial/revisions/${same.body.id}/simulation`)).expect(200);
      expect(baseline.body.cases.length).toBeGreaterThanOrEqual(6);
      expect(baseline.body.cases.filter((c: { before: { expectedRank: number } }) => c.before.expectedRank !== 1)).toEqual([]);
      expect(baseline.body.regressions).toBe(0);

      // Gonfler la probabilité de l'alimentation fait perdre la tête à la surchauffe : régression visible.
      const inflated: CauseContent = { ...same.body.content, prior: 0.95 };
      await author(http().put(`/api/v1/editorial/revisions/${same.body.id}`).send(inflated)).expect(200);
      const sim = await author(http().get(`/api/v1/editorial/revisions/${same.body.id}/simulation`)).expect(200);
      expect(sim.body.regressions).toBeGreaterThan(0);
      const lost = sim.body.cases.find((c: { regression: boolean }) => c.regression);
      expect(lost).toMatchObject({ before: { expectedRank: 1 }, after: { top: 'psu_failure' } });

      // Approuver une régression exige une justification.
      await author(http().post(`/api/v1/editorial/revisions/${same.body.id}/submit`)).expect(200);
      const blocked = await reviewer(http().post(`/api/v1/editorial/revisions/${same.body.id}/review`).send({ decision: 'approve' })).expect(422);
      expect(blocked.body.message).toContain('expliquez pourquoi');
    } finally {
      await author(http().post(`/api/v1/editorial/revisions/${same.body.id}/withdraw`)).expect(200);
    }
  });

  it('une nouvelle cause et un nouveau symptôme publiés sont aussitôt utilisés par le moteur', async () => {
    const author = await author_();
    const reviewer = await as(['reviewer']);
    const cause: CauseContent = {
      code: causeCode, label: 'Cause de test', platform: 'windows', prior: 0.3,
      explanation: 'Une cause inventée pour le test.',
      actionPlan: [
        { step: 'Observer', why: 'Comprendre avant d’agir', risk: 'none', commandSlug: 'windows-sfc' },
        { step: 'Corriger', why: 'Une fois la cause confirmée', risk: 'medium', commandSlug: null },
      ],
      rules: [{ symptom: symptomCode, likelihood: 0.9, rationale: 'Symptôme typique de la cause de test.' }],
      evidencePatterns: [{ name: `Motif ${stamp}`, source: 'windows_event', pattern: `ZORGLUB-${stamp}`, boost: 2 }],
      newSymptoms: [{ code: symptomCode, label: 'Clignote en zorglub', synonyms: [`zorglub ${stamp}`] }],
    };
    await publish(author, reviewer, 'diagnostic_cause', cause);

    const res = await http().post('/api/v1/diagnostic/analyze').send({ platform: 'windows', description: `mon écran fait zorglub ${stamp}` }).expect(201);
    expect(res.body.detectedSymptoms).toEqual([expect.objectContaining({ code: symptomCode })]);
    expect(res.body.hypotheses[0]).toMatchObject({ cause: causeCode, label: 'Cause de test' });
  });

  async function author_() {
    return as(['author']);
  }
});
