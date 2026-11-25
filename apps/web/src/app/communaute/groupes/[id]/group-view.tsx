'use client';

import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { Lock } from 'lucide-react';
import type { StudyGroupDetailDto } from '@sysmaster/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/client-api';
import { MessagesPanel } from '../../messages-panel';

export function GroupView({ initial }: { initial: StudyGroupDetailDto }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [g, setG] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const member = !!g.me?.member;

  const join = () =>
    start(async () => {
      setError(null);
      try {
        setG(await apiRequest<StudyGroupDetailDto>('POST', `/community/groups/${g.id}/join`, session?.accessToken));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impossible de rejoindre');
      }
    });
  const leave = () =>
    start(async () => {
      const last = g.me?.owner && g.memberCount === 1;
      if (!window.confirm(last ? 'Vous êtes seul dans ce groupe : le quitter le ferme, avec ses messages. Continuer ?' : 'Quitter ce groupe ?')) return;
      try {
        await apiRequest('POST', `/community/groups/${g.id}/leave`, session?.accessToken);
        router.push('/communaute/groupes');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action impossible');
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="space-y-4">
        <div>
          <div className="flex flex-wrap gap-2">
            {!g.isPublic && <Badge><Lock className="mr-1 size-3" aria-hidden />Privé</Badge>}
            <Badge>{g.memberCount} / {g.maxMembers} membres</Badge>
          </div>
          <h1 className="mt-2 text-3xl font-bold">{g.name}</h1>
          {g.goal && <p className="mt-2 font-medium">Objectif : {g.goal}</p>}
          {g.description && <p className="mt-2 whitespace-pre-line text-muted-foreground">{g.description}</p>}
        </div>
        {member ? (
          <Card>
            <CardTitle className="text-base">Échanges du groupe</CardTitle>
            <CardDescription className="mb-4">Visibles des seuls membres.</CardDescription>
            <MessagesPanel path={`/community/groups/${g.id}/messages`} canHideOthers={!!g.me?.owner} emptyText="Aucun message : présentez-vous et dites où vous en êtes." />
          </Card>
        ) : !session ? (
          <Card><p className="text-sm"><button type="button" onClick={() => signIn('keycloak')} className="font-medium underline">Connectez-vous</button> pour rejoindre ce groupe.</p></Card>
        ) : (
          <Card className="space-y-3">
            {g.joinBlocker ? <CardDescription>{g.joinBlocker}</CardDescription> : <CardDescription>Rejoignez le groupe pour lire et écrire dans ses échanges.</CardDescription>}
            <Button onClick={join} disabled={pending || !!g.joinBlocker}>Rejoindre le groupe</Button>
          </Card>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </section>

      <aside className="space-y-4">
        {g.inviteCode && (
          <Card>
            <CardTitle className="text-base">Code d’invitation</CardTitle>
            <p className="mt-2 font-mono text-2xl tracking-widest">{g.inviteCode}</p>
            <CardDescription className="mt-1">Partagez-le avec les personnes que vous invitez.</CardDescription>
          </Card>
        )}
        {member && (
          <Card>
            <CardTitle className="text-base">Membres</CardTitle>
            <ul className="mt-3 space-y-1 text-sm">
              {g.members.map((m) => (
                <li key={m.userId} className="flex justify-between gap-2">
                  <span>{m.displayName}{m.role === 'owner' && <span className="text-muted-foreground"> · anime</span>}</span>
                  <span className="text-muted-foreground">niv. {m.level}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" className="mt-4" onClick={leave} disabled={pending}>Quitter le groupe</Button>
          </Card>
        )}
        <p className="text-xs text-muted-foreground">Animé par {g.owner}.</p>
      </aside>
    </div>
  );
}
