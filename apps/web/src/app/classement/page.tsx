import type { Metadata } from 'next';
import type { DashboardDto, LeaderboardDto, LeaderboardEntryDto } from '@sysmaster/contracts';
import { Trophy } from 'lucide-react';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { cn } from '@/lib/utils';
import { VisibilityToggle } from './visibility-toggle';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Classement' };

function Row({ e }: { e: LeaderboardEntryDto }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-md px-3 py-2', e.isMe && 'bg-primary/10 font-medium')}>
      <span className="w-8 text-right font-mono text-muted-foreground">{e.position}</span>
      <span className="flex-1">{e.name}{e.isMe && ' (vous)'}</span>
      <span className="text-xs text-muted-foreground">niv. {e.level}</span>
      <span className="w-20 text-right font-mono">{e.totalXp} XP</span>
    </li>
  );
}

export default async function LeaderboardPage() {
  const token = await serverAccessToken();
  let board: LeaderboardDto | null;
  let dashboard: DashboardDto | null = null;
  try {
    [board, dashboard] = await Promise.all([
      apiGet<LeaderboardDto>('/gamification/leaderboard?limit=50', token),
      token ? apiGet<DashboardDto>('/me/dashboard', token) : Promise.resolve(null),
    ]);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  const top = board?.top ?? [];
  const me = board?.me ?? null;
  const meOutsideTop = me && !top.some((e) => e.isMe);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold"><Trophy className="size-7 text-primary" aria-hidden /> Classement</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          L&apos;XP récompense la compréhension, pas la vitesse : une leçon validée, un diagnostic mené à terme, un parcours
          terminé. Les noms sont abrégés et chacun peut se retirer du classement.
        </p>
      </div>

      <Card>
        {top.length === 0 ? (
          <CardDescription>Personne n&apos;est encore classé. Validez une leçon pour ouvrir le bal.</CardDescription>
        ) : (
          <ol className="space-y-1 text-sm" aria-label="Meilleurs apprenants">
            {top.map((e) => <Row key={`${e.position}-${e.name}`} e={e} />)}
          </ol>
        )}
        {meOutsideTop && (
          <ol className="mt-3 border-t pt-3 text-sm" aria-label="Votre rang"><Row e={me} /></ol>
        )}
      </Card>

      {dashboard && (
        <Card>
          <CardTitle>Votre visibilité</CardTitle>
          <CardDescription className="mb-4">
            {dashboard.gamification.showInLeaderboard
              ? 'Vous apparaissez sous un nom abrégé. Vous retirer ne supprime ni votre XP ni vos badges.'
              : 'Vous n’apparaissez pas dans le classement. Votre XP et vos badges continuent d’être comptés.'}
          </CardDescription>
          <VisibilityToggle visible={dashboard.gamification.showInLeaderboard} />
        </Card>
      )}
    </div>
  );
}
