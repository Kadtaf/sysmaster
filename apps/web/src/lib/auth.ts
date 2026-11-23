import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import KeycloakProvider from 'next-auth/providers/keycloak';

/**
 * Connexion via Keycloak (OIDC, code + PKCE). Keycloak gère e-mail/mot de passe, Google, Microsoft,
 * GitHub, Apple, la 2FA et les passkeys : l'application ne voit jamais un mot de passe.
 *
 * Deux URL car, dans Docker, le navigateur joint Keycloak par localhost:8080 (KEYCLOAK_ISSUER)
 * alors que le serveur Next.js le joint par le réseau interne (KEYCLOAK_INTERNAL_ISSUER).
 */
export const keycloakIssuer = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/sysmaster';
const internalIssuer = process.env.KEYCLOAK_INTERNAL_ISSUER ?? keycloakIssuer;
const clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'sysmaster-web';
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET ?? 'dev-only-web-secret';

export const accountSecurityUrl = `${keycloakIssuer}/account/account-security/signing-in`;

function decodePayload(jwt: string): Record<string, unknown> {
  // Pas de vérification de signature ici : le jeton vient directement de Keycloak par le canal serveur.
  // L'API, elle, vérifie chaque jeton qu'elle reçoit.
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

function rolesOf(accessToken: string): string[] {
  const roles = (decodePayload(accessToken).realm_access as { roles?: string[] } | undefined)?.roles ?? [];
  return roles.filter((r) => !r.startsWith('default-roles') && r !== 'offline_access' && r !== 'uma_authorization');
}

async function refresh(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${internalIssuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refreshToken ?? '',
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    return {
      ...token,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? token.refreshToken,
      idToken: body.id_token ?? token.idToken,
      expiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
      roles: rolesOf(body.access_token),
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshFailed' };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId,
      clientSecret,
      issuer: keycloakIssuer,
      // Points de terminaison explicites (pas de découverte) pour séparer canal navigateur et canal serveur.
      wellKnown: undefined,
      authorization: { url: `${keycloakIssuer}/protocol/openid-connect/auth`, params: { scope: 'openid email profile' } },
      token: `${internalIssuer}/protocol/openid-connect/token`,
      userinfo: `${internalIssuer}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${internalIssuer}/protocol/openid-connect/certs`,
      checks: ['pkce', 'state'],
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/connexion' },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
          expiresAt: account.expires_at,
          roles: rolesOf(account.access_token),
        };
      }
      if (token.expiresAt && Date.now() < (token.expiresAt - 30) * 1000) return token;
      return refresh(token);
    },
    async session({ session, token }) {
      // Le jeton d'accès (5 min) est exposé à la session pour appeler l'API depuis le navigateur.
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (session.user) session.user.roles = token.roles ?? [];
      return session;
    },
  },
};

/** URL de déconnexion Keycloak : ferme aussi la session SSO, pas seulement le cookie local. */
export function keycloakLogoutUrl(idToken: string | undefined, redirectTo: string): string {
  const url = new URL(`${keycloakIssuer}/protocol/openid-connect/logout`);
  url.searchParams.set('post_logout_redirect_uri', redirectTo);
  url.searchParams.set('client_id', clientId);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  return url.toString();
}
