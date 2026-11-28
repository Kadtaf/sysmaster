'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { NotificationType } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/client-api';

const LABELS: Record<NotificationType, string> = {
  community_reply: 'les réponses à vos sujets',
  answer_accepted: 'vos réponses acceptées',
  mentorship: 'le mentorat',
  certificate_issued: 'vos certificats',
  editorial_review: 'la relecture de vos contributions',
};

export function Unsubscribe({ token }: { token: string }) {
  const [done, setDone] = useState<NotificationType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!token) return <p className="text-muted-foreground">Ce lien est incomplet. Réglez vos e-mails depuis la page Notifications.</p>;
  if (done) {
    return (
      <div className="space-y-2">
        <p role="status">C&apos;est fait : vous ne recevrez plus d&apos;e-mails sur {LABELS[done]}.</p>
        <p className="text-sm text-muted-foreground">
          Les notifications restent visibles dans SysMaster. Tout se règle sur la page{' '}
          <Link href="/notifications" className="text-primary hover:underline">Notifications</Link>.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Vous ne recevrez plus ce type d&apos;e-mail. Les autres notifications ne changent pas.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button disabled={pending}
        onClick={() => start(async () => {
          try {
            setDone((await apiRequest<{ type: NotificationType }>('POST', '/notifications/unsubscribe', undefined, { token })).type);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Désabonnement impossible.');
          }
        })}>
        Ne plus recevoir ces e-mails
      </Button>
    </div>
  );
}
