import { SessionExpiredError, type TokenEndpoint, type TokenSet } from './session';

type Fetch = typeof fetch;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export function toTokenSet(body: TokenResponse, now: number): TokenSet {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: now + (body.expires_in ?? 60) * 1000,
  };
}

/** Points d'accès OpenID Connect de Keycloak pour un client public (aucun secret côté application). */
export class KeycloakEndpoint implements TokenEndpoint {
  constructor(
    private readonly issuer: string,
    private readonly clientId: string,
    private readonly http: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  get tokenUrl() { return `${this.issuer}/protocol/openid-connect/token`; }
  get logoutUrl() { return `${this.issuer}/protocol/openid-connect/logout`; }

  async refresh(refreshToken: string): Promise<TokenSet> {
    const res = await this.post(this.tokenUrl, { grant_type: 'refresh_token', refresh_token: refreshToken });
    if (res.status === 400 || res.status === 401) {
      // invalid_grant : jeton expiré, révoqué ou déjà utilisé. Toute autre erreur reste réessayable.
      throw new SessionExpiredError('Session expirée, reconnectez-vous.');
    }
    if (!res.ok) throw new Error(`Keycloak ${res.status}`);
    return toTokenSet((await res.json()) as TokenResponse, this.now());
  }

  async logout(refreshToken: string): Promise<void> {
    const res = await this.post(this.logoutUrl, { refresh_token: refreshToken });
    if (!res.ok && res.status !== 400) throw new Error(`Keycloak ${res.status}`);
  }

  private post(url: string, params: Record<string, string>) {
    return this.http(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, ...params }).toString(),
    });
  }
}
