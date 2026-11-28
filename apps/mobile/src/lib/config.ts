/**
 * Adresses de la plateforme. Les variables EXPO_PUBLIC_* sont figées dans le bundle au moment de la
 * construction : elles ne contiennent donc jamais de secret (le client Keycloak mobile est public, PKCE).
 */
export interface AppConfig {
  apiUrl: string;
  issuer: string;
  clientId: string;
  webUrl: string;
}

/** Hors développement, toute adresse doit être en HTTPS : un jeton ne circule jamais en clair. */
export function resolveConfig(env: Record<string, string | undefined>, dev: boolean): AppConfig {
  const config: AppConfig = {
    apiUrl: (env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, ''),
    issuer: (env.EXPO_PUBLIC_OIDC_ISSUER ?? 'http://localhost:8080/realms/sysmaster').replace(/\/$/, ''),
    clientId: env.EXPO_PUBLIC_OIDC_CLIENT_ID ?? 'sysmaster-mobile',
    webUrl: (env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  };
  if (!dev) {
    for (const [key, value] of Object.entries(config)) {
      if (key !== 'clientId' && !value.startsWith('https://')) {
        throw new Error(`Configuration mobile : ${key} doit être une adresse HTTPS en production (${value}).`);
      }
    }
  }
  return config;
}

// Lecture explicite variable par variable : Expo ne remplace que les accès littéraux à process.env.EXPO_PUBLIC_*.
export const config = resolveConfig(
  {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_OIDC_ISSUER: process.env.EXPO_PUBLIC_OIDC_ISSUER,
    EXPO_PUBLIC_OIDC_CLIENT_ID: process.env.EXPO_PUBLIC_OIDC_CLIENT_ID,
    EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL,
  },
  typeof __DEV__ === 'undefined' ? true : __DEV__,
);
