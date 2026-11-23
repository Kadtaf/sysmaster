/**
 * Accès à l'API. Côté serveur on utilise l'URL interne (réseau Docker), côté navigateur l'URL publique.
 */
const serverBase = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const publicApiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiUnavailableError extends Error {}

export async function apiGet<T>(path: string, accessToken?: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${serverBase}${path}`, {
      cache: 'no-store',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
  } catch {
    throw new ApiUnavailableError(`API injoignable (${serverBase})`);
  }
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`API ${res.status} sur ${path}`);
  return (await res.json()) as T;
}
