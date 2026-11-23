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
