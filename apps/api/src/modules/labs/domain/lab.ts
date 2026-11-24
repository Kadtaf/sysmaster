import { isDir, MachineState, mountUsage } from './machine';

/**
 * Validateurs déclaratifs : ils lisent l'état final de la machine simulée. Un lab réussi est
 * un lab où tous les validateurs passent, quelle que soit la suite de commandes employée.
 */
export type Check =
  | { kind: 'service_active'; service: string }
  | { kind: 'service_enabled'; service: string; expected: boolean }
  | { kind: 'disk_usage_below'; mount: string; percent: number }
  | { kind: 'path_exists'; path: string; expected: boolean };

export interface Validator {
  description: string;
  check: Check;
}

export interface SimulationSpec {
  /** Machine dans son état de panne, telle que l'apprenant la reçoit. */
  machine: MachineState;
  validators: Validator[];
}

export function passes(state: MachineState, check: Check): boolean {
  switch (check.kind) {
    case 'service_active':
      return state.services[check.service]?.active === 'active';
    case 'service_enabled':
      return (state.services[check.service]?.enabled ?? false) === check.expected;
    case 'disk_usage_below': {
      const m = state.mounts.find((x) => x.target === check.mount);
      return !!m && mountUsage(state, m).percent < check.percent;
    }
    case 'path_exists':
      return (!!state.files[check.path] || isDir(state, check.path)) === check.expected;
  }
}

export function evaluate(state: MachineState, validators: Validator[]): { description: string; passed: boolean }[] {
  return validators.map((v) => ({ description: v.description, passed: passes(state, v.check) }));
}

/**
 * Score sur 100 : chaque indice coûte 15 points, plancher à 40. Résoudre sans indice rapporte
 * plus, conformément à la règle « l'XP ne récompense jamais la vitesse ».
 */
export function labScore(hintsUsed: number): number {
  return Math.max(40, 100 - 15 * hintsUsed);
}

/** Erreurs de forme d'une spécification, pour le seed et un futur back-office. */
export function specIssues(spec: SimulationSpec): string[] {
  const issues: string[] = [];
  const m = spec.machine;
  if (!spec.validators.length) issues.push('Au moins un validateur est requis.');
  if (!m.mounts.some((x) => x.target === '/')) issues.push('La machine doit avoir un montage racine.');
  for (const v of spec.validators) {
    const c = v.check;
    if ((c.kind === 'service_active' || c.kind === 'service_enabled') && !m.services[c.service]) {
      issues.push(`Validateur « ${v.description} » : service ${c.service} inconnu.`);
    }
    if (c.kind === 'disk_usage_below' && !m.mounts.some((x) => x.target === c.mount)) {
      issues.push(`Validateur « ${v.description} » : montage ${c.mount} inconnu.`);
    }
  }
  if (spec.validators.every((v) => passes(m, v.check))) issues.push('La machine de départ passe déjà tous les validateurs : il n’y a pas de panne.');
  return issues;
}
