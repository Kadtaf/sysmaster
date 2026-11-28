import { defineConfig } from '@playwright/test';

/**
 * Audit d'accessibilité (WCAG 2.2 AA, docs/05) sur l'application construite et lancée :
 * le web (A11Y_BASE_URL), l'API (A11Y_API_URL) et Keycloak avec le royaume de démo.
 * Lancement : pnpm --filter @sysmaster/web a11y
 */
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  workers: 1,
  // Pas de nouvel essai : un échec intermittent a déjà révélé un vrai défaut (connexion simultanée).
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: process.env.A11Y_BASE_URL ?? 'http://localhost:3000',
    locale: 'fr-FR',
    trace: 'off',
  },
  projects: [
    { name: 'connexion', testMatch: /auth\.setup\.ts/ },
    { name: 'a11y', testMatch: /\.spec\.ts/, dependencies: ['connexion'] },
  ],
});
