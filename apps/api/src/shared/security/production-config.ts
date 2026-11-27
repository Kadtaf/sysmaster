/**
 * Réglages qui ouvriraient une faille s'ils gardaient leur valeur de développement. En production
 * (NODE_ENV=production), l'API refuse de démarrer plutôt que de tourner mal protégée.
 * La clé de signature des certificats a sa propre vérification (ed25519-signer).
 */
export const DEV_AI_TOKEN = 'dev-only-ai-token';

export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  const token = env.AI_SERVICE_TOKEN ?? '';
  if (!token || token === DEV_AI_TOKEN || token.length < 32) {
    problems.push('AI_SERVICE_TOKEN doit être un secret d’au moins 32 caractères (openssl rand -hex 32).');
  }
  const origins = (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) {
    problems.push('CORS_ORIGINS doit lister les origines du site (jamais « * »).');
  }
  if (!env.OIDC_ISSUER) problems.push('OIDC_ISSUER est obligatoire.');
  return problems;
}
