import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, Users } from 'lucide-react';
import type { StudyGroupDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { GroupActions } from './group-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Groupes d’étude' };

export default async function GroupsPage() {
  const token = await serverAccessToken();
  let groups: StudyGroupDto[] | null;
  try {
    groups = await apiGet<StudyGroupDto[]>('/community/groups', token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  return (
    <div className="space-y-8">
      <div>
        <Link href="/communaute" className="text-sm text-muted-foreground hover:text-foreground">← Communauté</Link>
        <h1 className="mt-2 text-3xl font-bold">Groupes d’étude</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Réviser à plusieurs, se fixer un objectif commun, s’expliquer les choses les uns aux autres : c’est souvent en expliquant qu’on comprend.
          Un groupe privé se rejoint avec le code que son responsable partage.
        </p>
      </div>
      {token && <GroupActions />}
      {(groups ?? []).length === 0 ? (
        <Card><CardDescription>Aucun groupe pour l’instant. Lancez le premier !</CardDescription></Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {(groups ?? []).map((g) => (
            <li key={g.id}>
              <Link href={`/communaute/groupes/${g.id}`} className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full space-y-2 transition-colors hover:bg-muted/50">
                  <div className="flex flex-wrap gap-2">
                    {g.me?.member && <Badge>{g.me.owner ? 'Vous animez' : 'Membre'}</Badge>}
                    {!g.isPublic && <Badge><Lock className="mr-1 size-3" aria-hidden />Privé</Badge>}
                    <Badge><Users className="mr-1 size-3" aria-hidden />{g.memberCount} / {g.maxMembers}</Badge>
                  </div>
                  <CardTitle>{g.name}</CardTitle>
                  {g.goal && <p className="text-sm font-medium">Objectif : {g.goal}</p>}
                  {g.description && <CardDescription className="line-clamp-3">{g.description}</CardDescription>}
                  <p className="text-xs text-muted-foreground">Animé par {g.owner}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
