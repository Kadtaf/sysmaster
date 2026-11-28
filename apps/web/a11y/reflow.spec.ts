import { expect, test, type Page } from '@playwright/test';
import { stateFile } from './helpers';

/** Redistribution (1.4.10) : à 320 px de large (zoom 400 % d'un écran de 1280 px), pas de défilement horizontal. */
async function noHorizontalScroll(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${url} déborde : ${width} px pour 320`).toBeLessThanOrEqual(320);
}

test.use({ viewport: { width: 320, height: 640 } });

for (const url of ['/', '/parcours', '/labs', '/commandes', '/certifications', '/communaute', '/diagnostic', '/tarifs', '/classement', '/confidentialite']) {
  test(`320 px : ${url}`, async ({ page }) => noHorizontalScroll(page, url));
}

test.describe('connecté', () => {
  test.use({ storageState: stateFile('alice') });
  for (const url of ['/tableau-de-bord', '/compte', '/assistant', '/communaute/nouveau', '/notifications', '/abonnement']) {
    test(`320 px : ${url}`, async ({ page }) => noHorizontalScroll(page, url));
  }
});
