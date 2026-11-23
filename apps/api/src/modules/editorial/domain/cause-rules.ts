import type { CauseContent, ContentIssue } from '@sysmaster/contracts';
import { isAtLeast } from '../../knowledge/domain/risk-policy';

export interface CauseContext {
  knownSymptoms: ReadonlySet<string>;
  knownCommands: ReadonlySet<string>;
}

/**
 * Règles de publication d'une cause de diagnostic.
 *
 * - Chaque règle P(symptôme | cause) est justifiée : le moteur cite cette justification à l'utilisateur.
 * - Le plan d'action explique chaque étape et ne commence jamais par une action à risque élevé
 *   (spécification §2.4 : « jamais d'action destructive en première étape »).
 * - Les motifs de journaux sont des expressions régulières valides.
 */
export function causeIssues(c: CauseContent, ctx: CauseContext): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (!c.code) issues.push({ field: 'code', message: 'Code de la cause manquant (ex. « failing_psu »).' });
  if (!c.label.trim()) issues.push({ field: 'label', message: 'Libellé manquant.' });
  if (!c.explanation.trim()) issues.push({ field: 'explanation', message: 'Explication manquante : pourquoi cette cause produit ces symptômes.' });

  if (c.actionPlan.length === 0) issues.push({ field: 'actionPlan', message: 'Le plan d’action est vide.' });
  if (c.actionPlan[0] && isAtLeast(c.actionPlan[0].risk, 'high')) {
    issues.push({ field: 'actionPlan', message: 'La première étape est à risque élevé ou critique : commencez par une vérification sans danger.' });
  }
  c.actionPlan.forEach((s, i) => {
    if (!s.why.trim()) issues.push({ field: `actionPlan.${i}.why`, message: `Étape ${i + 1} : expliquez pourquoi la faire.` });
    if (s.commandSlug && !ctx.knownCommands.has(s.commandSlug)) {
      issues.push({ field: `actionPlan.${i}.commandSlug`, message: `Étape ${i + 1} : la fiche « ${s.commandSlug} » n’est pas publiée.` });
    }
  });

  const symptoms = new Set([...ctx.knownSymptoms, ...c.newSymptoms.map((s) => s.code)]);
  for (const s of c.newSymptoms) {
    if (ctx.knownSymptoms.has(s.code)) issues.push({ field: 'newSymptoms', message: `Le symptôme « ${s.code} » existe déjà : utilisez-le directement.` });
  }
  if (c.rules.length === 0) issues.push({ field: 'rules', message: 'Aucune règle : le moteur ne pourra jamais proposer cette cause.' });
  const seen = new Set<string>();
  c.rules.forEach((r, i) => {
    if (seen.has(r.symptom)) issues.push({ field: `rules.${i}`, message: `Le symptôme « ${r.symptom} » a deux règles.` });
    seen.add(r.symptom);
    if (!symptoms.has(r.symptom)) issues.push({ field: `rules.${i}.symptom`, message: `Le symptôme « ${r.symptom} » n’existe pas (ajoutez-le dans « nouveaux symptômes »).` });
    if (!r.rationale.trim()) issues.push({ field: `rules.${i}.rationale`, message: `Règle « ${r.symptom} » : justifiez la probabilité, elle est montrée à l’utilisateur.` });
  });

  c.evidencePatterns.forEach((p, i) => {
    try {
      new RegExp(p.pattern, 'i');
    } catch {
      issues.push({ field: `evidencePatterns.${i}.pattern`, message: `Le motif « ${p.name} » n’est pas une expression régulière valide.` });
    }
  });
  return issues;
}
