'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import type { ModerationDecisionInput, ModerationItemDto } from '@sysmaster/contracts';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiRequest } from '@/lib/client-api';
import { since } from '@/lib/labels';

export function ModerationQueue({ initial }: { initial: ModerationItemDto[] }) {
  const { data: session } = useSession();
  const [items, setItems] = useState(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decide = (item: ModerationItemDto, action: ModerationDecisionInput['action']) =>
    start(async () => {
      setError(null);
      try {
        const note = notes[item.targetId]?.trim();
        await apiRequest('POST', '/community/moderation', session?.accessToken, { targetType: item.targetType, targetId: item.targetId, action, note: note || undefined });
        setItems((cur) => cur.filter((i) => i.targetId !== item.targetId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Décision impossible');
      }
    });

  if (items.length === 0) return <Card><p className="text-sm text-muted-foreground">Aucun signalement en attente.</p></Card>;

  return (
    <ul className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {items.map((item) => (
        <li key={item.targetId}>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{item.targetType === 'thread' ? 'Sujet' : 'Réponse'}</Badge>
              {item.hidden && <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">Masqué</Badge>}
              <Link href={`/communaute/${item.threadId}`} className="font-medium underline">{item.threadTitle}</Link>
              <span className="text-muted-foreground">par {item.author}</span>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border p-3"><Markdown ugc>{item.bodyMd}</Markdown></div>
            <ul className="space-y-1 text-sm">
              {item.reports.map((r, i) => (
                <li key={i}><span className="font-medium">{r.reporter}</span> · {since(r.createdAt)} : {r.reason}</li>
              ))}
            </ul>
            <input
              value={notes[item.targetId] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [item.targetId]: e.target.value }))}
              placeholder="Motif (affiché à l’auteur si vous masquez)"
              aria-label="Motif de la décision"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-red-600 text-white" disabled={pending} onClick={() => decide(item, 'hide')}>Masquer</Button>
              {item.hidden && <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(item, 'restore')}>Rétablir</Button>}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(item, 'dismiss')}>Écarter les signalements</Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
