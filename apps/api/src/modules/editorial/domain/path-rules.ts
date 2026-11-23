import type { ContentIssue, PathContent } from '@sysmaster/contracts';

export interface PathContext {
  /** Cours publiés existants. */
  knownCourses: ReadonlySet<string>;
  /** Métiers cibles connus (learning.careers). */
  knownCareers: ReadonlySet<string>;
}

/** Règles de publication d'un parcours : une présentation, et une suite de cours publiés sans doublon. */
export function pathIssues(c: PathContent, ctx: PathContext): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (!c.slug) issues.push({ field: 'slug', message: 'Identifiant d’URL du parcours manquant (ex. « administrateur-linux »).' });
  if (!c.title.trim()) issues.push({ field: 'title', message: 'Titre du parcours manquant.' });
  if (!c.summary.trim()) issues.push({ field: 'summary', message: 'Résumé manquant : à quel métier mène ce parcours, et pour qui.' });
  if (c.career && !ctx.knownCareers.has(c.career)) issues.push({ field: 'career', message: `Le métier « ${c.career} » n’existe pas.` });
  if (c.courses.length === 0) issues.push({ field: 'courses', message: 'Le parcours ne contient aucun cours.' });
  const seen = new Set<string>();
  for (const slug of c.courses) {
    if (seen.has(slug)) issues.push({ field: 'courses', message: `Le cours « ${slug} » apparaît deux fois.` });
    else if (!ctx.knownCourses.has(slug)) issues.push({ field: 'courses', message: `Le cours « ${slug} » n’est pas un cours publié.` });
    seen.add(slug);
  }
  return issues;
}
