import type { AgentProfileContent, ContentIssue } from '@sysmaster/contracts';

/**
 * Profils que le service IA sait choisir aujourd'hui (routeur : mission + domaine). Un autre profil
 * peut être rédigé, mais ne servirait à rien tant que le routeur ne sait pas l'utiliser.
 */
export const ROUTED_PROFILES = ['tutor', 'diagnostician', 'windows_expert', 'linux_expert', 'devops_expert', 'network_expert'] as const;

/** Balises qui délimitent le contexte envoyé au modèle : un profil ne doit pas pouvoir les imiter. */
const DELIMITERS = /<\/?\s*(documents|historique|question|journal|description)\s*>/i;

/**
 * Règles de publication d'un profil. Le socle de sécurité (comprendre avant d'exécuter, citations,
 * risques) reste dans le service IA : un profil précise une mission ou un domaine, rien de plus.
 */
export function agentProfileIssues(c: AgentProfileContent, isNew: boolean): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (isNew && !(ROUTED_PROFILES as readonly string[]).includes(c.code)) {
    issues.push({
      field: 'code',
      message: `Le service IA ne sait choisir que ces profils : ${ROUTED_PROFILES.join(', ')}. Un nouveau profil attendra que le routeur sache l’utiliser.`,
    });
  }
  if (!c.name.trim()) issues.push({ field: 'name', message: 'Nom du profil manquant.' });
  if (c.systemPrompt.trim().length < 40) {
    issues.push({ field: 'systemPrompt', message: 'Consignes trop courtes : décrivez la mission ou le domaine en au moins une phrase complète.' });
  }
  if (DELIMITERS.test(c.systemPrompt)) {
    issues.push({ field: 'systemPrompt', message: 'Les consignes ne doivent pas contenir les balises du contexte (<documents>, <question>…).' });
  }
  return issues;
}
