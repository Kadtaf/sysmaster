/**
 * Licences par siège (docs/03 §2.11). Pur : ni base, ni HTTP.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { LicenceState, OrganizationRole } from '@sysmaster/contracts';

/** Une invitation non acceptée expire, et libère alors le siège qu'elle réservait. */
export const INVITATION_TTL_DAYS = 14;

export function licenceState(startsAt: Date | null, endsAt: Date | null, now = new Date()): LicenceState {
  if (startsAt && startsAt > now) return 'not_started';
  if (!endsAt || endsAt <= now) return 'expired';
  return 'active';
}

/** Inviter, retirer, changer un rôle. */
export const canManage = (role: OrganizationRole) => role === 'org_owner' || role === 'org_admin';

/** Voir la progression des membres (formateurs compris), jamais leurs échanges privés. */
export const canViewProgress = (role: OrganizationRole) => canManage(role) || role === 'instructor';

/** Jeton d'invitation : 32 octets aléatoires ; seul son condensé est enregistré. */
export function newInvitationToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInvitationToken(token) };
}

export const hashInvitationToken = (token: string) => createHash('sha256').update(token).digest();

/** « a•••@exemple.fr » : la page d'invitation est publique, l'adresse ne doit pas s'y lire en entier. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

export function invitationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);
}

/** Pourquoi une invitation ne peut pas être acceptée, ou null. */
export function acceptBlocker(o: {
  state: 'pending' | 'accepted' | 'revoked' | 'expired';
  licence: LicenceState;
  invitedEmail: string;
  userEmail: string;
  emailVerified: boolean;
  alreadyMember: boolean;
}): string | null {
  if (o.state === 'accepted') return 'Cette invitation a déjà été utilisée.';
  if (o.state === 'revoked') return 'Cette invitation a été annulée.';
  if (o.state === 'expired') return 'Cette invitation a expiré : demandez-en une nouvelle.';
  if (o.licence !== 'active') return 'La licence de cette organisation n’est pas en cours.';
  if (o.alreadyMember) return 'Vous êtes déjà membre de cette organisation.';
  // Le lien ne se transmet pas : il vaut pour l'adresse invitée, vérifiée par Keycloak.
  if (!o.emailVerified || o.invitedEmail.toLowerCase() !== o.userEmail.toLowerCase()) {
    return 'Cette invitation est destinée à une autre adresse e-mail. Connectez-vous avec l’adresse invitée.';
  }
  return null;
}

export function invitationState(i: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()) {
  if (i.acceptedAt) return 'accepted' as const;
  if (i.revokedAt) return 'revoked' as const;
  if (i.expiresAt <= now) return 'expired' as const;
  return 'pending' as const;
}

/** CSV de progression (séparateur « ; » pour Excel en français), protégé contre l'injection de formules. */
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
