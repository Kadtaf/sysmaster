import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { CommunityCategoryDto } from '@sysmaster/contracts';
import { ApiUnavailable } from '@/components/api-unavailable';
import { apiGet, ApiUnavailableError } from '@/lib/api';
import { serverAccessToken } from '@/lib/session';
import { NewThreadForm } from './new-thread-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Poser une question' };

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  if (!(await serverAccessToken())) redirect('/connexion?callbackUrl=/communaute/nouveau');
  let categories: CommunityCategoryDto[] | null;
  try {
    categories = await apiGet<CommunityCategoryDto[]>('/community/categories');
  } catch (e) {
    if (e instanceof ApiUnavailableError) return <ApiUnavailable />;
    throw e;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Poser une question</h1>
        <p className="mt-2 text-muted-foreground">
          Une question bien posée obtient une réponse plus vite : le système, ce que vous avez essayé, le message d’erreur exact.
          Masquez les mots de passe, adresses IP publiques et noms internes avant de coller un journal.
        </p>
      </div>
      <NewThreadForm categories={categories ?? []} initialCategory={(await searchParams).category} />
    </div>
  );
}
