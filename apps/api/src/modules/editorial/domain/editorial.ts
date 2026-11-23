import type { CommandContent, ContentIssue, RevisionStatus, RiskLevel } from '@sysmaster/contracts';
import { hasAnyRole, type AuthenticatedUser } from '../../iam/domain/identity';
import { isAtLeast } from '../../knowledge/domain/risk-policy';

/**
 * Règles éditoriales des fiches commandes. Pur : aucune base, aucun framework.
 *
 * Une fiche n'est publiable que si elle respecte P-1 (« comprendre avant d'exécuter ») : pourquoi,
 * comment, quand, contexte, risques et alternatives, plus au moins un exemple expliqué et une source.
 */

const label: Record<RiskLevel, string> = { none: 'aucun', low: 'faible', medium: 'moyen', high: 'élevé', critical: 'critique' };

export function contentIssues(c: CommandContent, knownSlugs: ReadonlySet<string>): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const need = (field: string, value: string | null | undefined, message: string) => {
    if (!value || !value.trim()) issues.push({ field, message });
  };
  need('slug', c.slug, 'Identifiant d’URL manquant (ex. « linux-systemctl »).');
  need('name', c.name, 'Nom de la commande manquant.');
  need('summary', c.summary, 'Utilité manquante : à quoi sert la commande, en une phrase.');
  need('syntax', c.syntax, 'Syntaxe manquante : comment on l’écrit.');
  need('why', c.why, 'Pourquoi manquant : quel problème la commande résout.');
  need('whenToUse', c.whenToUse, 'Quand manquant : dans quelles situations l’utiliser (et ne pas l’utiliser).');
  need('context', c.context, 'Contexte manquant : prérequis, environnement, droits nécessaires.');

  if (c.risks.length === 0) {
    issues.push({ field: 'risks', message: 'Aucun risque décrit. Même une commande sans danger en a un mot (« aucun : lecture seule »).' });
  }
  const highestRisk = c.risks.reduce<RiskLevel>((max, r) => (isAtLeast(r.level, max) ? r.level : max), 'none');
  if (!isAtLeast(c.riskLevel, highestRisk)) {
    issues.push({ field: 'riskLevel', message: `Le niveau de la fiche (${label[c.riskLevel]}) est inférieur à son risque le plus grave (${label[highestRisk]}).` });
  }
  for (const p of c.parameters) {
    if (!isAtLeast(c.riskLevel, p.riskLevel)) {
      issues.push({ field: 'riskLevel', message: `Le paramètre « ${p.flag} » est de risque ${label[p.riskLevel]} : la fiche ne peut pas être classée plus bas.` });
    }
  }
  if (isAtLeast(c.riskLevel, 'high') && c.commonErrors.length === 0) {
    issues.push({ field: 'commonErrors', message: 'Une commande à risque élevé ou critique doit décrire au moins une erreur fréquente et comment la corriger.' });
  }
  if (c.examples.length === 0) issues.push({ field: 'examples', message: 'Ajoutez au moins un exemple expliqué.' });
  if (c.alternatives.length === 0) {
    issues.push({ field: 'alternatives', message: 'Ajoutez au moins une alternative et quand la préférer.' });
  }
  for (const a of c.alternatives) {
    if (a.slug === c.slug) issues.push({ field: 'alternatives', message: 'Une fiche ne peut pas être sa propre alternative.' });
    else if (!knownSlugs.has(a.slug)) issues.push({ field: 'alternatives', message: `L’alternative « ${a.slug} » n’est pas une fiche publiée.` });
  }
  if (c.sources.length === 0) issues.push({ field: 'sources', message: 'Citez au moins une source officielle (règle P-4).' });
  return issues;
}

export class EditorialError extends Error {
  constructor(
    readonly code: 'forbidden' | 'invalid_state' | 'incomplete' | 'own_revision',
    message: string,
    readonly issues: ContentIssue[] = [],
  ) {
    super(message);
  }
}

export interface RevisionState {
  status: RevisionStatus;
  authorId: string;
}

type User = Pick<AuthenticatedUser, 'id' | 'roles'>;

const isEditor = (u: User) => hasAnyRole(u, ['author', 'admin']);
const isReviewer = (u: User) => hasAnyRole(u, ['reviewer', 'admin']);
const isOpen = (s: RevisionStatus) => s === 'draft' || s === 'changes_requested';

export function canCreate(user: User): boolean {
  return isEditor(user);
}

export function permissions(r: RevisionState, user: User) {
  const own = r.authorId === user.id;
  return {
    edit: own && isOpen(r.status),
    submit: own && isOpen(r.status),
    // Quatre yeux : personne, pas même un administrateur, n'approuve sa propre révision.
    review: !own && isReviewer(user) && r.status === 'in_review',
    withdraw: (own || hasAnyRole(user, ['admin'])) && (isOpen(r.status) || r.status === 'in_review'),
  };
}

/** Qui peut lire une révision : son auteur, les relecteurs et les administrateurs. */
export function canRead(r: RevisionState, user: User): boolean {
  return r.authorId === user.id || isReviewer(user);
}

export function assertCan(allowed: boolean, r: RevisionState, user: User, action: string): void {
  if (allowed) return;
  if (action === 'review' && r.authorId === user.id) {
    throw new EditorialError('own_revision', 'Vous ne pouvez pas relire votre propre révision : un second regard est la raison d’être de la relecture.');
  }
  if (!canRead(r, user) || (action === 'review' && !isReviewer(user))) {
    throw new EditorialError('forbidden', 'Action réservée à l’auteur de la révision ou aux relecteurs.');
  }
  throw new EditorialError('invalid_state', `Action impossible : la révision est à l’état « ${r.status} ».`);
}

