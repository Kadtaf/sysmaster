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

/**
 * POST authentifié dont la réponse est un flux Server-Sent Events. Chaque événement est passé à `onEvent`
 * dans l'ordre ; une erreur HTTP avant le flux (quota, service injoignable) lève ApiError.
 */
export async function apiStream<E extends { event: string; data: unknown }>(
  path: string,
  accessToken: string | undefined,
  body: unknown,
  onEvent: (e: E) => void,
): Promise<void> {
  const res = await fetch(`${publicApiBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, await res.json().catch(() => ({})));
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data !== undefined) onEvent({ event, data: JSON.parse(data) } as E);
    }
  }
}
