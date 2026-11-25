/**
 * Règles de la communauté (docs/03 §2.9). Pures : le service les applique, les tests les fixent.
 * Principes : on aide sans donner de prise aux abus (pas de vote sur soi, pas d'XP auto-attribuée),
 * la modération masque sans effacer, et un contenu signalé par plusieurs personnes est mis de côté
 * en attendant un modérateur.
 */
import { hasAnyRole, type AuthenticatedUser } from '../../iam/domain/identity';

/** Signalements ouverts, de personnes différentes, qui masquent un contenu en attendant un modérateur. */
export const AUTO_HIDE_REPORTS = 3;
/** Plafonds anti-spam, par heure glissante. */
export const MAX_THREADS_PER_HOUR = 5;
export const MAX_POSTS_PER_HOUR = 30;

export interface ThreadFacts {
  authorId: string;
  kind: 'discussion' | 'question' | 'lab_share' | 'script_share';
  isLocked: boolean;
  hidden: boolean;
  acceptRewarded: boolean;
}

export function isModerator(user: Pick<AuthenticatedUser, 'roles'> | null): boolean {
  return !!user && hasAnyRole(user, ['moderator', 'admin']);
}

/** Un contenu masqué reste lisible par son auteur (qui voit pourquoi) et par les modérateurs. */
export function canSee(hidden: boolean, authorId: string, user: Pick<AuthenticatedUser, 'id' | 'roles'> | null): boolean {
  return !hidden || (!!user && (user.id === authorId || isModerator(user)));
}

/** Raison pour laquelle on ne peut pas répondre, ou null. */
export function replyBlocker(t: ThreadFacts): string | null {
  if (t.hidden) return 'Ce sujet est masqué par la modération.';
  if (t.isLocked) return 'Ce sujet est verrouillé : il n’accepte plus de réponses.';
  return null;
}

/** Seul l'auteur d'une question choisit la réponse qui l'a aidé. */
export function canAccept(t: ThreadFacts, user: Pick<AuthenticatedUser, 'id'> | null): boolean {
  return !!user && t.kind === 'question' && t.authorId === user.id && !t.hidden;
}

/** On ne vote pas pour soi-même. */
export function canVote(authorId: string, user: Pick<AuthenticatedUser, 'id'> | null): boolean {
  return !!user && user.id !== authorId;
}

/**
 * L'XP d'entraide va à l'auteur de la réponse, une seule fois par sujet, et jamais quand
 * l'auteur de la question accepte sa propre réponse.
 */
export function rewardsAcceptance(t: ThreadFacts, postAuthorId: string): boolean {
  return !t.acceptRewarded && postAuthorId !== t.authorId;
}

/** Un contenu est masqué automatiquement quand assez de personnes différentes l'ont signalé. */
export function autoHides(openReporters: number): boolean {
  return openReporters >= AUTO_HIDE_REPORTS;
}

/** Étiquettes : minuscules, sans espaces superflus, uniques, au plus 5. */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 5);
}

/** Variation de score d'un contenu quand un vote passe de `before` à `after` (-1, 0 ou 1). */
export function scoreDelta(before: number, after: number): number {
  return after - before;
}

/** Aperçu en texte brut d'un message Markdown : sans blocs de code, liens ni balisage. */
export function excerpt(md: string, max = 200): string {
  const text = md
    .replace(/```[\s\S]*?(```|$)/g, ' … ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
