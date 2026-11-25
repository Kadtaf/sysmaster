import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const CODE = 'LINUX-ADMIN';

describeDb('Certifications : examen, certificat signé, vérification, révocation (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  /** Utilisateur provisionné ; `labs` : réussit les labs exigés. */
  async function learner(labs: boolean, roles = ['learner']) {
    const identity = newIdentity();
    const token = await tokenFor(identity, roles);
    const as = (r: request.Test) => r.auth(token, { type: 'bearer' });
    await as(http().get('/api/v1/me')).expect(200);
    const id = (await pool.query(`SELECT id FROM iam.users WHERE idp_subject = $1`, [identity.sub])).rows[0].id as string;
    users.push(id);
    if (labs) {
      await pool.query(
        `INSERT INTO labs.instances (template_id, user_id, status, score, expires_at, ended_at)
         SELECT t.id, $1, 'solved', 100, now(), now() FROM labs.lab_templates t
          JOIN assessment.certifications c ON t.slug = ANY(c.required_labs) WHERE c.code = $2`,
        [id, CODE],
      );
    }
    return { id, as };
  }

  async function correctAnswers(questionIds: string[]) {
    const { rows } = await pool.query(`SELECT id, answer FROM assessment.questions WHERE id = ANY($1::uuid[])`, [questionIds]);
    // Certaines questions anciennes stockent une réponse unique en chaîne.
    return Object.fromEntries(rows.map((r) => [r.id, Array.isArray(r.answer) ? r.answer : [r.answer]]));
  }

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM assessment.certificates WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM assessment.exam_sessions WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM labs.instances WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool?.end();
    await app?.close();
  });

  it('un visiteur voit les certifications et leurs conditions, sans situation personnelle', async () => {
    const res = await http().get('/api/v1/certifications').expect(200);
    const linux = res.body.find((c: { code: string }) => c.code === CODE);
    expect(linux).toMatchObject({ me: null, exam: { questionCount: 10, available: true } });
    expect(linux.requirements.filter((r: { kind: string }) => r.kind === 'lab')).toHaveLength(2);
    // Banques Réseau, Docker et Cyber (seed 012) : examens ouverts.
    for (const code of ['NET-SPEC', 'DOCKER-SPEC', 'CYBER-SPEC']) {
      expect(res.body.find((c: { code: string }) => c.code === code)).toMatchObject({ exam: { questionCount: 15, available: true } });
    }
    expect(res.body.find((c: { code: string }) => c.code === 'WIN-TECH')).toMatchObject({ exam: { questionCount: 15, available: true } });
    expect(res.body.find((c: { code: string }) => c.code === 'WIN-ADMIN')).toMatchObject({ exam: { questionCount: 20, available: true } });
    // Linux Server Expert ne tire plus dans la banque de Linux Administrator.
    expect(res.body.find((c: { code: string }) => c.code === 'LINUX-EXPERT')).toMatchObject({ exam: { available: false } });
  });

  it('Windows Technician ne tire que les niveaux du poste de travail', async () => {
    const u = await learner(false);
    const exam = await u.as(http().post('/api/v1/certifications/WIN-TECH/exam')).expect(201);
    expect(exam.body.questions).toHaveLength(15);
    const ids = exam.body.questions.map((q: { id: string }) => q.id);
    const { rows } = await pool.query(`SELECT DISTINCT difficulty::text AS d FROM assessment.questions WHERE id = ANY($1::uuid[])`, [ids]);
    expect(rows.map((r) => r.d).filter((d) => !['beginner', 'intermediate'].includes(d))).toEqual([]);
  });

  it('examen refusé tant que les labs ne sont pas réussis, avec les raisons', async () => {
    const u = await learner(false);
    const res = await u.as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(403);
    expect(res.body.reasons.join(' ')).toContain('Lab pratique à réussir');
  });

  it('réussite : certificat signé, vérifiable publiquement, révocable par un administrateur', async () => {
    const u = await learner(true);
    const exam = await u.as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(201);
    expect(exam.body.questions).toHaveLength(10);
    expect(JSON.stringify(exam.body)).not.toContain('"answer"');
    // Reprise : même tirage.
    const again = await u.as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(201);
    expect(again.body.id).toBe(exam.body.id);

    const ids = exam.body.questions.map((q: { id: string }) => q.id);
    const result = await u.as(http().post(`/api/v1/exam-sessions/${exam.body.id}/submit`).send({ answers: await correctAnswers(ids), integrity: { tabSwitches: 2 } })).expect(200);
    expect(result.body).toMatchObject({ score: 100, passed: true, late: false, nextAttemptAt: null });
    const serial = result.body.certificate.serial as string;
    expect(serial).toMatch(/^SM-\d{4}-LINADM-[2-9A-Z]{6}$/);
    await u.as(http().post(`/api/v1/exam-sessions/${exam.body.id}/submit`).send({ answers: {} })).expect(410);

    const verified = await http().get(`/api/v1/certificates/${serial.toLowerCase()}`).expect(200);
    expect(verified.body).toMatchObject({ serial, holderName: 'Test Utilisateur', status: 'valid', signatureValid: true, certification: { code: CODE } });
    const session = await pool.query(`SELECT integrity FROM assessment.exam_sessions WHERE id = $1`, [exam.body.id]);
    expect(session.rows[0].integrity).toEqual({ tabSwitches: 2, pastes: 0 });
    const events = await pool.query(`SELECT count(*)::int AS n FROM platform.outbox_events WHERE type = 'assessment.certificate.issued.v1' AND payload->>'serial' = $1`, [serial]);
    expect(events.rows[0].n).toBe(1);

    // Un nom modifié en base ne passe plus la vérification.
    await pool.query(`UPDATE assessment.certificates SET holder_name = 'Quelqu’un d’autre' WHERE serial = $1`, [serial]);
    expect((await http().get(`/api/v1/certificates/${serial}`).expect(200)).body.signatureValid).toBe(false);
    await pool.query(`UPDATE assessment.certificates SET holder_name = 'Test Utilisateur' WHERE serial = $1`, [serial]);

    const mine = await u.as(http().get(`/api/v1/certifications/${CODE}`)).expect(200);
    expect(mine.body.me).toMatchObject({ eligible: false, certificate: { serial, status: 'valid' } });
    expect((await u.as(http().get('/api/v1/certificates/mine')).expect(200)).body[0].serial).toBe(serial);

    await u.as(http().post(`/api/v1/certificates/${serial}/revoke`).send({ reason: 'Fraude constatée' })).expect(403);
    const admin = await learner(false, ['admin']);
    await admin.as(http().post(`/api/v1/certificates/${serial}/revoke`).send({ reason: 'Fraude constatée à l’examen' })).expect(200);
    const revoked = await http().get(`/api/v1/certificates/${serial}`).expect(200);
    expect(revoked.body).toMatchObject({ status: 'revoked', revokeReason: 'Fraude constatée à l’examen' });
    expect((await http().get('/api/v1/certificates/public-key').expect(200)).text).toContain('BEGIN PUBLIC KEY');
  });

  it('échec : pas de certificat, et un délai avant de repasser', async () => {
    const u = await learner(true);
    const exam = await u.as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(201);
    const result = await u.as(http().post(`/api/v1/exam-sessions/${exam.body.id}/submit`).send({ answers: {} })).expect(200);
    expect(result.body).toMatchObject({ score: 0, passed: false, certificate: null });
    expect(result.body.nextAttemptAt).toBeTruthy();
    const retry = await u.as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(403);
    expect(retry.body.reasons.join(' ')).toContain('nouvelle tentative');
  });

  it('remise après l’échéance : réponses ignorées', async () => {
    const u = await learner(true);
    const exam = await u.as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(201);
    await pool.query(`UPDATE assessment.exam_sessions SET deadline_at = now() - interval '5 minutes' WHERE id = $1`, [exam.body.id]);
    const ids = exam.body.questions.map((q: { id: string }) => q.id);
    const result = await u.as(http().post(`/api/v1/exam-sessions/${exam.body.id}/submit`).send({ answers: await correctAnswers(ids) })).expect(200);
    expect(result.body).toMatchObject({ late: true, passed: false, score: 0 });
  });

  it('l’examen d’un autre est introuvable', async () => {
    const a = await learner(true);
    const b = await learner(false);
    const exam = await a.as(http().post(`/api/v1/certifications/${CODE}/exam`)).expect(201);
    await b.as(http().post(`/api/v1/exam-sessions/${exam.body.id}/submit`).send({ answers: {} })).expect(404);
  });
});
