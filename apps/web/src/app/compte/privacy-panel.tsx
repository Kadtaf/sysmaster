'use client';

import type { PrivacyStatusDto } from '@sysmaster/contracts';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { publicApiBase } from '@/lib/api';
import { apiRequest } from '@/lib/client-api';

const dateFmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/** Export de mes données (droit d'accès et portabilité) et suppression du compte (droit à l'effacement). */
export function PrivacyPanel({ status }: { status: PrivacyStatusDto }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Opération impossible');
      }
    });

  const download = () =>
    run(async () => {
      const res = await fetch(`${publicApiBase}/me/privacy/export`, { headers: { Authorization: `Bearer ${session?.accessToken}` } });
      if (!res.ok) throw new Error(`Export impossible (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sysmaster-mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    });

  const e = status.erasure;
  return (
    <div className="mt-4 space-y-6">
      <section>
        <h3 className="font-medium">Télécharger mes données</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Un fichier JSON avec tout ce que SysMaster conserve sur vous : profil, progression, labs, examens, certificats,
          messages, conversations avec l&apos;assistant. Il ne contient rien sur les autres membres.
        </p>
        <Button variant="outline" size="sm" className="mt-3" disabled={pending} onClick={download}>
          <Download className="size-4" aria-hidden /> Télécharger (JSON)
        </Button>
      </section>

      <section>
        <h3 className="font-medium">Supprimer mon compte</h3>
        {e.status === 'scheduled' ? (
          <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:bg-red-950/30">
            <p>
              Suppression prévue le <strong>{dateFmt(e.dueAt)}</strong>. Jusque-là, vous pouvez changer d&apos;avis.
            </p>
            {e.cancellable && (
              <Button variant="outline" size="sm" className="mt-3" disabled={pending}
                onClick={() => run(() => apiRequest('DELETE', '/me/privacy/erasure', session?.accessToken))}>
                Annuler la suppression
              </Button>
            )}
          </div>
        ) : (
          <form
            className="mt-2 space-y-3 text-sm"
            onSubmit={(ev) => {
              ev.preventDefault();
              run(() => apiRequest('POST', '/me/privacy/erasure', session?.accessToken, { confirmation }));
            }}
          >
            <p className="text-muted-foreground">
              Vos données personnelles seront effacées {status.graceDays} jours après la demande : progression, labs, examens,
              certificats (qui ne seront plus vérifiables), messages privés, conversations. Vos sujets et réponses publics
              restent pour ne pas casser les discussions, signés « Compte supprimé ». Téléchargez vos données avant si
              vous voulez les garder.
            </p>
            <p className="text-muted-foreground">
              Un abonnement en cours est résilié le jour de la suppression, sans remboursement de la période entamée, et une
              tentative d&apos;examen payée mais pas utilisée est perdue. Vos factures sont gardées dix ans, comme la loi
              l&apos;impose pour les pièces comptables.
            </p>
            <label className="block">
              Pour confirmer, saisissez <code className="font-mono">{status.confirmation}</code>
              <input
                value={confirmation}
                onChange={(ev) => setConfirmation(ev.target.value)}
                className="mt-1 block w-full max-w-xs rounded-md border bg-background px-3 py-2 font-mono"
                autoComplete="off"
              />
            </label>
            <Button type="submit" size="sm" className="bg-red-600 text-white hover:bg-red-700"
              disabled={pending || confirmation.trim() !== status.confirmation}>
              Demander la suppression
            </Button>
          </form>
        )}
      </section>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
