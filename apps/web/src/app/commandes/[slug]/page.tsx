import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CommandDetail, QuizSummaryDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { CommandReveal } from '@/components/command-reveal';
import { RiskBadge } from '@/components/risk-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { difficultyLabel } from '@/lib/labels';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export default async function CommandPage({ params }: Props) {
  const { slug } = await params;
  let cmd: CommandDetail | null;
  try {
    cmd = await apiGet<CommandDetail>(`/kb/commands/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!cmd) notFound();
  // Le quiz est un complément : s'il ne se charge pas, la fiche reste lisible.
  const quizzes = await apiGet<QuizSummaryDto[]>(`/quizzes?command=${encodeURIComponent(slug)}`).catch(() => null);

  return (
    <article className="space-y-8">
      <header>
        <Link href="/commandes" className="text-sm text-muted-foreground hover:text-foreground">← Base de connaissances</Link>
        <h1 className="mt-2 font-mono text-3xl font-bold">{cmd.name}</h1>
        <p className="mt-2 max-w-3xl text-lg text-muted-foreground">{cmd.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{cmd.platform}{cmd.shell ? ` · ${cmd.shell}` : ''}</Badge>
          <Badge>{difficultyLabel[cmd.difficulty]}</Badge>
          <RiskBadge level={cmd.riskLevel} />
          {cmd.requiresAdmin && <Badge>Droits administrateur</Badge>}
        </div>
      </header>

      {/* Ordre voulu : comprendre (pourquoi, quand, contexte) AVANT de voir la commande. */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card><Section title="Pourquoi">{cmd.why}</Section></Card>
        <Card><Section title="Quand">{cmd.whenToUse}</Section></Card>
        <Card><Section title="Dans quel contexte">{cmd.context ?? '—'}</Section></Card>
      </div>

      <Section title="Comment : syntaxe">
        <CommandReveal
          syntax={cmd.syntax}
          riskLevel={cmd.riskLevel}
          risks={cmd.risks}
          masked={cmd.maskedUntilRisksRead}
          copyAllowed={cmd.copyAllowed}
        />
      </Section>

      {cmd.parameters.length > 0 && (
        <Section title="Paramètres">
          <ul className="divide-y rounded-lg border">
            {cmd.parameters.map((p) => (
              <li key={p.flag} className="flex flex-wrap items-center gap-3 p-3">
                <code className="font-mono font-semibold">{p.flag}</code>
                <span className="flex-1">{p.description}</span>
                <RiskBadge level={p.riskLevel} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cmd.examples.length > 0 && (
        <Section title="Exemples et cas réels">
          <div className="space-y-4">
            {cmd.examples.map((ex) => (
              <div key={ex.title} className="rounded-lg border p-4">
                <p className="font-medium">
                  {ex.title} {ex.isRealCase && <Badge className="ml-2">Cas réel</Badge>}
                </p>
                <p className="mt-1 text-muted-foreground">{ex.explanation}</p>
                <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-3 font-mono text-slate-100">{ex.code}</pre>
              </div>
            ))}
          </div>
        </Section>
      )}

      {cmd.internals && <Section title="Fonctionnement interne">{cmd.internals}</Section>}
      {cmd.history && <Section title="Historique">{cmd.history}</Section>}

      {cmd.commonErrors.length > 0 && (
        <Section title="Erreurs fréquentes">
          <ul className="space-y-3">
            {cmd.commonErrors.map((e) => (
              <li key={e.error} className="rounded-lg border p-3">
                <code className="block font-mono text-xs">{e.error}</code>
                <p className="mt-2"><strong>Cause :</strong> {e.cause}</p>
                <p><strong>Correction :</strong> {e.fix}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cmd.bestPractices.length > 0 && (
        <Section title="Bonnes pratiques">
          <ul className="list-disc space-y-1 pl-6">{cmd.bestPractices.map((b) => <li key={b}>{b}</li>)}</ul>
        </Section>
      )}

      {quizzes && quizzes.length > 0 && (
        <Section title="Tester ma compréhension">
          <ul className="space-y-2">
            {quizzes.map((q) => (
              <li key={q.slug}>
                <Link href={`/quiz/${q.slug}`} className="font-semibold text-primary hover:underline">{q.title}</Link>
                <span className="text-muted-foreground"> · {q.questionCount} question{q.questionCount > 1 ? 's' : ''}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cmd.alternatives.length > 0 && (
        <Section title="Alternatives">
          <ul className="space-y-2">
            {cmd.alternatives.map((a) => (
              <li key={a.slug}>
                <Link href={`/commandes/${a.slug}`} className="font-mono font-semibold text-primary hover:underline">{a.name}</Link>
                {' — '}{a.note}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cmd.sources.length > 0 && (
        <Section title="Sources">
          <ul className="list-disc pl-6">
            {cmd.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} className="text-primary hover:underline" rel="noopener noreferrer" target="_blank">{s.title}</a>
                <span className="text-muted-foreground"> · {s.publisher}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}
