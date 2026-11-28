import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { BillingCatalogDto, BillingStatusDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import { formatPrice, invoiceStatusLabels, subscriptionStatusLabels } from '@/lib/billing';
import { ManageButton } from './manage-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mon abonnement' };

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' });

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ paiement?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/connexion?callbackUrl=/abonnement');
  const { paiement } = await searchParams;

  let status: BillingStatusDto | null;
  let catalog: BillingCatalogDto | null;
  try {
    [status, catalog] = await Promise.all([apiGet<BillingStatusDto>('/me/billing', session.accessToken), apiGet<BillingCatalogDto>('/billing/plans')]);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!status) redirect('/connexion?callbackUrl=/abonnement');
  const planName = (code: string) => catalog?.plans.find((p) => p.code === code)?.name ?? code;
  const sub = status.subscription;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Mon abonnement</h1>

      {paiement === 'ok' && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
          Merci ! Votre offre s’active dès que Stripe confirme le paiement, en général en quelques secondes. Rechargez la page si elle n’apparaît pas encore.
        </p>
      )}

      <Card>
        <div className="flex items-center gap-3">
          <CardTitle>Offre {planName(status.plan)}</CardTitle>
          {sub && <Badge>{subscriptionStatusLabels[sub.status] ?? sub.status}</Badge>}
        </div>
        {sub && sub.currentPeriodEnd && sub.status !== 'canceled' && (
          <CardDescription className="mt-2">
            {sub.cancelAtPeriodEnd
              ? `Résiliation demandée : l’offre ${planName(sub.plan)} reste active jusqu’au ${day(sub.currentPeriodEnd)}, puis vous repassez à l’offre gratuite.`
              : `Prochain renouvellement le ${day(sub.currentPeriodEnd)}.`}
          </CardDescription>
        )}
        {status.licence && (
          <CardDescription className="mt-2">
            Offre {planName(status.licence.plan)} donnée par la licence de {status.licence.organization}
            {status.licence.endsAt && ` jusqu’au ${day(status.licence.endsAt)}`}.{' '}
            <Link href="/organisation" className="link">Mes organisations</Link>
            {sub && sub.status !== 'canceled' && ' Votre abonnement personnel reste facturé : résiliez-le si la licence vous suffit.'}
          </CardDescription>
        )}
        {!sub && !status.licence && <CardDescription className="mt-2">Vous utilisez l’offre gratuite.</CardDescription>}
        <div className="mt-4 flex flex-wrap gap-3">
          {status.canManage && <ManageButton />}
          {status.plan === 'free' && (
            <Link href="/tarifs" className={buttonVariants()}>Voir les offres</Link>
          )}
        </div>
        {!status.enabled && <p className="mt-3 text-sm text-muted-foreground">Le paiement en ligne n’est pas encore ouvert.</p>}
      </Card>

      {status.invoices.length > 0 && (
        <Card>
          <CardTitle>Factures</CardTitle>
          <table className="mt-3 w-full text-left text-sm">
            <tbody>
              {status.invoices.map((i) => (
                <tr key={`${i.issuedAt}-${i.amountCents}`} className="border-t">
                  <td className="py-2 pr-4">{day(i.issuedAt)}</td>
                  <td className="py-2 pr-4">{formatPrice(i.amountCents, i.currency)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{invoiceStatusLabels[i.status] ?? i.status}</td>
                  <td className="py-2">
                    {i.url && <a href={i.url} className="link" target="_blank" rel="noopener noreferrer">Voir</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
