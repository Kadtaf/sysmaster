import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type {
  CertificateDto, CertificationDto, ExamResultDto, ExamSessionDto, ExamSubmissionInput,
} from '@sysmaster/contracts';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { canonical, certificateStatus, eligibility, expiry, isLate, serialFor } from '../domain/certification';
import { score } from '../domain/scoring';
import { CertificateSigner, CertificationRepository, CertificationRow, StoredCertificate, UserCertState } from './certification-ports';

/**
 * Certifications (docs/03 §2.7) : conditions (prérequis, labs pratiques, délai après un échec),
 * examen chronométré tiré au sort dans la banque relue, correction côté serveur, certificat signé
 * et vérifiable publiquement. Les réponses d'un examen ne sont jamais renvoyées : la banque reste utile.
 */
@Injectable()
export class CertificationService {
  constructor(
    private readonly repo: CertificationRepository,
    private readonly signer: CertificateSigner,
  ) {}

  async list(user: AuthenticatedUser | null): Promise<CertificationDto[]> {
    const [rows, state] = await Promise.all([this.repo.list(), user ? this.repo.userState(user.id) : null]);
    return rows.map((c) => this.toDto(c, state));
  }

  async get(code: string, user: AuthenticatedUser | null): Promise<CertificationDto> {
    const c = await this.repo.find(code);
    if (!c) throw new NotFoundException('Certification introuvable');
    return this.toDto(c, user ? await this.repo.userState(user.id) : null);
  }

  /** Ouvre l'examen, ou reprend la session en cours (même tirage, même échéance). */
  async start(user: AuthenticatedUser, code: string): Promise<ExamSessionDto> {
    const c = await this.repo.find(code);
    if (!c) throw new NotFoundException('Certification introuvable');
    const state = await this.repo.userState(user.id);
    const open = state.openSessions.get(code);
    if (open) {
      const s = await this.repo.session(open.id);
      if (s && !isLate(s.deadlineAt, new Date())) return this.sessionDto(s.id, c, s.startedAt, s.deadlineAt, s.questionIds);
      // Session abandonnée au-delà de l'échéance : close comme un échec, puis les règles habituelles s'appliquent.
      if (s) await this.repo.submit(s, { answers: {}, integrity: {}, score: 0, passed: false }, null);
      return this.start(user, code);
    }
    if (!this.signer.ready) throw new ServiceUnavailableException('Les certifications ne sont pas encore ouvertes sur cette plateforme.');
    const e = this.eligibilityFor(c, state);
    if (!e.eligible) throw new ForbiddenException({ message: 'Vous ne pouvez pas passer cet examen pour le moment.', reasons: e.reasons });
    const s = await this.repo.startSession(user.id, c);
    if (!s) throw new ConflictException('Un examen est déjà en cours pour cette certification.');
    return this.sessionDto(s.id, c, s.startedAt, s.deadlineAt, s.questionIds);
  }

  async submit(user: AuthenticatedUser, sessionId: string, input: ExamSubmissionInput): Promise<ExamResultDto> {
    const s = await this.repo.session(sessionId);
    if (!s || s.userId !== user.id) throw new NotFoundException('Examen introuvable');
    if (s.submittedAt) throw new GoneException('Cet examen a déjà été remis.');
    const c = (await this.repo.find(s.code))!;
    const now = new Date();
    const late = isLate(s.deadlineAt, now);
    // On ne corrige que les questions servies : une réponse à une autre question est ignorée.
    const served = new Set(s.questionIds);
    const answers = late ? {} : Object.fromEntries(Object.entries(input.answers).filter(([id]) => served.has(id)));
    const r = score(await this.repo.key(s.questionIds), answers, c.passScore);

    let certificate: StoredCertificate | null = null;
    let issued = null;
    if (r.passed) {
      const issuedAt = now;
      const expiresAt = expiry(issuedAt, c.validityMonths);
      const serial = serialFor(c.code, issuedAt, randomBytes(6));
      const holderName = user.displayName;
      issued = { serial, holderName, issuedAt, expiresAt, score: r.score, signature: this.signer.sign(canonical({ serial, code: c.code, holderName, issuedAt, expiresAt })) };
    }
    const closed = await this.repo.submit(s, { answers, integrity: { ...input.integrity }, score: r.score, passed: r.passed }, issued);
    if (!closed) throw new GoneException('Cet examen a déjà été remis.');
    if (issued) certificate = await this.repo.certificate(issued.serial);
    const nextAttemptAt = r.passed ? null : new Date(now.getTime() + c.retryAfterHours * 3_600_000).toISOString();
    return {
      score: r.score, passed: r.passed, correctCount: r.correctCount, total: r.total, passScore: c.passScore, late,
      certificate: certificate ? { serial: certificate.serial } : null, nextAttemptAt,
    };
  }

