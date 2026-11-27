/**
 * Règles de facturation (docs/03 §2.11). Pur : aucune dépendance à Stripe ni à la base.
 */
import type { SubscriptionStatus } from '@sysmaster/contracts';

export const FREE_PLAN = 'free';

/**
 * États qui donnent accès à l'offre payée. « past_due » garde l'accès pendant les relances de
 * Stripe (environ trois semaines) : couper au premier refus de carte punirait une carte expirée.
 */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

/** Un abonnement qui n'est pas terminé : en souscrire un second ferait payer deux fois. */
export const OPEN_STATUSES: readonly SubscriptionStatus[] = [...ENTITLED_STATUSES, 'incomplete', 'unpaid', 'paused'];

export interface SubscriptionState {
  plan: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

/** Offre qui s'applique : celle d'un abonnement en règle, sinon l'offre gratuite. */
export function effectivePlan(subscriptions: readonly SubscriptionState[]): string {
  const entitled = subscriptions.find((s) => ENTITLED_STATUSES.includes(s.status));
  return entitled?.plan ?? FREE_PLAN;
}

/** Plafond « illimité » d'usage raisonnable : protège le budget IA contre un script. */
export const UNLIMITED_FAIR_USE = 500;

/** Questions à l'IA par jour d'une offre (null : pas de plafond dans l'offre). */
export function aiQuestionsPerDay(features: Record<string, unknown>): number | null {
  const v = features['ai.questions_per_day'];
  if (v === 'unlimited') return null;
  return typeof v === 'number' && v >= 0 ? v : 0;
}

export function certificationDiscountPct(features: Record<string, unknown>): number {
  const v = features['certifications.discount_pct'];
  return typeof v === 'number' && v > 0 && v <= 100 ? v : 0;
}

/** Plafond appliqué par le quota IA : null (offre illimitée) devient le plafond d'usage raisonnable. */
export function aiDailyCap(features: Record<string, unknown>): number {
  return aiQuestionsPerDay(features) ?? UNLIMITED_FAIR_USE;
}

/** Pourquoi le paiement est refusé, ou null. */
export function checkoutBlocker(opts: { enabled: boolean; priceId: string | null; open: readonly SubscriptionState[] }): string | null {
  if (!opts.enabled) return 'Le paiement en ligne n’est pas encore ouvert.';
  if (!opts.priceId) return 'Cette offre ne peut pas encore être souscrite en ligne.';
  if (opts.open.some((s) => OPEN_STATUSES.includes(s.status))) {
    return 'Vous avez déjà un abonnement : changez d’offre ou résiliez depuis « Gérer mon abonnement ».';
  }
  return null;
}

/**
 * Correspondance offre ↔ prix Stripe, lue dans STRIPE_PRICES (« premium:price_…,pro:price_… »).
 * Les prix vivent dans Stripe : la base ne garde que l'affichage.
 */
export function parsePriceMap(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (raw ?? '').split(',')) {
    const [plan, price] = pair.split(':').map((s) => s?.trim());
    if (plan && price && /^price_[A-Za-z0-9]+$/.test(price)) map.set(plan, price);
  }
  return map;
}

/** Le plus récent l'emporte : un webhook en retard ne doit pas défaire un état plus neuf. */
export function isStale(lastEventAt: Date | null, eventAt: Date): boolean {
  return lastEventAt !== null && eventAt < lastEventAt;
}

/** Prix d'un examen après la remise de l'offre, arrondi au centime. */
export function examPrice(listCents: number, discountPct: number): number {
  const pct = Math.min(100, Math.max(0, discountPct));
  return Math.round((listCents * (100 - pct)) / 100);
}

/**
 * Un examen se paie seulement si le paiement est ouvert et que son prix (après remise) n'est pas nul.
 * Paiement fermé : les examens restent ouverts comme avant, rien n'est durci.
 */
export function examPaymentRequired(enabled: boolean, amountCents: number): boolean {
  return enabled && amountCents > 0;
}
