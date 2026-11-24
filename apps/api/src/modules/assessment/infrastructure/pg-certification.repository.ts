import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database.module';
import {
  CertificationRepository, CertificationRow, ExamSession, NewCertificate, StoredCertificate, UserCertState,
} from '../application/certification-ports';
import type { KeyedQuestion } from '../domain/scoring';

const BANK = `x.reviewed AND x.type IN ('single', 'multiple') AND x.platform = ANY(c.exam_platforms)`;

const CERT_SELECT = `
  SELECT k.id, k.serial, k.certification_code AS code, c.title, c.level::text AS level, k.user_id, k.holder_name,
         k.issued_at, k.expires_at, k.revoked_at, k.revoke_reason, k.signature
    FROM assessment.certificates k JOIN assessment.certifications c ON c.code = k.certification_code`;

function toCertificate(r: Record<string, any>): StoredCertificate {
  return {
    id: r.id, serial: r.serial, code: r.code, title: r.title, level: r.level, userId: r.user_id, holderName: r.holder_name,
    issuedAt: r.issued_at, expiresAt: r.expires_at, revokedAt: r.revoked_at, revokeReason: r.revoke_reason, signature: r.signature,
  };
}

function toSession(r: Record<string, any>): ExamSession {
  return {
    id: r.id, code: r.certification_code, userId: r.user_id, questionIds: r.question_ids,
    startedAt: r.started_at, deadlineAt: r.deadline_at, submittedAt: r.submitted_at,
  };
}

@Injectable()
export class PgCertificationRepository extends CertificationRepository {
  constructor(private readonly db: Database) {
    super();
  }

