import type { Metadata } from 'next';
import Link from 'next/link';
import type { LearningPathSummary } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { difficultyLabel } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Parcours' };

export default async function PathsPage() {
  let paths: LearningPathSummary[] | null;
  try {
    paths = await apiGet<LearningPathSummary[]>('/learning/paths');
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  return (
    <>
      <h1 className="text-3xl font-bold">Parcours métiers</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Chaque parcours est progressif : vous ne passez à une notion qu&apos;une fois ses prérequis compris.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {(paths ?? []).map((p) => (
          <Link key={p.slug} href={`/parcours/${p.slug}`} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <div className="flex flex-wrap gap-2">
              <Badge>{difficultyLabel[p.difficulty]}</Badge>
              {p.estHours && <Badge>{p.estHours} h</Badge>}
            </div>
            <CardTitle className="mt-3">{p.title}</CardTitle>
            <CardDescription>{p.summary}</CardDescription>
            <p className="mt-4 text-xs text-muted-foreground">
              {p.career} · {p.courseCount} cours
            </p>
          </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
