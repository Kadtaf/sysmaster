import type { ContentIssue, CourseContent } from '@sysmaster/contracts';

export interface CourseContext {
  /** Codes de compétences existants (graphe skills.skills). */
  knownSkills: ReadonlySet<string>;
  /** Leçons publiées déjà validées par des apprenants : identifiant d'URL → nombre d'apprenants. */
  lessonsWithProgress: ReadonlyMap<string, number>;
}

/**
 * Règles de publication d'un cours. Une leçon n'est publiable que si elle dit ce que l'on va
 * apprendre (objectifs) et qu'elle a un contenu. Supprimer une leçon déjà validée par des
 * apprenants ferait disparaître leur progression : c'est refusé (la renommer reste possible).
 */
export function courseIssues(c: CourseContent, ctx: CourseContext): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const need = (field: string, value: string | null | undefined, message: string) => {
    if (!value || !value.trim()) issues.push({ field, message });
  };
  need('slug', c.slug, 'Identifiant d’URL du cours manquant (ex. « linux-systemd »).');
  need('title', c.title, 'Titre du cours manquant.');
  need('summary', c.summary, 'Résumé manquant : ce que l’apprenant saura faire à la fin.');

  if (c.modules.length === 0) issues.push({ field: 'modules', message: 'Le cours n’a aucun module.' });
  const seen = new Set<string>();
  c.modules.forEach((m, mi) => {
    const where = `module ${mi + 1}`;
    if (!m.title.trim()) issues.push({ field: `modules.${mi}.title`, message: `Le ${where} n’a pas de titre.` });
    if (m.lessons.length === 0) issues.push({ field: `modules.${mi}.lessons`, message: `Le ${where} n’a aucune leçon.` });
    m.lessons.forEach((l, li) => {
      const at = `modules.${mi}.lessons.${li}`;
      const name = l.title.trim() || `leçon ${li + 1} du ${where}`;
      if (!l.slug) issues.push({ field: `${at}.slug`, message: `« ${name} » n’a pas d’identifiant d’URL.` });
      else if (seen.has(l.slug)) issues.push({ field: `${at}.slug`, message: `L’identifiant « ${l.slug} » est utilisé deux fois dans ce cours.` });
      seen.add(l.slug);
      if (!l.title.trim()) issues.push({ field: `${at}.title`, message: `La leçon ${li + 1} du ${where} n’a pas de titre.` });
      if (l.objectives.length === 0) {
        issues.push({ field: `${at}.objectives`, message: `« ${name} » : indiquez au moins un objectif (ce que l’apprenant saura faire).` });
      }
      if (!l.contentMd.trim() && l.type !== 'lab' && l.type !== 'quiz') {
        issues.push({ field: `${at}.contentMd`, message: `« ${name} » n’a pas de contenu.` });
      }
      for (const s of l.skills) {
        if (!ctx.knownSkills.has(s)) issues.push({ field: `${at}.skills`, message: `« ${name} » : la compétence « ${s} » n’existe pas.` });
      }
    });
  });

  for (const [slug, learners] of ctx.lessonsWithProgress) {
    if (!seen.has(slug)) {
      issues.push({
        field: 'modules',
        message: `La leçon « ${slug} » a déjà été validée par ${learners} apprenant(s) : la supprimer effacerait leur progression. Gardez-la (vous pouvez la modifier ou la déplacer).`,
      });
    }
  }
  return issues;
}
