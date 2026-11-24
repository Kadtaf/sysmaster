import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ThreadDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { ThreadView } from './thread-view';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  return apiGet<ThreadDto>(`/community/threads/${encodeURIComponent(id)}`, await serverAccessToken());
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const t = await load((await params).id);
    return { title: t ? t.title : 'Sujet introuvable' };
  } catch {
    return { title: 'Communauté' };
  }
}

export default async function ThreadPage({ params }: Props) {
  let thread: ThreadDto | null;
  try {
    thread = await load((await params).id);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  if (!thread) notFound();
  return (
    <div className="space-y-6">
      <Link href={`/communaute?category=${thread.category.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {thread.category.name}
      </Link>
      <ThreadView initial={thread} />
    </div>
  );
}
