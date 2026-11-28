import type { Metadata } from 'next';
import { Unsubscribe } from './unsubscribe';

export const metadata: Metadata = { title: 'Se désabonner des e-mails', robots: { index: false } };

type Props = { searchParams: Promise<{ token?: string }> };

/**
 * Lien de désabonnement des e-mails. On demande un clic : un simple affichage de la page (par un
 * antivirus qui suit les liens, par exemple) ne désabonne personne.
 */
export default async function UnsubscribePage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Se désabonner</h1>
      <Unsubscribe token={token ?? ''} />
    </div>
  );
}
