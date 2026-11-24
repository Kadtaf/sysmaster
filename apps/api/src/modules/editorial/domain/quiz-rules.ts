import type { ContentIssue, QuizContent } from '@sysmaster/contracts';

export interface QuizContext {
  /** Fiches publiées (identifiants d'URL). */
  knownCommands: ReadonlySet<string>;
}

/**
 * Règles de publication d'un quiz. Une question n'apprend quelque chose que si sa correction
 * explique pourquoi : l'explication est donc obligatoire, comme le « pourquoi » d'une fiche.
 */
export function quizIssues(c: QuizContent, ctx: QuizContext): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (!c.slug) issues.push({ field: 'slug', message: 'Identifiant d’URL du quiz manquant (ex. « quiz-linux-df »).' });
  if (!c.title.trim()) issues.push({ field: 'title', message: 'Titre du quiz manquant.' });
  if (c.commandSlug && !ctx.knownCommands.has(c.commandSlug)) {
    issues.push({ field: 'commandSlug', message: `La fiche « ${c.commandSlug} » n’est pas publiée.` });
  }
  if (c.questions.length === 0) issues.push({ field: 'questions', message: 'Le quiz ne contient aucune question.' });
  c.questions.forEach((q, i) => {
    const f = `questions.${i}`;
    const n = `Question ${i + 1}`;
    const ids = q.choices.map((ch) => ch.id);
    if (q.choices.length < 2) issues.push({ field: f, message: `${n} : au moins deux choix.` });
    if (new Set(ids).size !== ids.length) issues.push({ field: f, message: `${n} : deux choix ont la même lettre.` });
    if (q.answer.length === 0) issues.push({ field: f, message: `${n} : aucune bonne réponse cochée.` });
    if (q.answer.some((a) => !ids.includes(a))) issues.push({ field: f, message: `${n} : une bonne réponse ne correspond à aucun choix.` });
    if (q.type === 'single' && q.answer.length > 1) issues.push({ field: f, message: `${n} : une seule bonne réponse pour une question à choix unique.` });
    if (q.choices.length > 0 && new Set(q.answer).size >= q.choices.length) {
      issues.push({ field: f, message: `${n} : tous les choix sont justes, la question ne vérifie rien.` });
    }
    if (!q.explanation.trim()) issues.push({ field: f, message: `${n} : expliquez pourquoi la bonne réponse est juste.` });
  });
  return issues;
}
