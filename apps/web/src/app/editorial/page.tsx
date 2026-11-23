import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { RevisionSummaryDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ApiUnavailableError, apiGet } from '@/lib/api';
import { authOptions } from '@/lib/auth';
import { EDITORIAL_ROLES, revisionStatusMeta } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { NewRevision } from './new-revision';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Rédaction' };

export default async function EditorialPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/connexion?callbackUrl=/editorial');
  const roles = session.user?.roles ?? [];
  if (!roles.some((r) => EDITORIAL_ROLES.includes(r))) {
    return (
      <Card>
        <CardTitle>Espace de rédaction</CardTitle>
        <CardDescription>
          Réservé aux auteurs, relecteurs et administrateurs. Pour contribuer aux fiches, demandez le rôle « author » à un administrateur.
        </CardDescription>
      </Card>
    );
  }

  let revisions: RevisionSummaryDto[] | null;
  try {
    revisions = await apiGet<RevisionSummaryDto[]>('/editorial/revisions', session.accessToken);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  const canWrite = roles.some((r) => ['author', 'admin', 'super_admin'].includes(r));
  const isReviewer = roles.some((r) => ['reviewer', 'admin', 'super_admin'].includes(r));
  const list = revisions ?? [];
  const toReview = list.filter((r) => r.status === 'in_review');
  const others = list.filter((r) => r.status !== 'in_review');

  const Row = ({ r }: { r: RevisionSummaryDto }) => (
    <li>
      <Link href={`/editorial/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 hover:bg-muted">
        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', revisionStatusMeta[r.status]?.className)}>
          {revisionStatusMeta[r.status]?.label ?? r.status}
        </span>
        <span className="font-medium">{r.name || 'Sans titre'}</span>
        <code className="font-mono text-xs text-muted-foreground">{r.commandSlug || '—'}</code>
        <span className="text-xs text-muted-foreground">{r.isNew ? 'nouvelle fiche' : 'modification'}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {r.author} · {new Date(r.updatedAt).toLocaleDateString('fr-FR')}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Rédaction</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Une fiche passe par trois étapes : brouillon, relecture par une autre personne, publication. La version en ligne
          ne change qu&apos;à l&apos;approbation, et une fiche n&apos;est publiable que si elle explique pourquoi, quand, dans quel
          contexte, avec quels risques et quelles alternatives.
        </p>
      </div>

      {canWrite && <NewRevision />}

      {isReviewer && (
        <Card>
          <CardTitle>À relire ({toReview.length})</CardTitle>
          {toReview.length ? (
            <ul className="mt-3 space-y-1">{toReview.map((r) => <Row key={r.id} r={r} />)}</ul>
          ) : (
            <CardDescription>Aucune révision en attente de relecture.</CardDescription>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>{isReviewer ? 'Toutes les révisions' : 'Mes révisions'}</CardTitle>
        {others.length ? (
          <ul className="mt-3 space-y-1">{others.map((r) => <Row key={r.id} r={r} />)}</ul>
        ) : (
          <CardDescription>Aucune révision pour l&apos;instant.</CardDescription>
        )}
      </Card>
    </div>
  );
}
