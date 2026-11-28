import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import type { AdminOrganizationDto, BillingCatalogDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import { AdminOrganisations } from './admin-organisations';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Licences des organisations', robots: { index: false } };

export default async function AdminOrganisationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error) redirect('/connexion?callbackUrl=/admin/organisations');
  if (!session.user?.roles?.some((r) => r === 'admin' || r === 'super_admin')) notFound();
  let orgs: AdminOrganizationDto[] | null;
  let catalog: BillingCatalogDto | null;
  try {
    [orgs, catalog] = await Promise.all([
      apiGet<AdminOrganizationDto[]>('/admin/organizations', session.accessToken),
      apiGet<BillingCatalogDto>('/billing/plans'),
    ]);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  const seatPlans = (catalog?.plans ?? []).filter((p) => p.perSeat).map((p) => ({ code: p.code, name: p.name, priceCents: p.priceCents }));
  return <AdminOrganisations organizations={orgs ?? []} seatPlans={seatPlans} paymentEnabled={catalog?.enabled ?? false} />;
}
