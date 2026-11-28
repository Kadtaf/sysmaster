'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import type { LicenceOfferDto, RedirectDto } from '@sysmaster/contracts';
import { SalesContact } from '@/components/sales-contact';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatPrice } from '@/lib/billing';
import { ApiError, apiPost } from '@/lib/client-api';

const field = 'mt-1 w-28 rounded-md border bg-card p-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring';
const longDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' });

/** Renouveler la licence ou ajouter des sièges, payé par Stripe (gestionnaires). */
export function LicencePurchase({ orgId, offer, endsAt }: { orgId: string; offer: LicenceOfferDto; endsAt: string | null }) {
  const { data: session } = useSession();
  const [renewSeats, setRenewSeats] = useState(String(offer.renew.minSeats));
  const [addSeats, setAddSeats] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!offer.purchasable || offer.unitPriceCents === null) {
    return (
      <Card>
        <CardTitle>Licence</CardTitle>
        <CardDescription>Pour ajouter des sièges ou prolonger la licence, écrivez-nous : <SalesContact subject="Licence SysMaster : sièges ou prolongation" />.</CardDescription>
      </Card>
    );
  }

  const clamp = (v: string, min: number) => Math.min(offer.maxSeats, Math.max(min, Math.floor(Number(v) || 0)));
  const nRenew = clamp(renewSeats, offer.renew.minSeats);
  const nAdd = clamp(addSeats, 1);

  const pay = async (body: { action: 'renew' | 'add_seats'; seats: number }) => {
    setPending(true);
    setError(null);
    try {
      const { url } = await apiPost<RedirectDto>(`/organizations/${orgId}/purchase`, session?.accessToken, body);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Paiement indisponible pour le moment.');
      setPending(false);
    }
  };

  return (
    <Card className="space-y-5">
      <div>
        <CardTitle>Licence</CardTitle>
        <CardDescription>
          {formatPrice(offer.unitPriceCents, offer.currency)} TTC par siège et par an, payé par Stripe.
          Au-delà de {offer.maxSeats} sièges par commande : <SalesContact subject="Licence SysMaster : devis" />.
        </CardDescription>
      </div>

      {offer.addSeats && endsAt && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void pay({ action: 'add_seats', seats: nAdd }); }}>
          <label className="text-sm font-medium">
            Sièges à ajouter jusqu’au {longDate(endsAt)}
            <input type="number" min={1} max={offer.maxSeats} value={addSeats} onChange={(e) => setAddSeats(e.target.value)} className={`${field} block`} />
          </label>
          <p className="text-sm" aria-live="polite">
            {formatPrice(nAdd * offer.addSeats.pricePerSeatCents, offer.currency)} ({offer.addSeats.remainingDays} jours restants, au prorata)
          </p>
          <Button type="submit" variant="outline" disabled={pending}>Ajouter et payer</Button>
        </form>
      )}

      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void pay({ action: 'renew', seats: nRenew }); }}>
        <label className="text-sm font-medium">
          Renouveler pour 12 mois, jusqu’au {longDate(offer.renew.newEndsAt)}
          <input type="number" min={offer.renew.minSeats} max={offer.maxSeats} value={renewSeats} onChange={(e) => setRenewSeats(e.target.value)} className={`${field} block`} />
        </label>
        <p className="text-sm" aria-live="polite">{formatPrice(nRenew * offer.unitPriceCents, offer.currency)} pour {nRenew} siège{nRenew > 1 ? 's' : ''}</p>
        <Button type="submit" variant="outline" disabled={pending}>Renouveler et payer</Button>
      </form>
      {offer.renew.minSeats > 1 && (
        <p className="text-xs text-muted-foreground">Au moins {offer.renew.minSeats} sièges : ce sont ceux déjà pris par les membres et les invitations en attente.</p>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}
