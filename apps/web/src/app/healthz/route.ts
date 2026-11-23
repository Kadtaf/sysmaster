// Sonde de vie du serveur Next.js (Kubernetes). Ne dépend ni de l'API ni de Keycloak :
// une panne en aval ne doit pas faire redémarrer le front.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', version: process.env.APP_VERSION ?? 'dev' });
}
