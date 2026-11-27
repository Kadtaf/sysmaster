import { Logger } from '@nestjs/common';
import { IdentityAdmin } from '../application/ports';

/**
 * Supprime le compte Keycloak d'une personne qui a demandé l'effacement de ses données.
 *
 * Il faut un client « confidentiel » avec un compte de service portant le rôle realm-management
 * `manage-users` (docs/08 §RGPD) : KEYCLOAK_ADMIN_CLIENT_ID / KEYCLOAK_ADMIN_CLIENT_SECRET.
 * Sans eux, rien n'est appelé : le registre des effacements indique `idp_deleted = false` et un
 * administrateur supprime le compte à la main.
 */
export class KeycloakAdmin extends IdentityAdmin {
  private readonly logger = new Logger(KeycloakAdmin.name);

  constructor(
    private readonly config: { issuer: string; clientId: string; clientSecret: string } | null,
    private readonly http: typeof fetch = fetch,
  ) {
    super();
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): KeycloakAdmin {
    const issuer = env.OIDC_INTERNAL_ISSUER ?? env.OIDC_ISSUER;
    const clientId = env.KEYCLOAK_ADMIN_CLIENT_ID;
    const clientSecret = env.KEYCLOAK_ADMIN_CLIENT_SECRET;
    return new KeycloakAdmin(issuer && clientId && clientSecret ? { issuer, clientId, clientSecret } : null);
  }

  /** http://hote/realms/<royaume> → { base: http://hote, realm }. */
  static split(issuer: string): { base: string; realm: string } {
    const m = /^(.*)\/realms\/([^/]+)\/?$/.exec(issuer);
    if (!m) throw new Error(`Émetteur OIDC inattendu : ${issuer}`);
    return { base: m[1], realm: m[2] };
  }

  async deleteUser(subject: string): Promise<boolean> {
    if (!this.config) {
      this.logger.warn('KEYCLOAK_ADMIN_CLIENT_ID absent : compte Keycloak à supprimer à la main.');
      return false;
    }
    if (!/^[0-9a-f-]{36}$/i.test(subject)) throw new Error('Identifiant Keycloak invalide');
    const { base, realm } = KeycloakAdmin.split(this.config.issuer);
    const token = await this.http(`${this.config.issuer.replace(/\/$/, '')}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.config.clientId, client_secret: this.config.clientSecret }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!token.ok) throw new Error(`jeton d'administration refusé (${token.status})`);
    const { access_token } = (await token.json()) as { access_token: string };
    const res = await this.http(`${base}/admin/realms/${encodeURIComponent(realm)}/users/${subject}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    // 404 : déjà supprimé (relance après une panne) — l'objectif est atteint.
    if (res.status === 204 || res.status === 404) return true;
    throw new Error(`suppression refusée (${res.status})`);
  }
}
