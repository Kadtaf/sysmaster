/** Adresse publique du site (retours de Stripe, liens des certificats). */
export function webUrl(env = process.env): string {
  const base = env.PUBLIC_WEB_URL || (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')[0].trim();
  return base.replace(/\/+$/, '');
}

/** Adresse publique de l'API (liens de désabonnement en un clic). Même hôte que le site par défaut. */
export function publicApiUrl(env = process.env): string {
  return (env.PUBLIC_API_URL || `${webUrl(env)}/api/v1`).replace(/\/+$/, '');
}
