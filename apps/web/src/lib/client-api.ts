'use client';

import { publicApiBase } from '@/lib/api';

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(typeof body.message === 'string' ? body.message : `Erreur ${status}`);
  }
}

/** POST authentifié depuis le navigateur. */
export async function apiPost<T>(path: string, accessToken: string | undefined, body?: unknown): Promise<T> {
  const res = await fetch(`${publicApiBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

/** PUT authentifié depuis le navigateur (réponse 204 attendue). */
export async function apiPut(path: string, accessToken: string | undefined, body: unknown): Promise<void> {
  const res = await fetch(`${publicApiBase}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
}

/** Requête JSON authentifiée depuis le navigateur ; lève ApiError avec le corps de la réponse. */
export async function apiRequest<T>(method: 'POST' | 'PUT', path: string, accessToken: string | undefined, body?: unknown): Promise<T> {
  const res = await fetch(`${publicApiBase}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}
