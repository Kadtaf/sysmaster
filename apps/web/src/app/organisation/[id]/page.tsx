import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { LicenceOfferDto, OrganizationDetailDto, OrganizationProgressDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { OrganisationView } from './organisation-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organisation' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ paiement?: string }> };

export default async function OrganisationPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { paiement } = await searchParams;
  const token = await serverAccessToken();
  if (!token) redirect(`/connexion?callbackUrl=/organisation/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let org: OrganizationDetailDto | null;
  let progress: OrganizationProgressDto | null = null;
  let offer: LicenceOfferDto | null = null;
  let me: { id: string } | null;
  try {
    [org, me] = await Promise.all([apiGet<OrganizationDetailDto>(`/organizations/${id}`, token), apiGet<{ id: string }>('/me', token)]);
    if (org && (org.canManage || org.role === 'instructor')) progress = await apiGet<OrganizationProgressDto>(`/organizations/${id}/progress`, token);
    if (org?.canManage) offer = await apiGet<LicenceOfferDto>(`/organizations/${id}/licence-offer`, token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!org || !me) notFound();
  return <OrganisationView org={org} progress={progress} myId={me.id} offer={offer} payment={paiement ?? null} />;
}
