/**
 * Contact commercial (devis, grands comptes, bon de commande), à renseigner au déploiement
 * (NEXT_PUBLIC_SALES_CONTACT : adresse e-mail). Tant qu'il manque, la page le dit.
 */
export const salesContact = process.env.NEXT_PUBLIC_SALES_CONTACT?.trim() || null;
