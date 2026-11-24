import type { Metadata } from 'next';
import Link from 'next/link';
import type { LabSummaryDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { difficultyLabel, labCategoryLabel } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Labs' };

export default async function LabsPage() {
  let labs: LabSummaryDto[] | null;
  try {
    labs = await apiGet<LabSummaryDto[]>('/labs');
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  const ready = (labs ?? []).filter((l) => l.runtime === 'simulation');
  const soon = (labs ?? []).filter((l) => l.runtime !== 'simulation');

  return (
    <>
      <h1 className="text-3xl font-bold">Labs : réparer une vraie panne</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Une machine en panne vous attend. Observez, comprenez, puis réparez : la validation vérifie le résultat, pas
        la suite exacte de commandes. Les indices sont là si vous bloquez, mais un lab résolu sans indice rapporte plus.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {ready.map((l) => (
          <Link key={l.slug} href={`/labs/${l.slug}`} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <div className="flex flex-wrap gap-2">
                <Badge>{labCategoryLabel[l.category]}</Badge>
                <Badge>{difficultyLabel[l.difficulty]}</Badge>
              </div>
              <CardTitle className="mt-3">{l.title}</CardTitle>
              <CardDescription>{l.objectives[0]}</CardDescription>
            </Card>
          </Link>
        ))}
      </div>
      {soon.length > 0 && (
        <section className="mt-10" aria-labelledby="bientot">
          <h2 id="bientot" className="text-lg font-semibold">Bientôt, sur une vraie machine</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ces labs demandent un environnement réel isolé, en cours de préparation.</p>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {soon.map((l) => (
              <li key={l.slug}>{l.title} · {labCategoryLabel[l.category]}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
