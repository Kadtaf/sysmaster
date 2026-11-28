import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { RevisionDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { RevisionEditor } from './revision-editor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Révision de fiche' };

export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverAccessToken();
  if (!token) redirect(`/connexion?callbackUrl=/editorial/${id}`);
  let revision: RevisionDto | null;
  try {
    revision = await apiGet<RevisionDto>(`/editorial/revisions/${id}`, token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!revision) notFound();
  return (
    <div className="space-y-4">
      <Link href="/editorial" className="text-sm link">← Rédaction</Link>
      <RevisionEditor initial={revision} />
    </div>
  );
}