  async verify(serial: string): Promise<CertificateDto> {
    const c = await this.repo.certificate(serial.toUpperCase());
    if (!c) throw new NotFoundException('Aucun certificat ne porte ce numéro.');
    return this.certificateDto(c);
  }

  async mine(user: AuthenticatedUser): Promise<CertificateDto[]> {
    return (await this.repo.mine(user.id)).map((c) => this.certificateDto(c));
  }

  async revoke(serial: string, by: AuthenticatedUser, reason: string): Promise<CertificateDto> {
    if (!(await this.repo.revoke(serial.toUpperCase(), by.id, reason))) throw new NotFoundException('Certificat introuvable ou déjà révoqué.');
    return this.verify(serial);
  }

  publicKey(): string {
    const pem = this.signer.publicKeyPem();
    if (!pem) throw new ServiceUnavailableException('Aucune clé de signature configurée.');
    return pem;
  }

  private eligibilityFor(c: CertificationRow, state: UserCertState) {
    const now = new Date();
    return eligibility({
      now,
      bankSize: c.bankSize,
      questionCount: c.questionCount,
      labs: c.labs.map((l) => ({ ...l, solved: state.solvedLabs.has(l.slug) })),
      prerequisites: c.prerequisites.map((p) => {
        const held = state.certificates.get(p.code);
        return { ...p, held: !!held && certificateStatus(held, now) === 'valid' };
      }),
      current: state.certificates.get(c.code) ?? null,
      lastFailureAt: state.lastFailures.get(c.code) ?? null,
      retryAfterHours: c.retryAfterHours,
    });
  }

  private toDto(c: CertificationRow, state: UserCertState | null): CertificationDto {
    const now = new Date();
    const held = state?.certificates.get(c.code);
    const e = state ? this.eligibilityFor(c, state) : null;
    const open = state?.openSessions.get(c.code);
    return {
      code: c.code, title: c.title, description: c.description, level: c.level, validityMonths: c.validityMonths, priceCents: c.priceCents,
      exam: { questionCount: c.questionCount, timeLimitS: c.timeLimitS, passScore: c.passScore, retryAfterHours: c.retryAfterHours, available: this.signer.ready && c.bankSize >= c.questionCount },
      requirements: [
        ...c.prerequisites.map((p) => {
          const h = state?.certificates.get(p.code);
          return { kind: 'prerequisite' as const, ref: p.code, title: p.title, met: state ? !!h && certificateStatus(h, now) === 'valid' : null };
        }),
        ...c.labs.map((l) => ({ kind: 'lab' as const, ref: l.slug, title: l.title, met: state ? state.solvedLabs.has(l.slug) : null })),
      ],
      me: state && e ? {
        eligible: e.eligible && !open,
        reasons: e.reasons,
        nextAttemptAt: e.nextAttemptAt?.toISOString() ?? null,
        certificate: held ? { serial: held.serial, status: certificateStatus(held, now) } : null,
        openSession: open && !isLate(open.deadlineAt, now) ? { id: open.id, deadlineAt: open.deadlineAt.toISOString() } : null,
      } : null,
    };
  }

  private async sessionDto(id: string, c: CertificationRow, startedAt: Date, deadlineAt: Date, ids: string[]): Promise<ExamSessionDto> {
    return {
      id, certificationCode: c.code, certificationTitle: c.title, startedAt: startedAt.toISOString(), deadlineAt: deadlineAt.toISOString(),
      passScore: c.passScore, questions: await this.repo.questions(ids),
    };
  }

  private certificateDto(c: StoredCertificate): CertificateDto {
    const payload = canonical({ serial: c.serial, code: c.code, holderName: c.holderName, issuedAt: c.issuedAt, expiresAt: c.expiresAt });
    return {
      serial: c.serial, holderName: c.holderName, certification: { code: c.code, title: c.title, level: c.level },
      issuedAt: c.issuedAt.toISOString(), expiresAt: c.expiresAt?.toISOString() ?? null,
      status: certificateStatus(c, new Date()), revokedAt: c.revokedAt?.toISOString() ?? null, revokeReason: c.revokeReason,
      signatureValid: this.signer.verify(payload, c.signature),
    };
  }
}
