import type { Metadata } from 'next';
import Link from 'next/link';
import type { BillingCatalogDto, BillingPlanDto } from '@sysmaster/contracts';
import { Check } from 'lucide-react';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { formatPrice } from '@/lib/billing';
import { CheckoutButton } from './checkout-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tarifs' };

/** Ce que chaque offre apporte, en clair (les droits techniques sont dans billing.plans.features). */
function highlights(p: BillingPlanDto): string[] {
  const f = p.features;
  const out: string[] = [];
  out.push(p.aiQuestionsPerDay === null ? 'Assistant IA sans plafond (usage raisonnable)' : `${p.aiQuestionsPerDay} questions à l’IA par jour`);
  const diag = f['ai.diagnostics_per_month'];
  if (diag !== undefined) out.push(diag === 'unlimited' ? 'Diagnostics IA sans plafond' : `${diag} diagnostics IA par mois`);
  const hours = f['labs.hours_per_month'];
  if (typeof hours === 'number') out.push(`${hours} h de labs par mois`);
  if (p.certificationDiscountPct > 0) out.push(`−${p.certificationDiscountPct} % sur les certifications`);
  if (typeof f['probe.devices'] === 'number') out.push(`Agent de collecte sur ${f['probe.devices']} machines`);
  if (f.sso) out.push('Connexion unique (SSO) et tableau de bord d’équipe');
  if (f.cohorts) out.push('Cohortes et parcours personnalisés');
  if (f.lti) out.push('Intégration LTI');
  return out;
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ paiement?: string }> }) {
  const { paiement } = await searchParams;
  let catalog: BillingCatalogDto | null;
  try {
    catalog = await apiGet<BillingCatalogDto>('/billing/plans');
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!catalog) return <ApiUnavailable />;
  const self = catalog.plans.filter((p) => p.priceCents !== null && !p.perSeat);
  const licences = catalog.plans.filter((p) => p.priceCents === null || p.perSeat);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Tarifs</h1>
        <p className="text-muted-foreground">
          Apprendre, comprendre, diagnostiquer : l’offre gratuite suffit pour commencer. Les offres payées lèvent les plafonds
          de l’IA et des labs. Sans engagement, résiliable à tout moment depuis <Link href="/abonnement" className="text-primary hover:underline">Mon abonnement</Link>.
        </p>
      </div>

      {paiement === 'annule' && (
        <p role="status" className="rounded-md border p-3 text-sm">Paiement annulé : rien n’a été débité.</p>
      )}
      {!catalog.enabled && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Le paiement en ligne ouvrira bientôt. En attendant, toutes les fonctions restent accessibles avec les plafonds actuels.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {self.map((p) => (
          <Card key={p.code} className="flex flex-col">
            <div className="flex items-center justify-between">
              <CardTitle>{p.name}</CardTitle>
              {p.code === 'pro' && <Badge>Le plus complet</Badge>}
            </div>
            <p className="mt-3 text-3xl font-bold">
              {p.priceCents === 0 ? 'Gratuit' : formatPrice(p.priceCents!, p.currency)}
              {p.priceCents ? <span className="text-base font-normal text-muted-foreground"> / {p.interval === 'year' ? 'an' : 'mois'} TTC</span> : null}
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {highlights(p).map((h) => (
                <li key={h} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{h}</li>
              ))}
            </ul>
            <div className="mt-6">
              {p.priceCents === 0 ? (
                <CardDescription>Inclus avec tout compte.</CardDescription>
              ) : p.purchasable ? (
                <CheckoutButton plan={p.code} label={`Choisir ${p.name}`} />
              ) : (
                <CardDescription>Bientôt disponible.</CardDescription>
              )}
            </div>
          </Card>
        ))}
      </div>

      {licences.length > 0 && (
        <Card>
          <CardTitle>Entreprises, centres de formation, écoles, universités</CardTitle>
          <CardDescription>Licence annuelle par siège, sur devis.</CardDescription>
          <ul className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            {licences.map((p) => (
              <li key={p.code}>
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground"> : {highlights(p).slice(1).join(', ') || 'sur mesure'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Le paiement est traité par Stripe : SysMaster ne voit jamais votre numéro de carte. Prix TTC, facture disponible dans
        Mon abonnement.
      </p>
    </div>
  );
}
