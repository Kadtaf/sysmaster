import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { ModerationItemDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import { MODERATOR_ROLES } from '@/lib/labels';
import { ModerationQueue } from './moderation-queue';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Modération' };

export default async function ModerationPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/connexion?callbackUrl=/communaute/moderation');
  if (!(session.user?.roles ?? []).some((r) => MODERATOR_ROLES.includes(r))) {
    return (
      <Card>
        <CardTitle>Modération</CardTitle>
        <CardDescription>Réservé aux modérateurs et administrateurs.</CardDescription>
      </Card>
    );
  }
  let items: ModerationItemDto[] | null;
  try {
    items = await apiGet<ModerationItemDto[]>('/community/moderation', session.accessToken);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Modération</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Contenus signalés, les plus signalés d’abord. Trois signalements de personnes différentes masquent un contenu en attendant votre
          décision. Masquer ne supprime rien : l’auteur voit le motif, et vous pouvez rétablir.
        </p>
      </div>
      <ModerationQueue initial={items ?? []} />
    </div>
  );
}
