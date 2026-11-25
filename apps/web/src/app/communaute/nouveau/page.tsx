import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { CommunityCategoryDto, LabSummaryDto, ThreadKind } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { NewThreadForm } from './new-thread-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Publier dans la communauté' };
const KIND_BY_TYPE: Record<string, ThreadKind> = { script: 'script_share', lab: 'lab_share', discussion: 'discussion' };

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ category?: string; type?: string }> }) {
  const sp = await searchParams;
  if (!(await serverAccessToken())) redirect('/connexion?callbackUrl=/communaute/nouveau');
  let categories: CommunityCategoryDto[] | null;
  let labs: LabSummaryDto[] | null;
  try {
    [categories, labs] = await Promise.all([apiGet<CommunityCategoryDto[]>('/community/categories'), apiGet<LabSummaryDto[]>('/labs')]);
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Publier dans la communauté</h1>
        <p className="mt-2 text-muted-foreground">
          Une question bien posée obtient une réponse plus vite : le système, ce que vous avez essayé, le message d’erreur exact.
          Masquez les mots de passe, adresses IP publiques et noms internes avant de coller un journal.
        </p>
      </div>
      <NewThreadForm
        categories={categories ?? []}
        initialCategory={sp.category}
        initialKind={KIND_BY_TYPE[sp.type ?? '']}
        labs={(labs ?? []).map((l) => ({ slug: l.slug, title: l.title }))}
      />
    </div>
  );
}
