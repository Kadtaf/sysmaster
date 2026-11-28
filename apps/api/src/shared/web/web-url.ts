/** Adresse publique du site (retours de Stripe, liens des certificats). */
export function webUrl(env = process.env): string {
  const base = env.PUBLIC_WEB_URL || (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')[0].trim();
  return base.replace(/\/+$/, '');
}
