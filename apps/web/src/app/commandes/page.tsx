import type { Metadata } from 'next';
import Link from 'next/link';
import type { CommandSummary } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { RiskBadge } from '@/components/risk-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Base de connaissances' };

export default async function CommandsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  let commands: CommandSummary[] | null;
  try {
    commands = await apiGet<CommandSummary[]>(`/kb/commands${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  return (
    <>
      <h1 className="text-3xl font-bold">Base de connaissances</h1>
      <p className="mt-2 text-muted-foreground">Chaque fiche explique la commande avant de la montrer.</p>
      <form className="mt-6 flex max-w-xl gap-2" role="search">
        <label htmlFor="q" className="sr-only">Rechercher une commande</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="ex. journal, service, sfc…"
          className="h-10 flex-1 rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit">Rechercher</Button>
      </form>
      <ul className="mt-8 grid gap-3 md:grid-cols-2">
        {(commands ?? []).map((c) => (
          <li key={c.slug}>
            <Link href={`/commandes/${c.slug}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
              <Card className="h-full transition-colors hover:bg-muted/50">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-base font-semibold">{c.name}</code>
                  <Badge>{c.platform}</Badge>
                  <RiskBadge level={c.riskLevel} />
                </div>
                <CardDescription className="mt-2">{c.summary}</CardDescription>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {commands?.length === 0 && <p className="mt-8 text-muted-foreground">Aucune fiche ne correspond.</p>}
    </>
  );
}
