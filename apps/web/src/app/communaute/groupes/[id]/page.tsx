import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { StudyGroupDetailDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { GroupView } from './group-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Groupe d’étude' };

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  let group: StudyGroupDetailDto | null;
  try {
    group = await apiGet<StudyGroupDetailDto>(`/community/groups/${encodeURIComponent((await params).id)}`, await serverAccessToken());
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!group) notFound();
  return (
    <div className="space-y-6">
      <Link href="/communaute/groupes" className="text-sm text-muted-foreground hover:text-foreground">← Groupes d’étude</Link>
      <GroupView initial={group} />
    </div>
  );
}
