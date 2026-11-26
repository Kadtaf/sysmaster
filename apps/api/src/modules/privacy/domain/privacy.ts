/**
 * Règles RGPD de la plateforme (docs/03 §1, docs/08 §RGPD). Pur : seules les constantes partagées
 * avec la politique de confidentialité viennent des contrats.
 */

import { ERASURE_GRACE_DAYS } from '@sysmaster/contracts';

export { ERASURE_GRACE_DAYS, RETENTION_DAYS } from '@sysmaster/contracts';

/** Phrase à saisir pour confirmer la demande : on ne supprime pas un compte sur un clic distrait. */
export const ERASURE_CONFIRMATION = 'SUPPRIMER';

export type ErasureState =
  | { status: 'none' }
  | { status: 'scheduled'; requestedAt: Date; dueAt: Date }
  | { status: 'erased' };

export function erasureDueAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ERASURE_GRACE_DAYS * 86_400_000);
}

/** Pourquoi la demande d'effacement est refusée, ou null. */
export function erasureRequestBlocker(state: ErasureState, confirmation: string | undefined): string | null {
  if (state.status === 'scheduled') return 'Une demande de suppression est déjà en cours.';
  if (state.status === 'erased') return 'Ce compte est déjà supprimé.';
  if ((confirmation ?? '').trim() !== ERASURE_CONFIRMATION) {
    return `Pour confirmer, saisissez « ${ERASURE_CONFIRMATION} ».`;
  }
  return null;
}

export function canCancelErasure(state: ErasureState, now: Date): boolean {
  return state.status === 'scheduled' && now < state.dueAt;
}

export function isDue(state: ErasureState, now: Date): boolean {
  return state.status === 'scheduled' && now >= state.dueAt;
}

/** Date avant laquelle une donnée soumise à `days` jours de conservation doit être purgée. */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Adresse factice et unique d'un compte anonymisé : la contrainte d'unicité reste satisfaite. */
export function anonymizedEmail(userId: string): string {
  return `supprime-${userId}@invalid`;
}

export const ANONYMIZED_NAME = 'Compte supprimé';
