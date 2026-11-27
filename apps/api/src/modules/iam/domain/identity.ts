/**
 * Identité applicative. Keycloak authentifie ; l'application connaît l'utilisateur par son profil
 * (iam.users) et ses rôles, synchronisés depuis le jeton à chaque connexion.
 */
export const GLOBAL_ROLES = ['learner', 'mentor', 'author', 'reviewer', 'moderator', 'support', 'admin', 'super_admin'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** Revendications utiles d'un jeton d'accès déjà vérifié. */
export interface TokenClaims {
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  locale: string | null;
  roles: GlobalRole[];
}

export interface AuthenticatedUser {
  id: string;
  subject: string;
  email: string;
  displayName: string;
  roles: GlobalRole[];
  /** Suppression RGPD programmée : le cache d'authentification ne doit pas survivre à cette date. */
  deletionDueAt?: Date | null;
}

/** Ne conserve que les rôles connus de l'application : un rôle Keycloak inconnu n'ouvre aucun droit. */
export function knownRoles(raw: unknown): GlobalRole[] {
  if (!Array.isArray(raw)) return [];
  return GLOBAL_ROLES.filter((r) => raw.includes(r));
}

/** super_admin hérite de tous les droits d'admin. */
export function hasAnyRole(user: Pick<AuthenticatedUser, 'roles'>, required: readonly GlobalRole[]): boolean {
  if (required.length === 0) return true;
  if (user.roles.includes('super_admin')) return true;
  return required.some((r) => user.roles.includes(r));
}
