import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { LearningPathDetail } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ProgressBar } from '@/components/progress-bar';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { difficultyLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';
import { EnrollButton } from './enroll-button';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).slug };
}

export default async function PathPage({ params }: Props) {
  const { slug } = await params;
  const token = await serverAccessToken();
  let path: LearningPathDetail | null;
  try {
    path = await apiGet<LearningPathDetail>(`/learning/paths/${encodeURIComponent(slug)}`, token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!path) notFound();

  return (
    <div className="space-y-8">
      <header>
        <Link href="/parcours" className="text-sm text-muted-foreground hover:text-foreground">← Parcours</Link>
        <h1 className="mt-2 text-3xl font-bold">{path.title}</h1>
        <p className="mt-2 max-w-3xl text-lg text-muted-foreground">{path.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{difficultyLabel[path.difficulty]}</Badge>
          {path.estHours && <Badge>{path.estHours} h</Badge>}
          {path.career && <Badge>{path.career}</Badge>}
        </div>
      </header>

      <Card>
        {path.enrollment ? (
          <ProgressBar value={path.enrollment.progressPct} label={path.enrollment.completedAt ? 'Parcours terminé' : 'Votre progression'} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardDescription className="mt-0">
              Inscrivez-vous pour suivre votre progression. Les leçons restent lisibles sans compte.
            </CardDescription>
            <EnrollButton slug={path.slug} signedIn={Boolean(token)} />
          </div>
        )}
      </Card>

      <section aria-labelledby="cours">
        <h2 id="cours" className="text-xl font-semibold">Cours, dans l&apos;ordre conseillé</h2>
        <ol className="mt-4 space-y-3">
          {path.courses.map((c, i) => (
            <li key={c.slug}>
              <Link href={`/cours/${c.slug}`} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="transition-colors hover:bg-muted/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-muted-foreground">{i + 1}.</span>
                    <CardTitle>{c.title}</CardTitle>
                    <Badge>{c.platform}</Badge>
                    {c.isPremium && <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Premium</Badge>}
                  </div>
                  <CardDescription>{c.summary}</CardDescription>
                  <div className="mt-4">
                    <ProgressBar value={c.lessonCount ? (100 * c.completedCount) / c.lessonCount : 0} label={`${c.completedCount} / ${c.lessonCount} leçons validées`} />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
