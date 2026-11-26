import { aiDailyCap, aiQuestionsPerDay, checkoutBlocker, effectivePlan, isStale, parsePriceMap, UNLIMITED_FAIR_USE } from './billing';

const sub = (plan: string, status: Parameters<typeof effectivePlan>[0][number]['status']) => ({ plan, status, currentPeriodEnd: null });

describe('facturation', () => {
  it('offre effective : abonnement en règle, sinon gratuite', () => {
    expect(effectivePlan([])).toBe('free');
    expect(effectivePlan([sub('pro', 'active')])).toBe('pro');
    expect(effectivePlan([sub('premium', 'trialing')])).toBe('premium');
    // Carte refusée : l'accès reste pendant les relances.
    expect(effectivePlan([sub('premium', 'past_due')])).toBe('premium');
    expect(effectivePlan([sub('pro', 'canceled'), sub('premium', 'unpaid')])).toBe('free');
    expect(effectivePlan([sub('pro', 'incomplete')])).toBe('free');
  });

  it('quota IA de l’offre, illimité borné par l’usage raisonnable', () => {
    expect(aiQuestionsPerDay({ 'ai.questions_per_day': 10 })).toBe(10);
    expect(aiQuestionsPerDay({ 'ai.questions_per_day': 'unlimited' })).toBeNull();
    expect(aiQuestionsPerDay({})).toBe(0);
    expect(aiDailyCap({ 'ai.questions_per_day': 'unlimited' })).toBe(UNLIMITED_FAIR_USE);
  });

  it('paiement refusé : fermé, prix manquant, abonnement déjà ouvert', () => {
    expect(checkoutBlocker({ enabled: false, priceId: 'price_1', open: [] })).toMatch(/pas encore ouvert/);
    expect(checkoutBlocker({ enabled: true, priceId: null, open: [] })).toMatch(/en ligne/);
    expect(checkoutBlocker({ enabled: true, priceId: 'price_1', open: [sub('premium', 'past_due')] })).toMatch(/déjà un abonnement/);
    expect(checkoutBlocker({ enabled: true, priceId: 'price_1', open: [sub('premium', 'canceled')] })).toBeNull();
  });

  it('STRIPE_PRICES : paires offre:prix, entrées douteuses ignorées', () => {
    const m = parsePriceMap(' premium:price_ABC , pro:price_123,bad,entreprise:prod_x,');
    expect([...m]).toEqual([['premium', 'price_ABC'], ['pro', 'price_123']]);
    expect(parsePriceMap(undefined).size).toBe(0);
  });

  it('un événement plus ancien que la ligne est ignoré', () => {
    expect(isStale(null, new Date(1))).toBe(false);
    expect(isStale(new Date(2000), new Date(1000))).toBe(true);
    expect(isStale(new Date(1000), new Date(1000))).toBe(false);
  });
});
