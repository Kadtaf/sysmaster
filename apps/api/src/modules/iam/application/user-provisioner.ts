import { Injectable } from '@nestjs/common';
import { AuthenticatedUser, TokenClaims } from '../domain/identity';
import { UserRepository } from './ports';

/**
 * Évite une écriture en base à chaque requête : un utilisateur déjà provisionné récemment
 * avec les mêmes rôles et le même profil est servi depuis la mémoire (60 s).
 * En multi-instance, chaque pod a son cache : sans conséquence, l'opération est idempotente.
 */
@Injectable()
export class UserProvisioner {
  static readonly TTL_MS = 60_000;
  private readonly cache = new Map<string, { key: string; user: AuthenticatedUser; at: number }>();

  constructor(private readonly users: UserRepository) {}

  async fromClaims(claims: TokenClaims, now = Date.now()): Promise<AuthenticatedUser> {
    const key = JSON.stringify([claims.email, claims.displayName, [...claims.roles].sort()]);
    const hit = this.cache.get(claims.subject);
    if (hit && hit.key === key && now - hit.at < UserProvisioner.TTL_MS) return hit.user;

    const user = await this.users.provision(claims);
    this.cache.set(claims.subject, { key, user, at: now });
    if (this.cache.size > 10_000) this.cache.delete(this.cache.keys().next().value!);
    return user;
  }
}
