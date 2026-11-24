import { canRead, isDir, MachineState, mountUsage } from './machine';
import { autostarts } from './docker';
import { reachable, resolve } from './network';
import { httpGet } from './network-commands';
import { firewallAllows, modeAtMost, modeOf } from './security';

/**
 * Validateurs déclaratifs : ils lisent l'état final de la machine simulée. Un lab réussi est
 * un lab où tous les validateurs passent, quelle que soit la suite de commandes employée.
 */
export type Check =
  | { kind: 'service_active'; service: string }
  | { kind: 'service_enabled'; service: string; expected: boolean }
  | { kind: 'disk_usage_below'; mount: string; percent: number }
  | { kind: 'path_exists'; path: string; expected: boolean }
  /** Le nom (ou l'adresse) répond au ping de bout en bout : résolution puis routage. */
  | { kind: 'host_reachable'; target: string }
  | { kind: 'name_resolves'; name: string }
  /** Une ligne active (hors commentaire, espaces ignorés) est présente, ou absente, dans le fichier. */
  | { kind: 'file_has_line'; path: string; line: string; expected: boolean }
  /** Conteneur démarré (et pas en boucle de redémarrage). */
  | { kind: 'container_running'; name: string; expected: boolean }
  /** Le conteneur repartira au prochain démarrage de la machine (politique de redémarrage). */
  | { kind: 'container_autostart'; name: string; expected: boolean }
  /** L'URL répond en 2xx, et contient le texte s'il est donné. */
  | { kind: 'http_ok'; url: string; contains?: string }
  /** Le fichier existe et ses droits n'accordent rien de plus que « mode » (ex. 640 au plus). */
  | { kind: 'file_mode_at_most'; path: string; mode: string }
  /** Le pare-feu laisse passer (ou non) une connexion venant de « from » vers ce port local. */
  | { kind: 'firewall_allows'; from: string; port: number; expected: boolean }
  /** Le compte peut (ou ne peut pas) lire le fichier : droits, propriétaire, groupe et /etc/group. */
  | { kind: 'file_readable_by'; path: string; user: string; expected: boolean };

export interface Validator {
  description: string;
  check: Check;
}

export interface SimulationSpec {
  /** Machine dans son état de panne, telle que l'apprenant la reçoit. */
  machine: MachineState;
  validators: Validator[];
  /** Démarche de référence, rejouée avant publication (back-office). */
  walkthrough?: string[];
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
    case 'host_reachable':
      return reachable(state, check.target);
    case 'name_resolves':
      return resolve(state, check.name).ok;
    case 'file_has_line': {
      const wanted = normalizeLine(check.line);
      const has = (state.files[check.path]?.content ?? '').split('\n').some((l) => normalizeLine(l) === wanted && !l.trim().startsWith('#'));
      return has === check.expected;
    }
    case 'container_running':
      return (state.docker?.containers[check.name]?.status === 'running') === check.expected;
    case 'container_autostart': {
      const c = state.docker?.containers[check.name];
      return (!!c && autostarts(c)) === check.expected;
    }
    case 'http_ok': {
      const r = httpGet(state, check.url);
      return r.ok && r.status >= 200 && r.status < 300 && (!check.contains || r.body.includes(check.contains));
    }
    case 'file_mode_at_most':
      return !!state.files[check.path] && modeAtMost(modeOf(state, check.path), check.mode);
    case 'firewall_allows':
      return firewallAllows(state, check.from, check.port) === check.expected;
    case 'file_readable_by':
      return canRead(state, check.path, check.user) === check.expected;
  }
}

function normalizeLine(l: string): string {
  return l.trim().replace(/\s+/g, ' ');
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
    if ((c.kind === 'host_reachable' || c.kind === 'name_resolves') && !m.network) {
      issues.push(`Validateur « ${v.description} » : la machine n’a pas de réseau décrit.`);
    }
    if ((c.kind === 'container_running' || c.kind === 'container_autostart') && !m.docker) {
      issues.push(`Validateur « ${v.description} » : la machine n’a pas de Docker décrit.`);
    }
    if ((c.kind === 'file_mode_at_most' || c.kind === 'file_readable_by') && !m.files[c.path]) {
      issues.push(`Validateur « ${v.description} » : fichier ${c.path} absent de la machine.`);
    }
    if (c.kind === 'firewall_allows' && !m.firewall) {
      issues.push(`Validateur « ${v.description} » : la machine n’a pas de pare-feu décrit.`);
    }
    if (c.kind === 'disk_usage_below' && !m.mounts.some((x) => x.target === c.mount)) {
      issues.push(`Validateur « ${v.description} » : montage ${c.mount} inconnu.`);
    }
  }
  if (spec.validators.every((v) => passes(m, v.check))) issues.push('La machine de départ passe déjà tous les validateurs : il n’y a pas de panne.');
  return issues;
}
