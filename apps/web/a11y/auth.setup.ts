import { test as setup, expect } from '@playwright/test';
import { DEMO_PASSWORD, stateFile } from './helpers';

/** Connexion réelle par Keycloak (comptes du royaume de démo, infra/keycloak) ; la session est réutilisée par les audits. */
for (const user of ['alice', 'mentor'] as const) {
  setup(`connexion ${user}`, async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: /connexion|connecter|continuer/i }).first().click();
    await page.waitForURL(/\/realms\/sysmaster\//);
    await page.fill('#username', `${user}@sysmaster.local`);
    await page.fill('#password', DEMO_PASSWORD);
    await page.click('#kc-login');
    await page.waitForURL((u) => !u.pathname.includes('/realms/'));
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await page.context().storageState({ path: stateFile(user) });
  });
}
