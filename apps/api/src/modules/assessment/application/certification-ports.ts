import type { Difficulty } from '@sysmaster/contracts';
import type { KeyedQuestion } from '../domain/scoring';

export abstract class CertificateSigner {
  /** false si aucune clé n'est configurée : on n'ouvre alors aucun examen. */
  abstract readonly ready: boolean;
  abstract sign(payload: string): string;
  abstract verify(payload: string, signature: string): boolean;
  abstract publicKeyPem(): string;
}

export interface CertificationRow {
  code: string;
  title: string;
  description: string;
  level: Difficulty;
  validityMonths: number | null;
  priceCents: number;
  questionCount: number;
  timeLimitS: number;
  passScore: number;
  retryAfterHours: number;
  /** Questions relues (choix unique ou multiple) disponibles pour l'examen. */
  bankSize: number;
  labs: { slug: string; title: string }[];
  prerequisites: { code: string; title: string }[];
}

export interface StoredCertificate {
  id: string;
  serial: string;
  code: string;
  title: string;
  level: Difficulty;
  userId: string;
  holderName: string;
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  signature: string;
}

export interface UserCertState {
  solvedLabs: Set<string>;
  /** Derniers certificats de l'utilisateur, par code de certification. */
  certificates: Map<string, StoredCertificate>;
  /** Dernier échec, par code de certification. */
  lastFailures: Map<string, Date>;
  openSessions: Map<string, { id: string; deadlineAt: Date }>;
}

export interface ExamSession {
  id: string;
  code: string;
  userId: string;
  questionIds: string[];
  startedAt: Date;
  deadlineAt: Date;
  submittedAt: Date | null;
}

export interface NewCertificate {
  serial: string;
  holderName: string;
  issuedAt: Date;
  expiresAt: Date | null;
  signature: string;
  score: number;
}

export abstract class CertificationRepository {
  abstract list(): Promise<CertificationRow[]>;
  abstract find(code: string): Promise<CertificationRow | null>;
  abstract userState(userId: string): Promise<UserCertState>;
  /** Tire les questions au sort et ouvre la session ; null si une session est déjà ouverte (course). */
  abstract startSession(userId: string, c: CertificationRow): Promise<ExamSession | null>;
  abstract session(id: string): Promise<ExamSession | null>;
  /** Questions servies, sans les réponses, dans l'ordre du tirage. */
  abstract questions(ids: string[]): Promise<{ id: string; type: 'single' | 'multiple'; promptMd: string; choices: { id: string; text: string }[] }[]>;
  abstract key(ids: string[]): Promise<KeyedQuestion[]>;
  /**
   * Clôt la session (une seule fois) et, si le certificat est fourni, l'émet avec l'événement
   * assessment.certificate.issued.v1. false si la session était déjà close.
   */
  abstract submit(
    s: ExamSession,
    result: { answers: Record<string, string[]>; integrity: Record<string, number>; score: number; passed: boolean },
    certificate: NewCertificate | null,
  ): Promise<boolean>;
  abstract certificate(serial: string): Promise<StoredCertificate | null>;
  abstract mine(userId: string): Promise<StoredCertificate[]>;
  abstract revoke(serial: string, by: string, reason: string): Promise<boolean>;
}
