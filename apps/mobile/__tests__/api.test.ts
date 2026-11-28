import { ApiClient, ApiError, appRouteFor, NotFoundError, OfflineError, SignInRequiredError } from '../src/lib/api';
import { ContentCache, MemoryStore, isCacheable } from '../src/lib/cache';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(responses: (Response | Error)[], token: string | null = 'jeton') {
  const store = new MemoryStore();
  const cache = new ContentCache(store, () => new Date('2026-11-28T10:00:00Z'));
  const calls: { url: string; init: RequestInit }[] = [];
  const http = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error('réponse manquante');
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const accessToken = jest.fn(async (o?: { force?: boolean }) => (token ? (o?.force ? `${token}-neuf` : token) : null));
  const api = new ApiClient({ baseUrl: 'https://api.test/api/v1', cache, http, accessToken });
  return { api, calls, accessToken, store };
}

describe('ApiClient', () => {
  it('envoie le jeton et enregistre les contenus pédagogiques', async () => {
    const { api, calls, store } = setup([json(200, [{ slug: 'linux' }])]);
    const r = await api.get('/learning/paths');
    expect(r).toEqual({ data: [{ slug: 'linux' }], offlineSince: null });
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer jeton');
    expect(store.map.size).toBe(1);
  });

  it('sans réseau, rend la dernière version enregistrée avec sa date', async () => {
    const { api } = setup([json(200, { slug: 'ls' }), new TypeError('Network request failed')]);
    await api.get('/kb/commands/ls');
    await expect(api.get('/kb/commands/ls')).resolves.toEqual({ data: { slug: 'ls' }, offlineSince: '2026-11-28T10:00:00.000Z' });
  });

  it('sans réseau ni copie locale, signale l’absence de connexion', async () => {
    const { api } = setup([new TypeError('Network request failed')]);
    await expect(api.get('/kb/commands/ls')).rejects.toBeInstanceOf(OfflineError);
  });

  it('ne garde jamais les données personnelles sur le téléphone', async () => {
    const { api, store } = setup([json(200, { gamification: {} }), json(200, { email: 'a@b.c' })]);
    await api.get('/me/dashboard');
    await api.get('/me');
    expect(store.map.size).toBe(0);
    expect(isCacheable('/me/dashboard')).toBe(false);
    expect(isCacheable('/kb/commands?q=ls')).toBe(false);
  });

  it('après un 401, réessaie une fois avec un jeton rafraîchi', async () => {
    const { api, calls, accessToken } = setup([json(401, {}), json(200, { ok: true })]);
    await expect(api.post('/learning/lessons/x/complete')).resolves.toEqual({ ok: true });
    expect(accessToken).toHaveBeenLastCalledWith({ force: true });
    expect((calls[1]?.init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-neuf');
  });

  it('un 401 persistant demande de se connecter ; 404 et erreurs métier sont typés', async () => {
    const { api } = setup([json(401, {}), json(401, {}), json(404, {}), json(409, { message: 'Leçon verrouillée' })]);
    await expect(api.get('/me/dashboard')).rejects.toBeInstanceOf(SignInRequiredError);
    await expect(api.get('/kb/commands/inconnue')).rejects.toBeInstanceOf(NotFoundError);
    await expect(api.post('/learning/lessons/x/complete')).rejects.toEqual(new ApiError(409, 'Leçon verrouillée'));
  });
});

describe('appRouteFor', () => {
  it('traduit les liens du tableau de bord en écrans de l’application', () => {
    expect(appRouteFor('/parcours')).toBe('/academie');
    expect(appRouteFor('/cours/linux-cli/navigation')).toBe('/cours/linux-cli/navigation');
    expect(appRouteFor('/labs/x')).toBeNull();
  });
});
