/**
 * Modèle d'une machine Linux simulée. L'état est un objet JSON sérialisable, stocké avec
 * l'instance du lab : chaque commande lit l'état, le transforme et renvoie un nouvel état.
 *
 * Volontairement petit : on ne reproduit que ce qu'il faut pour raisonner sur une panne
 * (fichiers et tailles, points de montage, services systemd, ports écoutés, journaux).
 */

import type { SimDocker } from './docker';
import type { SimNetwork } from './network';
import type { SimFirewall } from './security';

export interface SimFile {
  /** Taille en octets ; peut dépasser le contenu affiché (gros journal). */
  size: number;
  content?: string;
  /** Droits en octal (« 640 ») ; 644 par défaut. */
  mode?: string;
  owner?: string;
  group?: string;
}

export interface SimMount {
  target: string;
  device: string;
  sizeBytes: number;
  /** Espace occupé par ce qui n'est pas modélisé fichier par fichier (système, paquets…). */
  baseUsedBytes: number;
}

export interface SimService {
  description: string;
  active: 'active' | 'inactive' | 'failed';
  enabled: boolean;
  /** Nom du processus principal, affiché par ps et ss. */
  process: string;
  pid?: number;
  /** Ports TCP écoutés quand le service tourne. */
  ports: number[];
  /** Fichier où le service écrit en démarrant : le démarrage échoue si le disque qui le porte est plein. */
  writes?: string;
  /** Fichiers indispensables au démarrage. */
  needsFiles?: string[];
  /** Compte sous lequel tourne le service : il doit pouvoir LIRE ses needsFiles (root lit tout). */
  user?: string;
  journal: string[];
}

export interface MachineState {
  hostname: string;
  cwd: string;
  /** Horloge simulée (ISO) : avance d'une seconde par commande, pour des journaux plausibles. */
  clock: string;
  dirs: string[];
  files: Record<string, SimFile>;
  mounts: SimMount[];
  services: Record<string, SimService>;
  nextPid: number;
  /** Réseau (facultatif : les labs sans réseau n'en décrivent pas). */
  network?: SimNetwork;
  /** Docker (facultatif) : images, conteneurs et fichier compose du projet. */
  docker?: SimDocker;
  /** Pare-feu façon ufw (facultatif : absent, tout passe). */
  firewall?: SimFirewall;
}

/** Espace libre minimal pour qu'un service puisse écrire en démarrant. */
export const MIN_FREE_BYTES = 50 * 1024 * 1024;

