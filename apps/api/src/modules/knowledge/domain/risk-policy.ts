import type { RiskLevel } from '@sysmaster/contracts';

/**
 * Règle P-2 « comprendre avant d'exécuter » : décidée dans le domaine, pas dans l'interface,
 * pour qu'elle s'applique de la même façon au web, au mobile et aux réponses de l'IA.
 */
const ORDER: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];

export function isAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  return ORDER.indexOf(level) >= ORDER.indexOf(threshold);
}

/** La commande est masquée tant que l'utilisateur n'a pas déplié les risques. */
export function maskedUntilRisksRead(level: RiskLevel): boolean {
  return isAtLeast(level, 'high');
}

/** Pas de copie directe pour les commandes critiques : on veut qu'elles soient tapées en connaissance de cause. */
export function copyAllowed(level: RiskLevel): boolean {
  return !isAtLeast(level, 'critical');
}
