import type { Metadata } from 'next';
import Link from 'next/link';
import type { BillingCatalogDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { SalesContact } from '@/components/sales-contact';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { BuyLicenceForm } from './buy-licence-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Acheter une licence' };

export default async function BuyLicencePage({ searchParams }: { searchParams: Promise<{ paiement?: string; type?: string }> }) {
  const { paiement, type } = await searchParams;
  let catalog: BillingCatalogDto | null;
  try {
    catalog = await apiGet<BillingCatalogDto>('/billing/plans');
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!catalog) return <ApiUnavailable />;
  const signedIn = Boolean(await serverAccessToken());

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/tarifs" className="text-sm text-muted-foreground hover:text-foreground">← Tarifs</Link>
        <h1 className="mt-2 text-3xl font-bold">Acheter une licence pour votre structure</h1>
        <p className="mt-2 text-muted-foreground">
          Chaque siège donne l’accès Pro à une personne pendant 12 mois. Vous devenez gestionnaire de l’organisation et invitez
          vos membres par e-mail ; vous pourrez ajouter des sièges ou renouveler depuis sa page.
        </p>
      </div>
      {paiement === 'annule' && <p role="status" className="rounded-md border p-3 text-sm">Paiement annulé : rien n’a été débité.</p>}
      {catalog.seatOffers.length === 0 ? (
        <Card>
          <CardTitle>Licences sur devis</CardTitle>
          <CardDescription>
            L’achat en ligne n’est pas encore ouvert. Pour un devis, écrivez-nous : <SalesContact />.
          </CardDescription>
        </Card>
      ) : (
        <BuyLicenceForm offers={catalog.seatOffers} max={catalog.onlineSeatMax} signedIn={signedIn} initialKind={type} />
      )}
      <p className="text-sm text-muted-foreground">
        Plus de {catalog.onlineSeatMax} sièges, connexion unique (SSO), paiement sur bon de commande ou mandat administratif :
        demandez un devis à <SalesContact />.
      </p>
    </div>
  );
}