  private async rows(code?: string): Promise<CertificationRow[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT c.code, c.title, c.description, c.level::text AS level, c.validity_months, c.price_cents, c.exam_question_count,
              c.exam_time_limit_s, c.pass_score, c.retry_after_hours,
              (SELECT count(*)::int FROM assessment.questions x WHERE ${BANK}) AS bank_size,
              coalesce((SELECT json_agg(json_build_object('slug', s.slug, 'title', coalesce(t.title, s.slug)) ORDER BY s.n)
                          FROM unnest(c.required_labs) WITH ORDINALITY s(slug, n)
                          LEFT JOIN labs.lab_templates t ON t.slug = s.slug), '[]') AS labs,
              coalesce((SELECT json_agg(json_build_object('code', p.code, 'title', p.title) ORDER BY s.n)
                          FROM unnest(c.prerequisites) WITH ORDINALITY s(code, n)
                          JOIN assessment.certifications p ON p.code = s.code), '[]') AS prerequisites
         FROM assessment.certifications c
        WHERE $1::text IS NULL OR c.code = $1
        ORDER BY array_position(ARRAY['beginner','intermediate','advanced','expert'], c.level::text), c.code`,
      [code ?? null],
    );
    return rows.map((r) => ({
      code: r.code, title: r.title, description: r.description, level: r.level, validityMonths: r.validity_months, priceCents: r.price_cents,
      questionCount: r.exam_question_count, timeLimitS: r.exam_time_limit_s, passScore: r.pass_score, retryAfterHours: r.retry_after_hours,
      bankSize: r.bank_size, labs: r.labs, prerequisites: r.prerequisites,
    }));
  }

  list(): Promise<CertificationRow[]> {
    return this.rows();
  }

  async find(code: string): Promise<CertificationRow | null> {
    return (await this.rows(code.toUpperCase()))[0] ?? null;
  }

  async userState(userId: string): Promise<UserCertState> {
    const [labs, certs, failures, open] = await Promise.all([
      this.db.query<{ slug: string }>(
        `SELECT DISTINCT t.slug FROM labs.instances i JOIN labs.lab_templates t ON t.id = i.template_id WHERE i.user_id = $1 AND i.status = 'solved'`,
        [userId],
      ),
      this.db.query<Record<string, any>>(`${CERT_SELECT} WHERE k.user_id = $1 ORDER BY k.issued_at`, [userId]),
      this.db.query<{ code: string; at: Date }>(
        `SELECT certification_code AS code, max(submitted_at) AS at FROM assessment.exam_sessions
          WHERE user_id = $1 AND submitted_at IS NOT NULL AND NOT passed GROUP BY certification_code`,
        [userId],
      ),
      this.db.query<{ id: string; code: string; deadline_at: Date }>(
        `SELECT id, certification_code AS code, deadline_at FROM assessment.exam_sessions WHERE user_id = $1 AND submitted_at IS NULL`,
        [userId],
      ),
    ]);
    return {
      solvedLabs: new Set(labs.rows.map((r) => r.slug)),
      // Le plus récent l'emporte (ORDER BY issued_at).
      certificates: new Map(certs.rows.map((r) => [r.code as string, toCertificate(r)])),
      lastFailures: new Map(failures.rows.map((r) => [r.code, r.at])),
      openSessions: new Map(open.rows.map((r) => [r.code, { id: r.id, deadlineAt: r.deadline_at }])),
    };
  }

  async startSession(userId: string, c: CertificationRow): Promise<ExamSession | null> {
    try {
      const { rows } = await this.db.query<Record<string, any>>(
        `INSERT INTO assessment.exam_sessions (certification_code, user_id, question_ids, deadline_at)
         SELECT c.code, $2, ARRAY(SELECT x.id FROM assessment.questions x WHERE ${BANK} ORDER BY random() LIMIT c.exam_question_count),
                now() + make_interval(secs => c.exam_time_limit_s)
           FROM assessment.certifications c WHERE c.code = $1
         RETURNING *`,
        [c.code, userId],
      );
      return rows[0] ? toSession(rows[0]) : null;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return null;
      throw err;
    }
  }

  async session(id: string): Promise<ExamSession | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await this.db.query<Record<string, any>>(`SELECT * FROM assessment.exam_sessions WHERE id = $1`, [id]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async questions(ids: string[]) {
    const { rows } = await this.db.query<{ id: string; type: 'single' | 'multiple'; promptMd: string; choices: { id: string; text: string }[] }>(
      `SELECT x.id, x.type, x.prompt_md AS "promptMd", x.choices
         FROM unnest($1::uuid[]) WITH ORDINALITY s(id, n) JOIN assessment.questions x ON x.id = s.id ORDER BY s.n`,
      [ids],
    );
    return rows;
  }

  async key(ids: string[]): Promise<KeyedQuestion[]> {
    const { rows } = await this.db.query<{ id: string; answer: string[]; explanation: string }>(
      `SELECT x.id, CASE jsonb_typeof(x.answer) WHEN 'array' THEN x.answer ELSE jsonb_build_array(x.answer) END AS answer, x.explanation
         FROM unnest($1::uuid[]) WITH ORDINALITY s(id, n) JOIN assessment.questions x ON x.id = s.id ORDER BY s.n`,
      [ids],
    );
    return rows;
  }

  submit(
    s: ExamSession,
    result: { answers: Record<string, string[]>; integrity: Record<string, number>; score: number; passed: boolean },
    cert: NewCertificate | null,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE assessment.exam_sessions SET submitted_at = now(), score = $2, passed = $3, answers = $4, integrity = $5
          WHERE id = $1 AND submitted_at IS NULL`,
        [s.id, result.score, result.passed, JSON.stringify(result.answers), JSON.stringify(result.integrity)],
      );
      if (rowCount !== 1) return false;
      if (cert) {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO assessment.certificates (serial, certification_code, user_id, holder_name, exam_session_id, score, issued_at, expires_at, signature)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [cert.serial, s.code, s.userId, cert.holderName, s.id, cert.score, cert.issuedAt, cert.expiresAt, cert.signature],
        );
        await tx.query(
          `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
           VALUES ('assessment.certificate', $1, 'assessment.certificate.issued.v1', $2)`,
          [rows[0].id, JSON.stringify({ certificateId: rows[0].id, serial: cert.serial, certificationCode: s.code, userId: s.userId, score: cert.score })],
        );
      }
      return true;
    });
  }

  async certificate(serial: string): Promise<StoredCertificate | null> {
    const { rows } = await this.db.query<Record<string, any>>(`${CERT_SELECT} WHERE k.serial = $1`, [serial]);
    return rows[0] ? toCertificate(rows[0]) : null;
  }

  async mine(userId: string): Promise<StoredCertificate[]> {
    const { rows } = await this.db.query<Record<string, any>>(`${CERT_SELECT} WHERE k.user_id = $1 ORDER BY k.issued_at DESC`, [userId]);
    return rows.map(toCertificate);
  }

  async revoke(serial: string, by: string, reason: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE assessment.certificates SET revoked_at = now(), revoke_reason = $3, revoked_by = $2 WHERE serial = $1 AND revoked_at IS NULL`,
      [serial, by, reason],
    );
    return rowCount === 1;
  }
}
