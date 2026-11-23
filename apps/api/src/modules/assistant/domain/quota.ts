import type { GlobalRole } from '../../iam/domain/identity';

/**
 * Quota quotidien de questions. Pourquoi : chaque réponse coûte un appel au modèle ; un plafond
 * protège le budget et la plateforme contre un usage abusif. Les rôles éditoriaux, qui testent
 * l'assistant sur le contenu, ont un plafond plus haut. Les forfaits payants (Phase 5) passeront
 * par les droits (iam.entitlements), sans changer ce calcul.
 */
export function dailyQuota(roles: readonly GlobalRole[], base: number): number {
  if (roles.includes('admin')) return base * 10;
  if (roles.some((r) => r === 'author' || r === 'reviewer')) return base * 3;
  return base;
}

/** Titre d'une conversation : la première question, coupée proprement. */
export function conversationTitle(question: string): string {
  const oneLine = question.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 80) return oneLine;
  const cut = oneLine.slice(0, 80);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
}
