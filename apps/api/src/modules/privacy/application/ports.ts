import type { BillingClosure } from '../../billing/application/billing.service';
import type { ErasureState } from '../domain/privacy';

export interface RetentionResult {
  [what: string]: number;
}

/** Ce que l'effacement d'un compte doit faire hors de la base. */
export interface ErasureHooks {
  /** Suppression chez le fournisseur d'identité ; false si elle reste à faire. */
  idpDelete(subject: string): Promise<boolean>;
  /** Résiliation des abonnements et remboursement des examens non utilisés ; renvoie ce qui reste à faire. */
  closeBilling(userId: string): Promise<BillingClosure>;
}

export abstract class PrivacyRepository {
  abstract state(userId: string): Promise<ErasureState>;
  /** Toutes les données personnelles de l'utilisateur, par rubrique. */
  abstract exportData(userId: string): Promise<Record<string, unknown>>;
  abstract scheduleErasure(userId: string, requestedAt: Date, dueAt: Date): Promise<boolean>;
  abstract cancelErasure(userId: string): Promise<boolean>;
  /** Demandes arrivées à échéance, verrouillées pour cette exécution (plusieurs instances possibles). */
  abstract erase(now: Date, limit: number, hooks: ErasureHooks): Promise<number>;
  /** Relance la suppression des comptes Keycloak restés en attente (client d'administration ajouté après coup, panne). */
  abstract retryIdentityDeletion(idpDelete: (subject: string) => Promise<boolean>): Promise<number>;
  /** Relance ce qui est resté à faire chez Stripe après un effacement (résiliations, remboursements). */
  abstract retryBillingClosure(finish: (todo: BillingClosure) => Promise<BillingClosure>): Promise<number>;
  abstract applyRetention(now: Date): Promise<RetentionResult>;
}

/**
 * Suppression du compte chez le fournisseur d'identité (Keycloak). Renvoie false si elle n'a pas
 * pu être faite automatiquement : un administrateur doit alors la faire (docs/08 §RGPD).
 */
export abstract class IdentityAdmin {
  abstract deleteUser(subject: string): Promise<boolean>;
}
