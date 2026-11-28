import type { ContentCache } from './cache';

type Fetch = typeof fetch;

export class NotFoundError extends Error {}
export class SignInRequiredError extends Error {}
/** Erreur métier renvoyée par l'API (409 leçon verrouillée, 402 offre insuffisante…). */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export class OfflineError extends Error {}

export interface ApiResult<T> {
  data: T;
  /** Renseigné quand la réponse vient du stockage local, faute de réseau. */
  offlineSince: string | null;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Jeton d'accès courant (null si déconnecté) ; force=true après un 401. */
  accessToken: (options?: { force?: boolean }) => Promise<string | null>;
  cache: ContentCache;
  http?: Fetch;
  timeoutMs?: number;
}

export class ApiClient {
  private readonly http: Fetch;
  constructor(private readonly options: ApiClientOptions) {
    this.http = options.http ?? fetch;
  }

  async get<T>(path: string): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await this.send(path, 'GET');
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      const cached = await this.options.cache.read<T>(path);
      if (cached) return { data: cached.data, offlineSince: cached.savedAt };
      throw e;
    }
    const data = (await this.read(res, path)) as T;
    await this.options.cache.write(path, data);
    return { data, offlineSince: null };
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.send(path, 'POST', body);
    return (await this.read(res, path)) as T;
  }

  private async send(path: string, method: string, body?: unknown, retried = false): Promise<Response> {
    const token = await this.options.accessToken(retried ? { force: true } : undefined).catch(() => null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await this.http(`${this.options.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new OfflineError('Pas de connexion à SysMaster.');
    } finally {
      clearTimeout(timer);
    }
    // Jeton refusé (expiré entre-temps, clés tournées) : un seul nouvel essai avec un jeton rafraîchi.
    if (res.status === 401 && token && !retried) return this.send(path, method, body, true);
    return res;
  }

  private async read(res: Response, path: string): Promise<unknown> {
    if (res.ok) return res.status === 204 ? null : res.json();
    if (res.status === 401) throw new SignInRequiredError('Connectez-vous pour continuer.');
    if (res.status === 404) throw new NotFoundError(`Introuvable : ${path}`);
    let message = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    } catch { /* corps non JSON */ }
    throw new ApiError(res.status, message);
  }
}

/** Les recommandations du tableau de bord pointent vers des pages web : leur équivalent dans l'application. */
export function appRouteFor(href: string): string | null {
  const m = /^\/(parcours|cours|commandes)(\/[^?#]*)?$/.exec(href);
  if (!m) return null;
  if (m[1] === 'parcours' && !m[2]) return '/academie';
  return href;
}
