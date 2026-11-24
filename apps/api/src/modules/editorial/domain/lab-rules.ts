import type { ContentIssue, LabContent } from '@sysmaster/contracts';
import { evaluate, specIssues } from '../../labs/domain/lab';
import { isDir, parentOf, type MachineState } from '../../labs/domain/machine';
import { run } from '../../labs/domain/shell';

export interface WalkthroughStep {
  command: string;
  output: string;
  exitCode: number;
}

/** Rejoue la démarche de référence sur la machine de départ. */
export function replay(c: LabContent): { steps: WalkthroughStep[]; state: MachineState } {
  let state = c.machine as MachineState;
  const steps: WalkthroughStep[] = [];
  for (const command of c.walkthrough) {
    const r = run(state, command);
    state = r.state;
    steps.push({ command, output: r.output, exitCode: r.exitCode });
  }
  return { steps, state };
}

/**
 * Règles de publication d'un lab simulé. Un lab enseigne s'il part d'une vraie panne, se résout
 * par une démarche que l'on sait rejouer, et explique la cause une fois réussi.
 */
export function labIssues(c: LabContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const push = (field: string, message: string) => issues.push({ field, message });
  if (!c.slug) push('slug', 'Identifiant d’URL du lab manquant (ex. « linux-disque-plein »).');
  if (!c.title.trim()) push('title', 'Titre du lab manquant.');
  if (!c.briefMd.trim()) push('briefMd', 'Énoncé manquant : décrivez la situation comme un ticket d’incident.');
  if (c.objectives.length === 0) push('objectives', 'Au moins un objectif d’apprentissage.');
  if (c.hints.length === 0) push('hints', 'Au moins un indice, du plus général au plus précis.');
  if (c.solutionMd.trim().length < 80) push('solutionMd', 'Solution trop courte : expliquez la cause, la démarche et comment éviter que ça revienne.');

  const m = c.machine as MachineState;
  if (!isDir(m, m.cwd)) push('machine', `Le répertoire de départ ${m.cwd} n’existe pas dans la machine.`);
  for (const path of Object.keys(m.files)) {
    if (!isDir(m, parentOf(path))) push('machine', `Le fichier ${path} est dans un répertoire absent de « dirs » (${parentOf(path)}).`);
  }
  for (const [name, s] of Object.entries(m.services)) {
    if (s.active === 'active' && !s.pid) push('machine', `Le service ${name} est actif mais sans pid.`);
  }
  for (const message of specIssues({ machine: m, validators: c.validators })) push('validators', message);

  if (c.walkthrough.length === 0) {
    push('walkthrough', 'Démarche de référence manquante : listez les commandes qui réparent la machine.');
  } else if (!issues.some((i) => i.field === 'machine')) {
    const { steps, state } = replay(c);
    steps.forEach((s, i) => {
      if (s.exitCode === 127) push('walkthrough', `Étape ${i + 1} (« ${s.command} ») : commande non simulée.`);
    });
    const failing = evaluate(state, c.validators).filter((v) => !v.passed);
    if (failing.length) {
      push('walkthrough', `La démarche de référence ne répare pas la machine : ${failing.map((f) => `« ${f.description} »`).join(', ')} échoue encore.`);
    }
  }
  return issues;
}
