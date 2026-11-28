/**
 * Contenus consultés hors connexion (« hors ligne partiel », docs/05 Phase 6).
 * Seuls les contenus pédagogiques sont gardés (parcours, cours, leçons, fiches commandes) ; jamais
 * le profil, le tableau de bord ni les jetons. Tout est effacé à la déconnexion.
 */
export interface CacheEntry<T = unknown> {
  savedAt: string;
  data: T;
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  clear(): Promise<void>;
}

const CACHEABLE = [
  /^\/learning\/paths(\/[^/?]+)?$/,
  /^\/learning\/courses\/[^/?]+$/,
  /^\/learning\/courses\/[^/?]+\/lessons\/[^/?]+$/,
  /^\/kb\/commands\/[^/?]+$/,
];

export function isCacheable(path: string): boolean {
  return CACHEABLE.some((re) => re.test(path));
}

/** Nom de fichier stable et sûr pour un chemin d'API (FNV-1a 32 bits, plus la longueur). */
export function cacheKey(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, '0')}-${path.length}`;
}

export class ContentCache {
  constructor(private readonly store: KeyValueStore, private readonly now: () => Date = () => new Date()) {}

  async read<T>(path: string): Promise<CacheEntry<T> | null> {
    const raw = await this.store.get(cacheKey(path)).catch(() => null);
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as CacheEntry<T> & { path?: string };
      return entry.path === path ? { savedAt: entry.savedAt, data: entry.data } : null;
    } catch {
      return null;
    }
  }

  async write(path: string, data: unknown): Promise<void> {
    if (!isCacheable(path)) return;
    await this.store.set(cacheKey(path), JSON.stringify({ path, savedAt: this.now().toISOString(), data })).catch(() => undefined);
  }

  clear(): Promise<void> {
    return this.store.clear();
  }
}

/** Magasin en mémoire, pour les tests et en repli si le stockage du téléphone est indisponible. */
export class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async set(key: string, value: string) { this.map.set(key, value); }
  async clear() { this.map.clear(); }
}
