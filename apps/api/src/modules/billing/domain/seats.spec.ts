import { addMonths, proratedSeatPrice, remainingDays, renewedEnd, seatAmount, seatPurchaseBlocker } from './seats';

const now = new Date('2026-11-28T12:00:00Z');

describe('licences achetées en ligne', () => {
  it('renouvelle à partir de la fin en cours, ou d’aujourd’hui si elle est passée', () => {
    expect(renewedEnd(new Date('2027-03-01T00:00:00Z'), now).toISOString()).toBe('2028-03-01T00:00:00.000Z');
    expect(renewedEnd(new Date('2026-01-01T00:00:00Z'), now).toISOString()).toBe('2027-11-28T12:00:00.000Z');
    expect(renewedEnd(null, now)).toEqual(addMonths(now, 12));
  });

  it('nouvelle licence et renouvellement : prix plein par siège', () => {
    expect(seatAmount({ action: 'new', seats: 10, unitPriceCents: 9900, endsAt: null, now })).toBe(99_000);
    expect(seatAmount({ action: 'renew', seats: 3, unitPriceCents: 9900, endsAt: now, now })).toBe(29_700);
  });

  it('sièges ajoutés : au prorata des jours restants, arrondi au centime supérieur', () => {
    const endsAt = new Date(now.getTime() + 73 * 86_400_000); // 73 jours = 1/5 d'année
    expect(remainingDays(endsAt, now)).toBe(73);
    expect(proratedSeatPrice(10_000, 73)).toBe(2000);
    expect(proratedSeatPrice(9900, 1)).toBe(28);
    expect(seatAmount({ action: 'add_seats', seats: 2, unitPriceCents: 10_000, endsAt, now })).toBe(4000);
    expect(remainingDays(new Date('2026-01-01T00:00:00Z'), now)).toBe(0);
  });

  it('refus : trop de sièges, ajout sans licence en cours, renouvellement sous le nombre de sièges pris', () => {
    const base = { seats: 5, used: 3, licenceActive: true, maxSeats: 50 };
    expect(seatPurchaseBlocker({ ...base, action: 'new' })).toBeNull();
    expect(seatPurchaseBlocker({ ...base, action: 'new', seats: 51 })).toMatch(/devis/);
    expect(seatPurchaseBlocker({ ...base, action: 'add_seats', licenceActive: false })).toMatch(/renouvelez/);
    expect(seatPurchaseBlocker({ ...base, action: 'renew', seats: 2 })).toMatch(/au moins 3/);
    expect(seatPurchaseBlocker({ ...base, action: 'renew', seats: 3 })).toBeNull();
  });
});
