import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

/** Origine de l'API vue par le navigateur, si elle n'est pas celle du site (en production : /api/v1, même origine). */
function apiOrigin(url = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null; // URL relative : même origine
  }
}

/**
 * Politique de contenu (docs/01 §15). Les scripts en ligne restent permis : Next.js en injecte pour
 * l'hydratation, et un nonce imposerait le rendu dynamique de chaque page. Le reste est fermé :
 * aucune ressource tierce, aucune image distante (le Markdown des membres n'en affiche pas),
 * pas d'intégration dans un cadre (détournement de clic), formulaires vers le site seulement.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  ['connect-src', "'self'", apiOrigin(), dev ? 'ws:' : null].filter(Boolean).join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  // Ignoré par les navigateurs tant que le site est servi en HTTP (développement).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
