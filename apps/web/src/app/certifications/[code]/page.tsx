import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CertificationDto } from '@sysmaster/contracts';
import { CheckCircle2, Circle } from 'lucide-react';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { formatPrice } from '@/lib/billing';
import { difficultyLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';
import { ExamPanel } from './exam-panel';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ code: string }>; searchParams?: Promise<{ paiement?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Certification ${(await params).code}` };
}

export default async function CertificationPage({ params, searchParams }: Props) {
  const { code } = await params;
  const paiement = (await searchParams)?.paiement;
  const token = await serverAccessToken();
  let c: CertificationDto | null;
  try {
    c = await apiGet<CertificationDto>(`/certifications/${encodeURIComponent(code)}`, token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!c) notFound();
  const minutes = Math.round(c.exam.timeLimitS / 60);

  return (
    <article className="space-y-8">
      <header>
        <Link href="/certifications" className="text-sm text-muted-foreground hover:text-foreground">← Certifications</Link>
        <h1 className="mt-2 text-3xl font-bold">{c.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{difficultyLabel[c.level]}</Badge>
          <Badge>{c.validityMonths ? `Valable ${c.validityMonths / 12} ans` : 'Sans expiration'}</Badge>
          {c.payment.required && (
            <Badge>
              Examen : {formatPrice(c.payment.amountCents)} TTC
              {c.payment.discountPct > 0 ? ` (−${c.payment.discountPct} % avec votre offre)` : ''}
            </Badge>
          )}
        </div>
        <p className="mt-4 max-w-2xl text-muted-foreground">{c.description}</p>
      </header>

      <Card className="space-y-3">
        <CardTitle>Ce qu’il faut pour l’obtenir</CardTitle>
        <ul className="space-y-2 text-sm">
          {c.requirements.map((r) => (
            <li key={`${r.kind}-${r.ref}`} className="flex items-start gap-2">
              {r.met ? <CheckCircle2 className="mt-0.5 size-4 text-green-600" aria-label="rempli" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" aria-label="à faire" />}
              <span>
                {r.kind === 'lab' ? 'Réussir le lab ' : 'Détenir la certification '}
                <Link href={r.kind === 'lab' ? `/labs/${r.ref}` : `/certifications/${r.ref}`} className="font-medium underline">{r.title}</Link>
              </span>
            </li>
          ))}
          <li className="flex items-start gap-2">
            <Circle className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            <span>
              Réussir l’examen : {c.exam.questionCount} questions tirées au sort, {minutes} minutes, {c.exam.passScore} % de bonnes réponses.
              Après un échec, nouvelle tentative possible au bout de {c.exam.retryAfterHours} h.
            </span>
          </li>
        </ul>
      </Card>

      {paiement === 'ok' && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
          Paiement reçu, merci. Votre tentative est disponible dès que Stripe la confirme, en général en quelques secondes : rechargez la page si le bouton « Commencer » n’apparaît pas encore.
        </p>
      )}
      {paiement === 'annule' && <p role="status" className="rounded-md border p-3 text-sm">Paiement annulé : rien n’a été débité.</p>}

      {!c.exam.available ? (
        <p className="text-sm text-muted-foreground">L’examen ouvrira quand sa banque de questions relues sera complète.</p>
      ) : !c.me ? (
        <p className="text-sm">
          <Link href="/connexion" className="underline">Connectez-vous</Link> pour suivre vos conditions et passer l’examen.
        </p>
      ) : (
        <ExamPanel certification={c} />
      )}
    </article>
  );
}
