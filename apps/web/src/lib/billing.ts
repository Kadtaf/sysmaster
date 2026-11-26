/** Affichage des prix et des états d'abonnement (français). */
export function formatPrice(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

export const subscriptionStatusLabels: Record<string, string> = {
  active: 'Actif',
  trialing: 'Période d’essai',
  past_due: 'Paiement en retard : mettez à jour votre carte',
  unpaid: 'Impayé : l’offre est suspendue',
  canceled: 'Résilié',
  incomplete: 'Paiement en attente',
  incomplete_expired: 'Paiement non abouti',
  paused: 'En pause',
};

export const invoiceStatusLabels: Record<string, string> = {
  paid: 'Payée',
  open: 'À régler',
  void: 'Annulée',
  uncollectible: 'Irrécouvrable',
};
