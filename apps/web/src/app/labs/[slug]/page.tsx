import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { LabDetailDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { difficultyLabel, labCategoryLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';
import { LabConsole } from './lab-console';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).slug };
}

export default async function LabPage({ params }: Props) {
  const { slug } = await params;
  const token = await serverAccessToken();
  let lab: LabDetailDto | null;
  try {
    lab = await apiGet<LabDetailDto>(`/labs/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!lab) notFound();

  return (
    <article className="space-y-8">
      <header>
        <Link href="/labs" className="text-sm text-muted-foreground hover:text-foreground">← Labs</Link>
        <h1 className="mt-2 text-3xl font-bold">{lab.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{labCategoryLabel[lab.category]}</Badge>
          <Badge>{difficultyLabel[lab.difficulty]}</Badge>
          <Badge>{lab.ttlMinutes} min</Badge>
          {lab.runtime === 'simulation' && <Badge>Machine simulée</Badge>}
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">La situation</h2>
          <Markdown>{lab.briefMd}</Markdown>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Ce que vous allez apprendre</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{lab.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          <h2 className="mt-4 text-lg font-semibold">Ce qui sera vérifié</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{lab.checks.map((c) => <li key={c}>{c}</li>)}</ul>
        </Card>
      </div>

      {lab.runtime === 'simulation' ? (
        <LabConsole slug={lab.slug} signedIn={Boolean(token)} />
      ) : (
        <Card>Ce lab demande une vraie machine isolée : il sera disponible prochainement.</Card>
      )}
    </article>
  );
}
