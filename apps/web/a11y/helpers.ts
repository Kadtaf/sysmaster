import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'Demo-SysMaster-2026!';
/** École de démonstration (db/seeds/001_demo.sql, licence dans 013) : Nadia propriétaire, Alice membre. */
export const DEMO_ORGANIZATION = '00000000-0000-4000-8100-000000000001';
export const apiUrl = process.env.A11Y_API_URL ?? 'http://localhost:4000/api/v1';
export const stateFile = (user: 'alice' | 'mentor' | 'admin') => path.join(__dirname, '.auth', `${user}.json`);

/** Les critères visés : WCAG 2.0, 2.1 et 2.2, niveaux A et AA. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function apiGet<T>(p: string): Promise<T> {
  const res = await fetch(`${apiUrl}${p}`);
  if (!res.ok) throw new Error(`${p} : ${res.status}`);
  return (await res.json()) as T;
}

/** Contrôle axe de l'état courant de la page ; le message liste chaque règle et les éléments en cause. */
export async function expectNoViolations(page: Page, label: string) {
  // Les apparitions en fondu (accueil) finissent avant la mesure : un contraste pris en plein fondu ne veut rien dire.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.map(
    (v) => `${v.id} (${v.impact}) : ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(' ')}`).join('\n')}`,
  );
  expect(report, `${label}\n${report.join('\n')}`).toEqual([]);
}

/** Charge la page puis l'audite en thème clair et en thème sombre (les couleurs changent, donc les contrastes). */
export async function auditPage(page: Page, url: string, expectedStatus = 200) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const res = await page.goto(url, { waitUntil: 'networkidle' });
    expect(res?.status(), url).toBe(expectedStatus);
    await expectNoViolations(page, `${url} [${colorScheme}]`);
  }
}