export function normalize(path: string, cwd: string): string {
  const abs = path.startsWith('/') ? path : `${cwd.replace(/\/$/, '')}/${path}`;
  const parts: string[] = [];
  for (const p of abs.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return `/${parts.join('/')}`;
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

export function isDir(state: MachineState, path: string): boolean {
  return path === '/' || state.dirs.includes(path);
}

/** Entrées directes d'un répertoire : noms, triés. */
export function children(state: MachineState, dir: string): string[] {
  const prefix = dir === '/' ? '/' : `${dir}/`;
  const names = new Set<string>();
  for (const p of [...state.dirs, ...Object.keys(state.files)]) {
    if (p !== dir && p.startsWith(prefix)) names.add(p.slice(prefix.length).split('/')[0]);
  }
  return [...names].sort();
}

/** Taille d'un fichier, ou somme des fichiers sous un répertoire. */
export function sizeOf(state: MachineState, path: string): number {
  if (state.files[path]) return state.files[path].size;
  const prefix = path === '/' ? '/' : `${path}/`;
  return Object.entries(state.files)
    .filter(([p]) => p.startsWith(prefix))
    .reduce((sum, [, f]) => sum + f.size, 0);
}

/** Point de montage qui porte un chemin (le plus long préfixe). */
export function mountOf(state: MachineState, path: string): SimMount {
  const sorted = [...state.mounts].sort((a, b) => b.target.length - a.target.length);
  return sorted.find((m) => m.target === '/' || path === m.target || path.startsWith(`${m.target}/`)) ?? sorted[sorted.length - 1];
}

export function mountUsage(state: MachineState, mount: SimMount): { used: number; free: number; percent: number } {
  const used =
    mount.baseUsedBytes +
    Object.entries(state.files)
      .filter(([p]) => mountOf(state, p).target === mount.target)
      .reduce((sum, [, f]) => sum + f.size, 0);
  const free = Math.max(0, mount.sizeBytes - used);
  return { used: Math.min(used, mount.sizeBytes), free, percent: Math.min(100, Math.ceil((used / mount.sizeBytes) * 100)) };
}

export function humanSize(bytes: number): string {
  const units = ['', 'K', 'M', 'G', 'T'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  if (i === 0) return `${bytes}`;
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${units[i]}`;
}

export function tick(state: MachineState): MachineState {
  return { ...state, clock: new Date(Date.parse(state.clock) + 1000).toISOString() };
}

/** Horodatage façon journalctl : « nov. 24 14:03:11 ». */
export function stamp(state: MachineState): string {
  const d = new Date(state.clock);
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')} ${hh}:${mm}:${ss}`;
}

/**
 * Le compte peut-il lire le fichier ? Droits du propriétaire, du groupe, puis des autres,
 * comme le noyau. Appartenance aux groupes : groupe du même nom que le compte (groupe
 * principal) et membres listés dans le vrai /etc/group de la machine.
 */
export function canRead(state: MachineState, path: string, user: string): boolean {
  const f = state.files[path];
  if (!f) return false;
  if (user === 'root') return true;
  const digits = (f.mode ?? '644').padStart(3, '0').slice(-3);
  const bit = (i: number) => (Number(digits[i]) & 4) !== 0;
  if ((f.owner ?? 'root') === user) return bit(0);
  if (inGroup(state, user, f.group ?? 'root')) return bit(1);
  return bit(2);
}

export function inGroup(state: MachineState, user: string, group: string): boolean {
  if (user === group) return true;
  for (const line of (state.files['/etc/group']?.content ?? '').split('\n')) {
    const [name, , , members = ''] = line.trim().split(':');
    if (name === group && members.split(',').map((m) => m.trim()).includes(user)) return true;
  }
  return false;
}

/** Service actif qui écoute déjà un port, autre que `except`. */
export function portHolder(state: MachineState, port: number, except?: string): string | null {
  for (const [name, s] of Object.entries(state.services)) {
    if (name !== except && s.active === 'active' && s.ports.includes(port)) return name;
  }
  return null;
}

/**
 * Tente de démarrer un service. Les causes d'échec sont génériques (port pris, disque plein,
 * fichier manquant), ce qui permet d'écrire de nouveaux labs sans nouveau code.
 */
export function startService(state: MachineState, name: string): { state: MachineState; ok: boolean } {
  const s = state.services[name];
  if (s.active === 'active') return { state, ok: true };
  const host = state.hostname;
  const log = (line: string) => `${stamp(state)} ${host} ${line}`;
  const fail = (lines: string[]) => {
    const journal = [
      ...s.journal,
      log(`systemd[1]: Starting ${name}.service - ${s.description}...`),
      ...lines.map((l) => log(`${s.process}[${state.nextPid}]: ${l}`)),
      log(`systemd[1]: ${name}.service: Main process exited, code=exited, status=1/FAILURE`),
      log(`systemd[1]: ${name}.service: Failed with result 'exit-code'.`),
      log(`systemd[1]: Failed to start ${name}.service - ${s.description}.`),
    ];
    return {
      state: { ...state, nextPid: state.nextPid + 1, services: { ...state.services, [name]: { ...s, active: 'failed' as const, pid: undefined, journal } } },
      ok: false,
    };
  };

  for (const f of s.needsFiles ?? []) {
    if (!state.files[f]) return fail([`open() "${f}" failed (2: No such file or directory)`]);
    if (s.user && !canRead(state, f, s.user)) return fail([`open() "${f}" failed (13: Permission denied)`]);
  }
  for (const port of s.ports) {
    const holder = portHolder(state, port, name);
    if (holder) return fail([`bind() to 0.0.0.0:${port} failed (98: Address already in use)`]);
  }
  if (s.writes) {
    const { free } = mountUsage(state, mountOf(state, s.writes));
    if (free < MIN_FREE_BYTES) return fail([`write() to "${s.writes}" failed (28: No space left on device)`]);
  }
  const journal = [
    ...s.journal,
    log(`systemd[1]: Starting ${name}.service - ${s.description}...`),
    log(`systemd[1]: Started ${name}.service - ${s.description}.`),
  ];
  return {
    state: { ...state, nextPid: state.nextPid + 1, services: { ...state.services, [name]: { ...s, active: 'active', pid: state.nextPid, journal } } },
    ok: true,
  };
}

export function stopService(state: MachineState, name: string): MachineState {
  const s = state.services[name];
  if (s.active !== 'active') return { ...state, services: { ...state.services, [name]: { ...s, active: s.active === 'failed' ? 'failed' : 'inactive' } } };
  const journal = [
    ...s.journal,
    `${stamp(state)} ${state.hostname} systemd[1]: Stopping ${name}.service - ${s.description}...`,
    `${stamp(state)} ${state.hostname} systemd[1]: Stopped ${name}.service - ${s.description}.`,
  ];
  return { ...state, services: { ...state.services, [name]: { ...s, active: 'inactive', pid: undefined, journal } } };
}
