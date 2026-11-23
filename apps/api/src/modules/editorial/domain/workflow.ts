import type { ContentIssue, RevisionStatus } from '@sysmaster/contracts';
import { hasAnyRole, type AuthenticatedUser } from '../../iam/domain/identity';

/**
 * Workflow éditorial commun à tous les types de contenu : brouillon → relecture par une autre
 * personne → publication. Pur : aucune base, aucun framework.
 */

export class EditorialError extends Error {
  constructor(
    readonly code: 'forbidden' | 'invalid_state' | 'incomplete' | 'own_revision',
    message: string,
    readonly issues: ContentIssue[] = [],
  ) {
    super(message);
  }
}

export interface RevisionState {
  status: RevisionStatus;
  authorId: string;
}

type User = Pick<AuthenticatedUser, 'id' | 'roles'>;

const isEditor = (u: User) => hasAnyRole(u, ['author', 'admin']);
const isReviewer = (u: User) => hasAnyRole(u, ['reviewer', 'admin']);
const isOpen = (s: RevisionStatus) => s === 'draft' || s === 'changes_requested';

export function canCreate(user: User): boolean {
  return isEditor(user);
}

export function permissions(r: RevisionState, user: User) {
  const own = r.authorId === user.id;
  return {
    edit: own && isOpen(r.status),
    submit: own && isOpen(r.status),
    // Quatre yeux : personne, pas même un administrateur, n'approuve sa propre révision.
    review: !own && isReviewer(user) && r.status === 'in_review',
    withdraw: (own || hasAnyRole(user, ['admin'])) && (isOpen(r.status) || r.status === 'in_review'),
  };
}

/** Qui peut lire une révision : son auteur, les relecteurs et les administrateurs. */
export function canRead(r: RevisionState, user: User): boolean {
  return r.authorId === user.id || isReviewer(user);
}

export function assertCan(allowed: boolean, r: RevisionState, user: User, action: string): void {
  if (allowed) return;
  if (action === 'review' && r.authorId === user.id) {
    throw new EditorialError('own_revision', 'Vous ne pouvez pas relire votre propre révision : un second regard est la raison d’être de la relecture.');
  }
  if (!canRead(r, user) || (action === 'review' && !isReviewer(user))) {
    throw new EditorialError('forbidden', 'Action réservée à l’auteur de la révision ou aux relecteurs.');
  }
  throw new EditorialError('invalid_state', `Action impossible : la révision est à l’état « ${r.status} ».`);
}

