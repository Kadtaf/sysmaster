import { expect, test, type Page } from '@playwright/test';
import { stateFile } from './helpers';

/**
 * Indicateur de focus visible : le contour ou l'anneau (box-shadow) de l'élément, ou d'un parent proche
 * (puces du diagnostic, invite du terminal), change quand il reçoit le focus. Une ombre déjà présente
 * sans focus ne compte donc pas.
 */
async function focusIsVisible(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ok: true, what: 'aucun' };
    const targets = [el, el.parentElement, el.closest('form')].filter((x): x is HTMLElement => !!x);
    const look = () => targets.map((t) => { const s = getComputedStyle(t); return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`; });
    const focused = look();
    el.blur();
    const blurred = look();
    el.focus({ focusVisible: true } as FocusOptions);
    return {
      ok: focused.some((f, i) => f !== blurred[i]),
      what: `${el.tagName.toLowerCase()} ${el.textContent?.trim().slice(0, 40) ?? ''}`,
    };
  });
}

/** Parcourt la page à la touche Tab et vérifie que chaque élément atteint montre où est le focus (2.4.7). */
async function tabThrough(page: Page, url: string, max = 60) {
  await page.goto(url, { waitUntil: 'networkidle' });
  const seen = new Set<string>();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const { ok, what } = await focusIsVisible(page);
    if (what === 'aucun') break;
    expect(ok, `${url} : focus invisible sur « ${what} »`).toBe(true);
    if (seen.has(what) && i > 5) break;
    seen.add(what);
  }
}

test('le lien d’évitement est le premier arrêt et mène au contenu', async ({ page }) => {
  await page.goto('/parcours', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Aller au contenu' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#contenu')).toBeFocused();
  // Le Tab suivant atteint le contenu, pas l'en-tête.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
});

test('la rubrique courante est annoncée dans la navigation', async ({ page }) => {
  await page.goto('/labs', { waitUntil: 'networkidle' });
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link', { name: 'Labs' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.locator('[aria-current]')).toHaveCount(1);
});

for (const url of ['/', '/diagnostic', '/commandes', '/tarifs']) {
  test(`focus visible au clavier : ${url}`, async ({ page }) => tabThrough(page, url));
}

test.describe('connecté', () => {
  test.use({ storageState: stateFile('alice') });
  for (const url of ['/tableau-de-bord', '/compte', '/notifications', '/communaute/nouveau']) {
    test(`focus visible au clavier : ${url}`, async ({ page }) => tabThrough(page, url));
  }

  test('le quiz se fait entièrement au clavier', async ({ page }) => {
    await page.goto('/quiz/quiz-reparation-systeme', { waitUntil: 'networkidle' });
    const groups = await page.locator('ol > li').count();
    // Premier choix de chaque question : Tab jusqu'à lui puis Espace (radio et case à cocher).
    for (let q = 0; q < groups; q++) {
      const first = page.locator('ol > li').nth(q).locator('input').first();
      for (let i = 0; i < 40 && !(await first.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
      await expect(first).toBeFocused();
      await page.keyboard.press('Space');
      await expect(first).toBeChecked();
    }
    const submit = page.getByRole('button', { name: 'Corriger' });
    for (let i = 0; i < 60 && !(await submit.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('bonnes réponses');
  });
});
