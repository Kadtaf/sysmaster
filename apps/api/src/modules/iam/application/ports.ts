import { AuthenticatedUser, TokenClaims } from '../domain/identity';

/** Vérifie la signature, l'émetteur, l'audience et l'expiration d'un jeton d'accès. */
export abstract class TokenVerifier {
  /** @throws InvalidTokenError */
  abstract verify(token: string): Promise<TokenClaims>;
}

export class InvalidTokenError extends Error {}

export interface UserProfile extends AuthenticatedUser {
  locale: string;
  createdAt: string;
  entitlements: { feature: string; value: unknown; source: string }[];
}

export abstract class UserRepository {
  /**
   * Crée ou met à jour l'utilisateur correspondant au jeton (provisionnement « juste à temps »)
   * et synchronise ses rôles. Émet iam.user.registered.v1 (outbox) à la création.
   */
  abstract provision(claims: TokenClaims): Promise<AuthenticatedUser>;
  abstract getProfile(userId: string): Promise<UserProfile | null>;
  abstract list(limit: number): Promise<{ id: string; email: string; displayName: string; roles: string[]; createdAt: string }[]>;
}
