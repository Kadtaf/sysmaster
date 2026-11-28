/**
 * Prix des licences achetées en ligne. Une licence dure 12 mois ; des sièges ajoutés en cours de
 * licence se paient au prorata des jours restants (arrondi au centime supérieur), pour finir en même
 * temps que la licence.
 */
export const LICENCE_MONTHS = 12;
const DAY = 86_400_000;

export type SeatAction = 'new' | 'renew' | 'add_seats';

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

/** Nouvelle fin après un renouvellement : 12 mois après la fin actuelle, ou après aujourd'hui si elle est passée. */
export function renewedEnd(endsAt: Date | null, now: Date): Date {
  const from = endsAt && endsAt > now ? endsAt : now;
  return addMonths(from, LICENCE_MONTHS);
}

export function remainingDays(endsAt: Date | null, now: Date): number {
  if (!endsAt || endsAt <= now) return 0;
  return Math.ceil((endsAt.getTime() - now.getTime()) / DAY);
}

/** Prix d'un siège ajouté jusqu'à la fin de la licence (au moins 1 jour facturé). */
export function proratedSeatPrice(unitPriceCents: number, days: number): number {
  return Math.ceil((unitPriceCents * Math.max(1, Math.min(365, days))) / 365);
}

export function seatAmount(o: { action: SeatAction; seats: number; unitPriceCents: number; endsAt: Date | null; now: Date }): number {
  if (o.action !== 'add_seats') return o.seats * o.unitPriceCents;
  return o.seats * proratedSeatPrice(o.unitPriceCents, remainingDays(o.endsAt, o.now));
}

/** Raison de refuser un achat, ou null. */
export function seatPurchaseBlocker(o: {
  action: SeatAction; seats: number; used: number; licenceActive: boolean; maxSeats: number;
}): string | null {
  if (o.seats < 1 || o.seats > o.maxSeats) return `Une commande en ligne compte de 1 à ${o.maxSeats} sièges : au-delà, demandez un devis.`;
  if (o.action === 'add_seats' && !o.licenceActive) return 'La licence n’est pas en cours : renouvelez-la plutôt que d’ajouter des sièges.';
  if (o.action === 'renew' && o.seats < o.used) {
    return `${o.used} sièges sont pris (membres et invitations en attente) : renouvelez au moins ${o.used} sièges, ou retirez des membres.`;
  }
  return null;
}
