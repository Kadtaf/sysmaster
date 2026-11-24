import type { CertificateStatus } from '@sysmaster/contracts';

/**
 * Règles des certifications. Pur : aucune base, aucun framework.
 * Une certification = examen théorique tiré au sort + labs pratiques réussis + prérequis (docs/03 §2.7).
 */

/** Délai de grâce après l'échéance : la latence du réseau ne doit pas faire perdre un examen. */
export const GRACE_SECONDS = 60;

export interface Held {
  serial: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export function certificateStatus(c: Held, now: Date): CertificateStatus {
  if (c.revokedAt) return 'revoked';
  if (c.expiresAt && c.expiresAt <= now) return 'expired';
  return 'valid';
}

export interface EligibilityInput {
  now: Date;
  /** Questions relues disponibles pour cette certification, et combien l'examen en tire. */
  bankSize: number;
  questionCount: number;
  labs: { slug: string; title: string; solved: boolean }[];
  prerequisites: { code: string; title: string; held: boolean }[];
  /** Certificat déjà détenu pour cette certification. */
  current: Held | null;
  lastFailureAt: Date | null;
  retryAfterHours: number;
}

export function eligibility(i: EligibilityInput): { eligible: boolean; reasons: string[]; nextAttemptAt: Date | null } {
  const reasons: string[] = [];
  if (i.bankSize < i.questionCount) reasons.push('L’examen n’est pas encore ouvert : sa banque de questions relues est en cours de constitution.');
  if (i.current && certificateStatus(i.current, i.now) === 'valid') reasons.push('Vous détenez déjà cette certification, toujours valide.');
  for (const p of i.prerequisites) if (!p.held) reasons.push(`Prérequis : obtenez d’abord la certification « ${p.title} ».`);
  for (const l of i.labs) if (!l.solved) reasons.push(`Lab pratique à réussir : « ${l.title} ».`);
  let nextAttemptAt: Date | null = null;
  if (i.lastFailureAt) {
    const next = new Date(i.lastFailureAt.getTime() + i.retryAfterHours * 3_600_000);
    if (next > i.now) {
      nextAttemptAt = next;
      reasons.push(`Après un échec, une nouvelle tentative est possible à partir du ${next.toISOString().slice(0, 16).replace('T', ' à ')} (UTC) : prenez le temps de réviser.`);
    }
  }
  return { eligible: reasons.length === 0, reasons, nextAttemptAt };
}

export function isLate(deadlineAt: Date, now: Date): boolean {
  return now.getTime() > deadlineAt.getTime() + GRACE_SECONDS * 1000;
}

export function expiry(issuedAt: Date, validityMonths: number | null): Date | null {
  if (!validityMonths) return null;
  const d = new Date(issuedAt);
  d.setUTCMonth(d.getUTCMonth() + validityMonths);
  return d;
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans 0/O ni 1/I : lisible à la main

/** Numéro lisible : SM-2026-LINADM-7F3K9Q. `random` : 6 octets aléatoires. */
export function serialFor(code: string, issuedAt: Date, random: Uint8Array): string {
  const short = code.split('-').map((p) => p.slice(0, 3)).join('').slice(0, 8);
  const tail = [...random.slice(0, 6)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `SM-${issuedAt.getUTCFullYear()}-${short}-${tail}`;
}

/**
 * Contenu signé d'un certificat. Toute modification (nom, dates, certification) invalide la signature.
 * Version en tête : un changement de format futur ne rendra pas les anciens certificats invérifiables.
 */
export function canonical(c: { serial: string; code: string; holderName: string; issuedAt: Date; expiresAt: Date | null }): string {
  return ['SM-CERT-v1', c.serial, c.code, c.holderName, c.issuedAt.toISOString(), c.expiresAt?.toISOString() ?? ''].join('|');
}
