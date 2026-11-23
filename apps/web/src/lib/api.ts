/**
 * Accès à l'API. Côté serveur on utilise l'URL interne (réseau Docker), côté navigateur l'URL publique.
 */
const serverBase = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const publicApiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiUnavailableError extends Error {}

export async function apiGet<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${serverBase}${path}`, { cache: 'no-store' });
  } catch {
    throw new ApiUnavailableError(`API injoignable (${serverBase})`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} sur ${path}`);
  return (await res.json()) as T;
}
