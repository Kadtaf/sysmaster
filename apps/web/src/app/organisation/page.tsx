import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { OrganizationSummaryDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { licenceStateLabel, organizationKindLabel, organizationRoleLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mes organisations' };

export default async function OrganisationsPage({ searchParams }: { searchParams: Promise<{ paiement?: string }> }) {
  const { paiement } = await searchParams;
  const token = await serverAccessToken();
  if (!token) redirect('/connexion?callbackUrl=/organisation');
  let orgs: OrganizationSummaryDto[] | null;
  try {
    orgs = await apiGet<OrganizationSummaryDto[]>('/organizations/mine', token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!orgs) redirect('/connexion?callbackUrl=/organisation');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mes organisations</h1>
        <p className="mt-2 text-muted-foreground">
          Les licences d’entreprise, de centre de formation, d’école ou d’université dont vous faites partie.
        </p>
      </div>
      {paiement === 'ok' && (
        <p role="status" className="rounded-md border p-3 text-sm">
          Paiement reçu. La licence s’ouvre dès que Stripe le confirme, en général en quelques secondes : actualisez la page si
          elle n’apparaît pas encore. La facture est envoyée à l’adresse saisie au paiement.
        </p>
      )}
      {orgs.length === 0 ? (
        <Card>
          <CardTitle>Aucune organisation</CardTitle>
          <CardDescription>
            Votre entreprise ou votre école vous envoie une invitation par e-mail. Pour une licence pour votre structure,
            voyez les <Link href="/tarifs" className="link">tarifs</Link> : achat en ligne ou sur devis.
          </CardDescription>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link href={`/organisation/${o.id}`} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{o.name}</CardTitle>
                    <Badge>{organizationKindLabel[o.kind]}</Badge>
                  </div>
                  <CardDescription>
                    {organizationRoleLabel[o.role]} · {licenceStateLabel[o.licence.state]}
                    {o.licence.endsAt && o.licence.state === 'active' && ` jusqu’au ${new Date(o.licence.endsAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}`}
                  </CardDescription>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
