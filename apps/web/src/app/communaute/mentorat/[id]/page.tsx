import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { MentorDto, MentorshipDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { mentorshipStatusLabel as statusLabel } from '@/lib/labels';
import { serverAccessToken } from '@/lib/session';
import { MessagesPanel } from '../../messages-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mentorat' };

export default async function MentorshipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await serverAccessToken();
  if (!token) redirect(`/connexion?callbackUrl=/communaute/mentorat/${id}`);
  let mine: { mentor: MentorDto | null; items: MentorshipDto[] } | null;
  try {
    mine = await apiGet('/community/mentorships', token);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  const m = mine?.items.find((x) => x.id === id);
  if (!m || m.status === 'declined') notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/communaute/mentorat" className="text-sm text-muted-foreground hover:text-foreground">← Mentorat</Link>
      <div>
        <Badge>{statusLabel[m.status]}</Badge>
        <h1 className="mt-2 text-2xl font-bold">{m.topic}</h1>
        <p className="text-muted-foreground">{m.role === 'mentor' ? `Vous accompagnez ${m.other.displayName}` : `Votre mentor : ${m.other.displayName}`}</p>
      </div>
      <Card>
        {m.status !== 'active' && <CardDescription className="mb-4">Ce mentorat n’est pas en cours : les échanges restent lisibles, sans nouvel envoi.</CardDescription>}
        <MessagesPanel path={`/community/mentorships/${m.id}/messages`} emptyText="Aucun échange pour l’instant : convenez d’un premier objectif et d’un rythme." />
      </Card>
    </div>
  );
}
