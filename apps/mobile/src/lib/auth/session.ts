/**
 * Session mobile. Le jeton d'accès (5 minutes) reste en mémoire ; seul le jeton de rafraîchissement est
 * gardé, dans le trousseau du téléphone (Keychain iOS, Keystore Android) via expo-secure-store.
 * Keycloak fait tourner le jeton de rafraîchissement à chaque usage (revokeRefreshToken) : un seul
 * rafraîchissement à la fois, et le nouveau jeton est enregistré avant d'être utilisé.
 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Instant d'expiration du jeton d'accès, en millisecondes. */
  expiresAt: number;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface TokenEndpoint {
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Ferme la session Keycloak (et donc l'authentification unique), pas seulement ce jeton. */
  logout(refreshToken: string): Promise<void>;
}

/** Le jeton de rafraîchissement n'est plus valable : il faut se reconnecter. */
export class SessionExpiredError extends Error {}

export const REFRESH_TOKEN_KEY = 'sysmaster.refresh-token';
const SKEW_MS = 30_000;

export class SessionManager {
  private tokens: TokenSet | null = null;
  private refreshing: Promise<TokenSet> | null = null;
  private listeners = new Set<(signedIn: boolean) => void>();

  constructor(
    private readonly store: SecretStore,
    private readonly endpoint: TokenEndpoint,
    private readonly now: () => number = Date.now,
  ) {}

  onChange(listener: (signedIn: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get signedIn(): boolean {
    return this.tokens !== null;
  }

  /** Au démarrage : reprend la session si un jeton de rafraîchissement est encore valable. */
  async restore(): Promise<boolean> {
    const refreshToken = await this.store.get(REFRESH_TOKEN_KEY).catch(() => null);
    if (!refreshToken) return false;
    this.tokens = { accessToken: '', refreshToken, expiresAt: 0 };
    try {
      await this.accessToken();
      return true;
    } catch (e) {
      if (e instanceof SessionExpiredError) return false;
      // Pas de réseau : on garde la session, le prochain appel réessaiera.
      return true;
    }
  }

  async setTokens(tokens: TokenSet): Promise<void> {
    if (tokens.refreshToken) await this.store.set(REFRESH_TOKEN_KEY, tokens.refreshToken);
    else await this.store.delete(REFRESH_TOKEN_KEY);
    const was = this.signedIn;
    this.tokens = tokens;
    if (!was) this.emit(true);
  }

  /** Jeton d'accès valable, rafraîchi si besoin ; null sans session. */
  async accessToken(options: { force?: boolean } = {}): Promise<string | null> {
    const t = this.tokens;
    if (!t) return null;
    if (!options.force && t.accessToken && t.expiresAt - SKEW_MS > this.now()) return t.accessToken;
    return (await this.refresh()).accessToken;
  }

  private refresh(): Promise<TokenSet> {
    if (this.refreshing) return this.refreshing;
    const current = this.tokens?.refreshToken;
    if (!current) {
      void this.clear();
      return Promise.reject(new SessionExpiredError('Session terminée.'));
    }
    this.refreshing = this.endpoint
      .refresh(current)
      .then(async (next) => {
        const tokens = { ...next, refreshToken: next.refreshToken ?? current };
        await this.setTokens(tokens);
        return tokens;
      })
      .catch(async (e: unknown) => {
        if (e instanceof SessionExpiredError) await this.clear();
        throw e;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  /** Déconnexion : la session Keycloak est fermée si le réseau le permet, l'appareil est toujours vidé. */
  async signOut(): Promise<void> {
    const refreshToken = this.tokens?.refreshToken ?? (await this.store.get(REFRESH_TOKEN_KEY).catch(() => null));
    if (refreshToken) await this.endpoint.logout(refreshToken).catch(() => undefined);
    await this.clear();
  }

  private async clear(): Promise<void> {
    const was = this.signedIn;
    this.tokens = null;
    await this.store.delete(REFRESH_TOKEN_KEY).catch(() => undefined);
    if (was) this.emit(false);
  }

  private emit(signedIn: boolean) {
    this.listeners.forEach((l) => l(signedIn));
  }
}
