'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { CheckCheck } from 'lucide-react';
import { RETENTION_DAYS } from '@sysmaster/contracts';
import type { NotificationDto, NotificationListDto, NotificationPreferenceDto, NotificationType } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/client-api';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<NotificationType, string> = {
  community_reply: 'Réponses à mes sujets',
  answer_accepted: 'Mes réponses acceptées',
  mentorship: 'Mentorat (demandes, réponses, fin)',
  certificate_issued: 'Certificats obtenus',
  editorial_review: 'Relecture de mes contributions',
};

const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export function NotificationsView({ list, preferences }: { list: NotificationListDto; preferences: NotificationPreferenceDto[] }) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const router = useRouter();
  const [prefs, setPrefs] = useState(preferences);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Opération impossible');
      }
    });

  const open = (n: NotificationDto) => {
    if (!n.read) void apiRequest('POST', `/me/notifications/${n.id}/read`, token).catch(() => undefined);
  };

  const toggle = (p: NotificationPreferenceDto) =>
    run(async () => {
      const next = await apiRequest<NotificationPreferenceDto[]>('PUT', '/me/notifications/preferences', token, {
        preferences: [{ ...p, enabled: !p.enabled }],
      });
      setPrefs(next);
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Notifications</h1>
        {list.unread > 0 && (
          <Button variant="outline" size="sm" className="ml-auto" disabled={pending}
            onClick={() => run(() => apiRequest('POST', '/me/notifications/read-all', token))}>
            <CheckCheck className="size-4" aria-hidden /> Tout marquer comme lu
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {list.items.length === 0 ? (
        <p className="text-muted-foreground">Aucune notification pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.items.map((n) => {
            const content = (
              <>
                <span className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Non lue" />}
                  <span className={cn('font-medium', n.read && 'font-normal text-muted-foreground')}>{n.title}</span>
                </span>
                {n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}
                <span className="block text-xs text-muted-foreground">{when(n.createdAt)}</span>
              </>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} onClick={() => open(n)} className="block space-y-1 p-3 hover:bg-muted/50">{content}</Link>
                ) : (
                  <div className="space-y-1 p-3">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <CardTitle>Ce que je reçois</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.emailEnabled
            ? 'Chaque e-mail contient un lien pour ne plus recevoir ce type d’e-mail.'
            : 'Les e-mails ne sont pas encore ouverts sur SysMaster : vos choix s’appliqueront dès qu’ils le seront.'}{' '}
          Les notifications lues sont effacées au bout de {Math.round(RETENTION_DAYS.readNotifications / 30)} mois.
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 font-normal">Type</th>
              <th scope="col" className="w-28 py-1 text-center font-normal">Dans SysMaster</th>
              <th scope="col" className="w-28 py-1 text-center font-normal">Par e-mail</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(TYPE_LABELS) as NotificationType[]).map((type) => (
              <tr key={type} className="border-t">
                <th scope="row" className="py-2 pr-4 font-normal">{TYPE_LABELS[type]}</th>
                {(['in_app', 'email'] as const).map((channel) => {
                  const p = prefs.find((x) => x.type === type && x.channel === channel);
                  if (!p) return <td key={channel} />;
                  return (
                    <td key={channel} className="py-2 text-center">
                      <input type="checkbox" checked={p.enabled} disabled={pending} onChange={() => toggle(p)} className="size-4"
                        aria-label={`${TYPE_LABELS[type]} : ${channel === 'email' ? 'par e-mail' : 'dans SysMaster'}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
