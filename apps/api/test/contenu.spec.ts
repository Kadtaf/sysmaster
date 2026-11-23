import { CommandContentSchema, CourseContentSchema, type CommandContent, type CourseContent } from '@sysmaster/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commandIssues } from '../src/modules/editorial/domain/command-rules';
import { courseIssues } from '../src/modules/editorial/domain/course-rules';

/**
 * Le contenu chargé par le seed 006 doit passer les mêmes règles que le back-office :
 * un seed n'est pas une porte dérobée pour publier une fiche incomplète.
 * (Sans base : on lit les blocs JSON du fichier généré.)
 */
const sql = readFileSync(join(__dirname, '../../../db/seeds/006_contenu_parcours.sql'), 'utf8');
const blocks = [...sql.matchAll(/\$json\$(.*?)\$json\$/gs)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
const commands = blocks.filter((b) => 'syntax' in b).map((b) => CommandContentSchema.parse(b) as CommandContent);
const courses = blocks.filter((b) => 'modules' in b).map((b) => CourseContentSchema.parse(b) as CourseContent);

// Fiches et compétences du seed de démo 001 (déjà en base avant le 006).
const demoSlugs = ['docker-logs', 'linux-journalctl', 'linux-rm-rf', 'linux-systemctl', 'linux-trash-put', 'windows-dism-restorehealth', 'windows-sfc'];
const demoSkills = ['docker.containers', 'linux.journald', 'linux.systemd', 'network.dns', 'windows.boot', 'windows.eventlog', 'windows.repair'];
const newSkills = [...sql.matchAll(/^\s+\('([a-z]+\.[a-z]+)', '/gm)].map((m) => m[1]);

describe('Contenu du seed 006', () => {
  it('contient les fiches et les cours attendus', () => {
    expect(commands.length).toBeGreaterThanOrEqual(20);
    expect(courses.length).toBe(5);
    expect(new Set(commands.map((c) => c.slug)).size).toBe(commands.length);
  });

  it('chaque fiche respecte P-1 (mêmes règles que la soumission en relecture)', () => {
    const known = new Set([...demoSlugs, ...commands.map((c) => c.slug)]);
    for (const c of commands) expect({ slug: c.slug, issues: commandIssues(c, known) }).toEqual({ slug: c.slug, issues: [] });
  });

  it('chaque cours est complet et n’utilise que des compétences connues', () => {
    const knownSkills = new Set([...demoSkills, ...newSkills]);
    for (const c of courses) {
      expect({ slug: c.slug, issues: courseIssues(c, { knownSkills, lessonsWithProgress: new Map() }) }).toEqual({ slug: c.slug, issues: [] });
    }
  });

  it('chaque leçon suit la trame pourquoi → comment → risques', () => {
    for (const l of courses.flatMap((c) => c.modules.flatMap((m) => m.lessons))) {
      expect({ lesson: l.slug, why: /^## Pourquoi/m.test(l.contentMd), risks: /^## (Risques|Attention)/m.test(l.contentMd) }).toEqual({
        lesson: l.slug, why: true, risks: true,
      });
    }
  });
});
