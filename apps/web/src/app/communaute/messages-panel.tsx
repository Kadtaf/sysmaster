'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import type { CommunityMessageDto } from '@sysmaster/contracts';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { ApiError, apiRequest } from '@/lib/client-api';
import { since } from '@/lib/labels';
import { cn } from '@/lib/utils';

type Thread = { items: CommunityMessageDto[]; canWrite: boolean };

/**
 * Échanges privés d'un groupe ou d'un binôme de mentorat. Rafraîchis toutes les 20 secondes
 * tant que la page est visible : pas de temps réel, c'est un espace d'entraide, pas une messagerie.
 */
export function MessagesPanel({ path, canHideOthers = false, emptyText }: { path: string; canHideOthers?: boolean; emptyText: string }) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [thread, setThread] = useState<Thread | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setThread(await apiRequest<Thread>('GET', path, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
    }
  }, [path, token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  const send = () =>
    start(async () => {
      setError(null);
      try {
        setThread(await apiRequest<Thread>('POST', path, token, { bodyMd: body }));
        setBody('');
      } catch (e) {
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Envoi impossible');
      }
    });

  const hide = (id: string) =>
    start(async () => {
      try {
        await apiRequest('POST', `/community/messages/${id}/hide`, token);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action impossible');
      }
    });

  if (!thread) return <p className="text-sm text-muted-foreground">{error ?? 'Chargement des messages…'}</p>;

  return (
    <div className="space-y-4">
      {thread.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="space-y-3" aria-label="Messages">
          {thread.items.map((m) => (
            <li key={m.id} className={cn('rounded-lg border p-3', m.mine && 'bg-muted/40')}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{m.author.displayName}</span>
                <span>niv. {m.author.level} · {since(m.createdAt)}</span>
                {!m.hidden && (m.mine || canHideOthers) && (
                  <button type="button" onClick={() => hide(m.id)} disabled={pending} className="ml-auto hover:text-foreground">Masquer</button>
                )}
              </div>
              {m.hidden ? <p className="text-sm italic text-muted-foreground">Message masqué.</p> : <Markdown ugc>{m.bodyMd}</Markdown>}
            </li>
          ))}
        </ol>
      )}
      {thread.canWrite && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Votre message
            <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </label>
          <Button size="sm" onClick={send} disabled={pending || !body.trim()}>Envoyer</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
