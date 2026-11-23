import type { CommandContent } from '@sysmaster/contracts';
import { assertCan, contentIssues, EditorialError, permissions } from './editorial';

const complete = (over: Partial<CommandContent> = {}): CommandContent => ({
  slug: 'linux-ls', name: 'ls', platform: 'linux', shell: 'bash',
  summary: 'Liste un répertoire', history: null, internals: null, syntax: 'ls [options] [chemin]',
  why: 'Voir ce que contient un dossier', whenToUse: 'Avant de manipuler des fichiers', context: 'Tout shell POSIX',
  riskLevel: 'none', risks: [{ level: 'none', text: 'Lecture seule' }], difficulty: 'beginner', requiresAdmin: false,
  bestPractices: [], commonErrors: [], parameters: [{ flag: '-l', description: 'Format long', riskLevel: 'none' }],
  examples: [{ title: 'Lister', code: 'ls -l', explanation: 'Affiche droits et tailles', isRealCase: false }],
  alternatives: [{ slug: 'linux-find', note: 'Pour chercher récursivement' }],
  sources: [{ title: 'man ls', url: 'https://man7.org/linux/man-pages/man1/ls.1.html', publisher: 'man7' }],
  ...over,
});
const known = new Set(['linux-find']);

describe('contentIssues (règle P-1)', () => {
  it('une fiche complète est publiable', () => expect(contentIssues(complete(), known)).toEqual([]));

  it('signale chaque élément de « comprendre avant d’exécuter » manquant', () => {
    const issues = contentIssues(complete({ why: '', whenToUse: ' ', context: null, risks: [], alternatives: [], sources: [], examples: [] }), known);
    expect(issues.map((i) => i.field).sort()).toEqual(['alternatives', 'context', 'examples', 'risks', 'sources', 'whenToUse', 'why']);
  });

  it('le niveau de la fiche ne peut pas être inférieur à celui d’un risque ou d’un paramètre', () => {
    const issues = contentIssues(
      complete({ riskLevel: 'low', risks: [{ level: 'high', text: 'Supprime' }], parameters: [{ flag: '-f', description: 'Force', riskLevel: 'critical' }] }),
      known,
    );
    expect(issues.filter((i) => i.field === 'riskLevel')).toHaveLength(2);
  });

  it('une commande à risque élevé doit documenter une erreur fréquente', () => {
    const issues = contentIssues(complete({ riskLevel: 'high', risks: [{ level: 'high', text: 'Écrase' }] }), known);
    expect(issues).toEqual([expect.objectContaining({ field: 'commonErrors' })]);
  });

  it('une alternative doit être une fiche publiée, et pas la fiche elle-même', () => {
    const issues = contentIssues(complete({ alternatives: [{ slug: 'inconnue', note: 'x' }, { slug: 'linux-ls', note: 'x' }] }), known);
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringContaining('« inconnue » n’est pas une fiche publiée'),
      expect.stringContaining('sa propre alternative'),
    ]);
  });
});

describe('permissions (workflow et quatre yeux)', () => {
  const author = { id: 'a', roles: ['author'] as const };
  const reviewer = { id: 'r', roles: ['reviewer'] as const };
  const admin = { id: 'x', roles: ['admin'] as const };
  const learner = { id: 'l', roles: ['learner'] as const };
  const draft = { status: 'draft' as const, authorId: 'a' };
  const inReview = { status: 'in_review' as const, authorId: 'a' };

  it('seul l’auteur modifie et soumet son brouillon', () => {
    expect(permissions(draft, { ...author, roles: [...author.roles] })).toMatchObject({ edit: true, submit: true, review: false });
    expect(permissions(draft, { ...reviewer, roles: [...reviewer.roles] })).toMatchObject({ edit: false, submit: false });
  });

  it('en relecture : l’auteur ne modifie plus, un relecteur ou un admin peut décider', () => {
    expect(permissions(inReview, { ...author, roles: [...author.roles] })).toMatchObject({ edit: false, review: false, withdraw: true });
    expect(permissions(inReview, { ...reviewer, roles: [...reviewer.roles] }).review).toBe(true);
    expect(permissions(inReview, { ...admin, roles: [...admin.roles] }).review).toBe(true);
    expect(permissions(inReview, { ...learner, roles: [...learner.roles] }).review).toBe(false);
  });

  it('personne n’approuve sa propre révision, même un administrateur', () => {
    const own = { status: 'in_review' as const, authorId: 'x' };
    expect(permissions(own, { ...admin, roles: [...admin.roles] }).review).toBe(false);
    expect(() => assertCan(false, own, { ...admin, roles: [...admin.roles] }, 'review')).toThrow(
      expect.objectContaining({ code: 'own_revision' }) as unknown as EditorialError,
    );
  });

  it('une révision publiée ou retirée est figée', () => {
    for (const status of ['published', 'withdrawn'] as const) {
      expect(permissions({ status, authorId: 'a' }, { ...author, roles: [...author.roles] })).toEqual({ edit: false, submit: false, review: false, withdraw: false });
    }
  });
});
