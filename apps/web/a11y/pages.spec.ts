import { expect, test } from '@playwright/test';
import { apiGet, auditPage, expectNoViolations, stateFile } from './helpers';

type Slug = { slug: string };

/** Pages dont l'adresse dépend du contenu de démo : on prend les premières entrées servies par l'API. */
async function contentPages() {
  const [paths, labs, commands, certifications, threads] = await Promise.all([
    apiGet<Slug[]>('/learning/paths'),
    apiGet<Slug[]>('/labs'),
    apiGet<Slug[]>('/kb/commands'),
    apiGet<{ code: string }[]>('/certifications'),
    apiGet<{ items: { id: string }[] }>('/community/threads'),
  ]);
  const path = await apiGet<{ courses: Slug[] }>(`/learning/paths/${paths[0].slug}`);
  const course = await apiGet<{ modules: { lessons: Slug[] }[] }>(`/learning/courses/${path.courses[0].slug}`);
  const pages = [
    `/parcours/${paths[0].slug}`,
    `/cours/${path.courses[0].slug}`,
    `/cours/${path.courses[0].slug}/${course.modules[0].lessons[0].slug}`,
    `/labs/${labs[0].slug}`,
    `/commandes/${commands[0].slug}`,
    `/certifications/${certifications[0].code}`,
  ];
  if (threads.items[0]) pages.push(`/communaute/${threads.items[0].id}`);
  return pages;
}

const PUBLIC = [
  '/',
  '/parcours',
  '/labs',
  '/commandes',
  '/certifications',
  '/communaute',
  '/classement',
  '/diagnostic',
  '/tarifs',
  '/confidentialite',
  '/connexion',
];

test.describe('visiteur', () => {
  for (const url of PUBLIC) test(url, async ({ page }) => auditPage(page, url));

  // Numéro inconnu : la page « introuvable » doit être accessible elle aussi.
  test('/verify (certificat introuvable)', async ({ page }) => auditPage(page, '/verify/SM-INCONNU', 404));

  test('pages de contenu', async ({ page }) => {
    for (const url of await contentPages()) await auditPage(page, url);
  });
});

test.describe('apprenant connecté', () => {
  test.use({ storageState: stateFile('alice') });

  for (const url of [
    '/tableau-de-bord',
    '/compte',
    '/abonnement',
    '/notifications',
    '/assistant',
    '/communaute/nouveau',
    '/communaute/groupes',
    '/communaute/mentorat',
  ]) {
    test(url, async ({ page }) => auditPage(page, url));
  }

  test('pages de contenu', async ({ page }) => {
    for (const url of await contentPages()) await auditPage(page, url);
  });

  test('quiz corrigé', async ({ page }) => {
    // Quiz du jeu de démo (db/seeds/001_demo.sql) : l'API n'expose pas de liste des quiz.
    await page.goto('/quiz/quiz-reparation-systeme', { waitUntil: 'networkidle' });
    await expectNoViolations(page, 'quiz avant correction');
    // Une réponse par question, puis la correction : couleurs juste / faux et explications.
    for (const group of await page.locator('ol > li').all()) await group.locator('input').first().check();
    await page.getByRole('button', { name: 'Corriger' }).click();
    await expect(page.getByRole('status')).toBeVisible();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expectNoViolations(page, `quiz corrigé [${colorScheme}]`);
    }
  });
});

test.describe('mentor, auteur et relecteur', () => {
  test.use({ storageState: stateFile('mentor') });

  for (const url of ['/editorial', '/communaute/moderation', '/communaute/mentorat']) {
    test(url, async ({ page }) => auditPage(page, url));
  }
});
