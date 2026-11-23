import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { DashboardDto, SkillProgressDto } from '@sysmaster/contracts';
import { ArrowRight, Flame, Sparkles, Trophy } from 'lucide-react';
import { ApiUnavailable } from '@/components/api-unavailable';
import { BadgeIcon } from '@/components/badge-icon';
import { ProgressBar } from '@/components/progress-bar';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { rarityLabel, xpReasonLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tableau de bord' };

function SkillList({ skills, empty }: { skills: SkillProgressDto[]; empty: string }) {
  if (skills.length === 0) return <CardDescription>{empty}</CardDescription>;
  return (
    <ul className="mt-3 space-y-3">
      {skills.map((s) => (
        <li key={s.code}>
          <ProgressBar value={s.pct} label={`${s.name} (${s.completedLessons}/${s.totalLessons} leçons)`} />
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const token = await serverAccessToken();
  if (!token) redirect('/connexion?callbackUrl=/tableau-de-bord');

  let data: DashboardDto | null;
  try {
    data = await apiGet<DashboardDto>('/me/dashboard', token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!data) redirect('/connexion?callbackUrl=/tableau-de-bord');

  const g = data.gamification;
  const levelSpan = g.nextLevel ? g.nextLevel.minXp - g.currentLevelXp : 0;
  const levelPct = g.nextLevel && levelSpan > 0 ? (100 * (g.totalXp - g.currentLevelXp)) / levelSpan : 100;
  const earned = g.badges.filter((b) => b.earnedAt);
  const locked = g.badges.filter((b) => !b.earnedAt);
  const started = data.skills.filter((s) => s.completedLessons > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Tableau de bord</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="flex items-baseline justify-between gap-4">
            <CardTitle>Niveau {g.level} : {g.levelTitle}</CardTitle>
            <span className="font-mono text-sm">{g.totalXp} XP</span>
          </div>
          <div className="mt-4">
            <ProgressBar
              value={levelPct}
              label={g.nextLevel ? `Vers « ${g.nextLevel.title} » (${g.nextLevel.minXp} XP)` : 'Niveau maximal atteint'}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {g.lessonsCompleted} leçon(s) validée(s) · {g.diagnosticsCompleted} diagnostic(s) mené(s) à terme ·{' '}
            {g.pathsCompleted} parcours terminé(s)
          </p>
        </Card>
        <Card>
          <CardTitle className="flex items-center gap-2"><Flame className="size-5 text-orange-500" aria-hidden /> Série</CardTitle>
          <p className="mt-2 text-3xl font-bold">{g.streakDays} jour{g.streakDays > 1 ? 's' : ''}</p>
          <CardDescription>
            Record : {g.longestStreak} jour{g.longestStreak > 1 ? 's' : ''}. Une leçon ou un diagnostic par jour suffit à la prolonger.
          </CardDescription>
        </Card>
      </div>

      <Card>
        <CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" aria-hidden /> Que faire ensuite ?</CardTitle>
        <ul className="mt-3 space-y-2">
          {data.recommendations.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="inline-flex items-center gap-1 text-primary hover:underline">
                {r.text} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
          {data.recommendations.length === 0 && (
            <CardDescription>Tous vos parcours sont terminés. Bravo ! <Link href="/parcours" className="text-primary hover:underline">En choisir un autre</Link></CardDescription>
          )}
        </ul>
      </Card>

      {data.enrollments.length > 0 && (
        <Card>
          <CardTitle>Mes parcours</CardTitle>
          <ul className="mt-4 space-y-4">
            {data.enrollments.map((e) => (
              <li key={e.pathSlug}>
                <Link href={`/parcours/${e.pathSlug}`} className="font-medium hover:underline">{e.pathTitle}</Link>
                <div className="mt-1"><ProgressBar value={e.progressPct} label={e.completedAt ? 'Terminé' : 'Progression'} /></div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Points forts</CardTitle>
          <CardDescription>Compétences dont vous avez validé au moins 60 % des leçons.</CardDescription>
          <SkillList skills={data.strengths} empty="Pas encore : validez quelques leçons pour les voir apparaître." />
        </Card>
        <Card>
          <CardTitle>À renforcer</CardTitle>
          <CardDescription>Compétences commencées ou liées à vos parcours, encore à moins de 50 %.</CardDescription>
          <SkillList skills={data.weaknesses} empty="Rien à signaler pour l’instant." />
        </Card>
      </div>

      {started.length > 0 && (
        <Card>
          <CardTitle>Carte des compétences</CardTitle>
          <SkillList skills={data.skills} empty="" />
        </Card>
      )}

      <Card>
        <div className="flex items-baseline justify-between">
          <CardTitle>Badges</CardTitle>
          <span className="text-sm text-muted-foreground">{earned.length} / {g.badges.length}</span>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...earned, ...locked].map((b) => (
            <li key={b.code} className={cn('flex gap-3 rounded-lg border p-3', !b.earnedAt && 'opacity-50')}>
              <BadgeIcon name={b.icon} className={cn('size-8 shrink-0', b.earnedAt ? 'text-primary' : 'text-muted-foreground')} />
              <div>
                <p className="font-medium">
                  {b.name} <Badge className="ml-1 align-middle">{rarityLabel[b.rarity] ?? b.rarity}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">{b.description}</p>
                <p className="mt-1 text-xs">
                  {b.earnedAt
                    ? `Obtenu le ${new Date(b.earnedAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}`
                    : 'Pas encore obtenu'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>XP récente</CardTitle>
          {g.recentXp.length === 0 ? (
            <CardDescription>Aucune XP pour l&apos;instant.</CardDescription>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {g.recentXp.map((x, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{xpReasonLabel[x.reason] ?? x.reason}</span>
                  <span className="font-mono text-muted-foreground">
                    +{x.amount} · {new Date(x.at).toLocaleDateString('fr-FR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle className="flex items-center gap-2"><Trophy className="size-5 text-primary" aria-hidden /> Comment gagner de l&apos;XP</CardTitle>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Leçon validée : 10 XP + 1 par minute estimée (50 au plus).</li>
            <li>Diagnostic mené à terme : 15 XP.</li>
            <li>Parcours terminé : 200 XP.</li>
            <li>La vitesse ne rapporte rien : comprendre avant d&apos;exécuter.</li>
          </ul>
          <Link href="/classement" className="mt-3 inline-block text-sm text-primary hover:underline">Voir le classement</Link>
        </Card>
      </div>
    </div>
  );
}
