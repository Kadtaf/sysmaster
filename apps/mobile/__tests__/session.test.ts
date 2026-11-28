import { KeycloakEndpoint } from '../src/lib/auth/keycloak';
import { REFRESH_TOKEN_KEY, SessionExpiredError, SessionManager, type SecretStore, type TokenEndpoint } from '../src/lib/auth/session';

function memoryStore(initial: Record<string, string> = {}): SecretStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => { data[k] = v; },
    delete: async (k) => { delete data[k]; },
  };
}

const NOW = 1_000_000;

describe('SessionManager', () => {
  it('ne garde que le jeton de rafraîchissement dans le trousseau', async () => {
    const store = memoryStore();
    const s = new SessionManager(store, { refresh: jest.fn(), logout: jest.fn() }, () => NOW);
    await s.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW + 300_000 });
    expect(store.data).toEqual({ [REFRESH_TOKEN_KEY]: 'r1' });
    await expect(s.accessToken()).resolves.toBe('a1');
  });

  it('un seul rafraîchissement pour des appels simultanés, et le jeton tourné est enregistré', async () => {
    const store = memoryStore();
    let release!: () => void;
    const refresh = jest.fn(() => new Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>((resolve) => {
      release = () => resolve({ accessToken: 'a2', refreshToken: 'r2', expiresAt: NOW + 300_000 });
    }));
    const s = new SessionManager(store, { refresh, logout: jest.fn() }, () => NOW);
    await s.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW + 10_000 }); // expire dans moins de 30 s
    const calls = [s.accessToken(), s.accessToken(), s.accessToken({ force: true })];
    release();
    await expect(Promise.all(calls)).resolves.toEqual(['a2', 'a2', 'a2']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('r1');
    expect(store.data[REFRESH_TOKEN_KEY]).toBe('r2');
  });

  it('jeton refusé par Keycloak : la session est effacée et l’écoute prévenue', async () => {
    const store = memoryStore({ [REFRESH_TOKEN_KEY]: 'vieux' });
    const endpoint: TokenEndpoint = { refresh: jest.fn().mockRejectedValue(new SessionExpiredError()), logout: jest.fn() };
    const s = new SessionManager(store, endpoint, () => NOW);
    const changes: boolean[] = [];
    s.onChange((v) => changes.push(v));
    await expect(s.restore()).resolves.toBe(false);
    expect(store.data).toEqual({});
    expect(s.signedIn).toBe(false);
    expect(changes).toEqual([false]);
  });

  it('sans réseau au démarrage, la session est gardée pour plus tard', async () => {
    const store = memoryStore({ [REFRESH_TOKEN_KEY]: 'r1' });
    const s = new SessionManager(store, { refresh: jest.fn().mockRejectedValue(new TypeError('Network request failed')), logout: jest.fn() }, () => NOW);
    await expect(s.restore()).resolves.toBe(true);
    expect(store.data[REFRESH_TOKEN_KEY]).toBe('r1');
  });

  it('la déconnexion ferme la session Keycloak et vide l’appareil, même hors ligne', async () => {
    const store = memoryStore();
    const logout = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const s = new SessionManager(store, { refresh: jest.fn(), logout }, () => NOW);
    await s.setTokens({ accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW + 300_000 });
    await s.signOut();
    expect(logout).toHaveBeenCalledWith('r1');
    expect(store.data).toEqual({});
    await expect(s.accessToken()).resolves.toBeNull();
  });
});

describe('KeycloakEndpoint', () => {
  const issuer = 'https://auth.test/realms/sysmaster';

  it('rafraîchit en client public (aucun secret) et calcule l’expiration', async () => {
    const http = jest.fn(async () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 300 }), { status: 200 }));
    const k = new KeycloakEndpoint(issuer, 'sysmaster-mobile', http as unknown as typeof fetch, () => NOW);
    await expect(k.refresh('r0')).resolves.toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: NOW + 300_000 });
    const [url, init] = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${issuer}/protocol/openid-connect/token`);
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({ client_id: 'sysmaster-mobile', grant_type: 'refresh_token', refresh_token: 'r0' });
  });

  it('invalid_grant devient SessionExpiredError, une panne serveur reste une erreur ordinaire', async () => {
    const http = jest.fn()
      .mockResolvedValueOnce(new Response('{"error":"invalid_grant"}', { status: 400 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    const k = new KeycloakEndpoint(issuer, 'sysmaster-mobile', http as unknown as typeof fetch);
    await expect(k.refresh('r')).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(k.refresh('r')).rejects.not.toBeInstanceOf(SessionExpiredError);
  });

  it('la déconnexion appelle le point de fin de session', async () => {
    const http = jest.fn(async () => new Response(null, { status: 204 }));
    await new KeycloakEndpoint(issuer, 'sysmaster-mobile', http as unknown as typeof fetch).logout('r');
    expect((http.mock.calls[0] as unknown as [string])[0]).toBe(`${issuer}/protocol/openid-connect/logout`);
  });
});
