import type { CauseContent, CourseContent, PathContent } from '@sysmaster/contracts';
import { causeIssues } from './cause-rules';
import { courseIssues } from './course-rules';
import { pathIssues } from './path-rules';

const lesson = (slug: string, over: Partial<CourseContent['modules'][number]['lessons'][number]> = {}) => ({
  slug, title: `Leçon ${slug}`, type: 'reading' as const, estMinutes: 10, objectives: ['Comprendre'], contentMd: '## Pourquoi\nParce que.', skills: [],
  ...over,
});
const course = (over: Partial<CourseContent> = {}): CourseContent => ({
  slug: 'linux-bases', title: 'Bases', summary: 'Les bases', platform: 'linux', difficulty: 'beginner', isPremium: false,
  modules: [{ title: 'Module 1', lessons: [lesson('a'), lesson('b')] }],
  ...over,
});
const ctx = { knownSkills: new Set(['linux.shell']), lessonsWithProgress: new Map<string, number>() };

describe('courseIssues', () => {
  it('un cours complet est publiable', () => expect(courseIssues(course(), ctx)).toEqual([]));

  it('chaque leçon a des objectifs, un contenu et un identifiant unique dans le cours', () => {
    const c = course({ modules: [{ title: 'M', lessons: [lesson('a', { objectives: [] }), lesson('a', { contentMd: ' ' })] }] });
    expect(courseIssues(c, ctx).map((i) => i.message)).toEqual([
      expect.stringContaining('au moins un objectif'),
      expect.stringContaining('utilisé deux fois'),
      expect.stringContaining('pas de contenu'),
    ]);
  });

  it('un lab ou un quiz peut ne pas avoir de texte', () => {
    expect(courseIssues(course({ modules: [{ title: 'M', lessons: [lesson('lab', { type: 'lab', contentMd: '' })] }] }), ctx)).toEqual([]);
  });

  it('refuse de supprimer une leçon déjà validée par des apprenants, mais accepte de la déplacer', () => {
    const withProgress = { ...ctx, lessonsWithProgress: new Map([['b', 12]]) };
    expect(courseIssues(course({ modules: [{ title: 'M', lessons: [lesson('a')] }] }), withProgress)[0].message).toContain('12 apprenant(s)');
    const moved = course({ modules: [{ title: 'M1', lessons: [lesson('a')] }, { title: 'M2', lessons: [lesson('b')] }] });
    expect(courseIssues(moved, withProgress)).toEqual([]);
  });

  it('une compétence doit exister dans le graphe', () => {
    const c = course({ modules: [{ title: 'M', lessons: [lesson('a', { skills: ['inconnue'] })] }] });
    expect(courseIssues(c, ctx)[0].message).toContain('« inconnue » n’existe pas');
  });
});

describe('pathIssues', () => {
  const path = (over: Partial<PathContent> = {}): PathContent => ({
    slug: 'admin', title: 'Admin', summary: 'Devenir admin', career: 'sysadmin', difficulty: 'beginner', estHours: 40, courses: ['linux-bases'], ...over,
  });
  const pctx = { knownCourses: new Set(['linux-bases', 'docker']), knownCareers: new Set(['sysadmin']) };
  it('un parcours complet est publiable', () => expect(pathIssues(path(), pctx)).toEqual([]));
  it('cours publiés, sans doublon, métier connu', () => {
    const issues = pathIssues(path({ career: 'astronaute', courses: ['linux-bases', 'linux-bases', 'brouillon'] }), pctx);
    expect(issues.map((i) => i.field)).toEqual(['career', 'courses', 'courses']);
  });
});

describe('causeIssues', () => {
  const cause = (over: Partial<CauseContent> = {}): CauseContent => ({
    code: 'disk_full', label: 'Disque plein', platform: 'linux', prior: 0.1, explanation: 'Plus de place : les écritures échouent.',
    actionPlan: [{ step: 'df -h', why: 'Voir quel volume est plein', risk: 'none', commandSlug: null }],
    rules: [{ symptom: 'write_errors', likelihood: 0.9, rationale: 'Toute écriture échoue' }],
    evidencePatterns: [{ name: 'ENOSPC', source: 'syslog', pattern: 'No space left on device', boost: 3 }],
    newSymptoms: [{ code: 'write_errors', label: 'Erreurs d’écriture', synonyms: ['impossible d’écrire'] }],
    ...over,
  });
  const cctx = { knownSymptoms: new Set(['slow']), knownCommands: new Set(['linux-df']) };

  it('une cause complète est publiable (avec un nouveau symptôme)', () => expect(causeIssues(cause(), cctx)).toEqual([]));

  it('jamais d’action à risque élevé en première étape', () => {
    const c = cause({ actionPlan: [{ step: 'rm -rf /var/log/*', why: 'Libérer', risk: 'critical', commandSlug: null }] });
    expect(causeIssues(c, cctx)[0].message).toContain('première étape');
  });

  it('chaque règle est justifiée et vise un symptôme connu ; les motifs sont des regex valides', () => {
    const c = cause({
      newSymptoms: [],
      rules: [{ symptom: 'inconnu', likelihood: 0.5, rationale: '' }],
      evidencePatterns: [{ name: 'cassé', source: 'syslog', pattern: '(', boost: 2 }],
    });
    expect(causeIssues(c, cctx).map((i) => i.field)).toEqual(['rules.0.symptom', 'rules.0.rationale', 'evidencePatterns.0.pattern']);
  });

  it('une étape qui cite une fiche doit viser une fiche publiée', () => {
    const c = cause({ actionPlan: [{ step: 'df', why: 'Voir', risk: 'none', commandSlug: 'linux-du' }] });
    expect(causeIssues(c, cctx)[0].field).toBe('actionPlan.0.commandSlug');
  });
});
