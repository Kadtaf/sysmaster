'use client';

import { signIn, useSession } from 'next-auth/react';
import { useId, useState } from 'react';
import type { RedirectDto, SeatOfferDto } from '@sysmaster/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice } from '@/lib/billing';
import { ApiError, apiPost } from '@/lib/client-api';
import { organizationKindLabel } from '@/lib/labels';

const field = 'mt-1 w-full rounded-md border bg-card p-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring';

export function BuyLicenceForm({ offers, max, signedIn, initialKind }: { offers: SeatOfferDto[]; max: number; signedIn: boolean; initialKind?: string }) {
  const { data: session } = useSession();
  const [kind, setKind] = useState(offers.find((o) => o.kind === initialKind)?.kind ?? offers[0]!.kind);
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('10');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalId = useId();
  const offer = offers.find((o) => o.kind === kind)!;
  const n = Math.min(max, Math.max(1, Math.floor(Number(seats) || 0)));

  if (!signedIn) {
    return (
      <Card className="space-y-3">
        <p className="text-sm">Connectez-vous avec le compte qui gérera l’organisation.</p>
        <Button onClick={() => signIn('keycloak', { callbackUrl: '/organisation/acheter' })}>Se connecter pour acheter</Button>
      </Card>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { url } = await apiPost<RedirectDto>('/organizations/purchase', session?.accessToken, { kind, name: name.trim(), seats: n });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Paiement indisponible pour le moment.');
      setPending(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4" aria-describedby={totalId}>
        <label className="text-sm font-medium">
          Type de structure
          <select value={kind} onChange={(e) => setKind(e.target.value as SeatOfferDto['kind'])} className={field}>
            {offers.map((o) => (
              <option key={o.kind} value={o.kind}>{organizationKindLabel[o.kind]} · {formatPrice(o.unitPriceCents, o.currency)} par siège et par an</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Nom de l’organisation
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} required minLength={2} maxLength={120} autoComplete="organization" />
        </label>
        <label className="text-sm font-medium">
          Nombre de sièges (de 1 à {max}, le vôtre compris)
          <input type="number" min={1} max={max} value={seats} onChange={(e) => setSeats(e.target.value)} className={`${field} w-32`} required />
        </label>
        <p id={totalId} className="text-lg font-semibold" aria-live="polite">
          Total : {formatPrice(n * offer.unitPriceCents, offer.currency)} TTC pour 12 mois
        </p>
        <div>
          <Button type="submit" disabled={pending}>{pending ? 'Ouverture du paiement…' : 'Payer avec Stripe'}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Paiement par Stripe : SysMaster ne voit jamais votre numéro de carte. Facture au nom de l’organisation, avec votre numéro
          de TVA si vous le saisissez. La licence s’ouvre dès que Stripe confirme le paiement.
        </p>
      </form>
    </Card>
  );
}
