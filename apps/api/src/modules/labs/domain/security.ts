import { isDir, type MachineState, normalize } from './machine';
import { inCidr, isIp } from './network';
import type { ShellResult } from './shell';

/**
 * Sécurité de la machine simulée : droits des fichiers (ls -l, chmod, chown, stat) et pare-feu
 * à la manière d'ufw. Le pare-feu applique la PREMIÈRE règle qui correspond, comme le vrai :
 * une interdiction ajoutée après une autorisation plus large ne bloque rien.
 */

export interface SimFirewallRule {
  action: 'allow' | 'deny' | 'reject';
  /** Adresse ou réseau CIDR d'origine ; absent = n'importe où. */
  from?: string;
  /** Port TCP de destination ; absent = tous les ports. */
  port?: number;
}

export interface SimFirewall {
  active: boolean;
  defaultIncoming: 'allow' | 'deny';
  rules: SimFirewallRule[];
}

const ok = (state: MachineState, output: string): ShellResult => ({ state, output, exitCode: 0 });
const err = (state: MachineState, output: string, exitCode = 1): ShellResult => ({ state, output, exitCode });

export const DEFAULT_FILE_MODE = '644';

export function modeOf(state: MachineState, path: string): string {
  return state.files[path]?.mode ?? DEFAULT_FILE_MODE;
}

/** 640 → « rw-r----- ». */
export function modeString(mode: string): string {
  return [...mode.padStart(3, '0').slice(-3)]
    .map((d) => {
      const n = Number(d);
      return `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
    })
    .join('');
}

/** Les droits réels n'accordent rien de plus que « max » (ex. 640 au plus : 600 et 640 passent, 644 non). */
export function modeAtMost(mode: string, max: string): boolean {
  const actual = parseInt(mode, 8);
  const allowed = parseInt(max, 8);
  return (actual & ~allowed) === 0;
}

const WHO: Record<string, number[]> = { u: [0], g: [1], o: [2], a: [0, 1, 2] };
const PERM: Record<string, number> = { r: 4, w: 2, x: 1 };

/** Applique un mode chmod (octal ou symbolique : u+x, go-rwx, o=r, a-w…) à des droits existants. */
export function applyChmod(current: string, spec: string): string | null {
  if (/^0?[0-7]{3}$/.test(spec)) return spec.slice(-3);
  const digits = [...current.padStart(3, '0').slice(-3)].map(Number);
  for (const clause of spec.split(',')) {
    const m = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause);
    if (!m) return null;
    const who = (m[1] || 'a').split('').flatMap((c) => WHO[c]);
    const bits = m[3].split('').reduce((acc, c) => acc | PERM[c], 0);
    for (const i of new Set(who)) {
      if (m[2] === '+') digits[i] |= bits;
      else if (m[2] === '-') digits[i] &= ~bits;
      else digits[i] = bits;
    }
  }
  return digits.join('');
}

export function chmod(state: MachineState, args: string[]): ShellResult {
  const rest = args.filter((a) => a !== '-R' && a !== '-v');
  const [spec, ...targets] = rest;
  if (!spec || !targets.length) return err(state, 'chmod: missing operand\nUsage : chmod 640 FICHIER ou chmod o-r FICHIER');
  let files = state.files;
  for (const t of targets) {
    const path = normalize(t, state.cwd);
    if (isDir(state, path)) return err(state, `chmod : ce lab ne simule les droits que sur les fichiers (${t} est un répertoire)`);
    const f = files[path];
    if (!f) return err(state, `chmod: cannot access '${t}': No such file or directory`);
    const mode = applyChmod(f.mode ?? DEFAULT_FILE_MODE, spec);
    if (mode === null) return err(state, `chmod: invalid mode: '${spec}'`);
    files = { ...files, [path]: { ...f, mode } };
  }
  return ok({ ...state, files }, '');
}

export function chown(state: MachineState, args: string[]): ShellResult {
  const rest = args.filter((a) => a !== '-R' && a !== '-v');
  const [spec, ...targets] = rest;
  const m = spec ? /^([a-z_][a-z0-9_-]*)?(?::([a-z_][a-z0-9_-]*))?$/.exec(spec) : null;
  if (!m || (!m[1] && !m[2]) || !targets.length) return err(state, 'chown: missing operand\nUsage : chown UTILISATEUR[:GROUPE] FICHIER');
  let files = state.files;
  for (const t of targets) {
    const path = normalize(t, state.cwd);
    const f = files[path];
    if (!f) return err(state, `chown: cannot access '${t}': No such file or directory`);
    files = { ...files, [path]: { ...f, owner: m[1] ?? f.owner, group: m[2] ?? f.group } };
  }
  return ok({ ...state, files }, '');
}

export function stat(state: MachineState, args: string[]): ShellResult {
  let format: string | undefined;
  const targets: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-c' || args[i] === '--format') format = args[++i];
    else if (args[i].startsWith('--format=')) format = args[i].slice(9);
    else if (!args[i].startsWith('-')) targets.push(args[i]);
  }
  if (!targets.length) return err(state, 'stat: missing operand');
  const out: string[] = [];
  for (const t of targets) {
    const path = normalize(t, state.cwd);
    const dir = isDir(state, path);
    const f = state.files[path];
    if (!dir && !f) return err(state, `stat: cannot statx '${t}': No such file or directory`);
    const mode = dir ? '755' : modeOf(state, path);
    const owner = f?.owner ?? 'root';
    const group = f?.group ?? 'root';
    const size = dir ? 4096 : f!.size;
    if (format) {
      out.push(format.replace(/%([aAUGnsF])/g, (_, c: string) => ({
        a: mode, A: `${dir ? 'd' : '-'}${modeString(mode)}`, U: owner, G: group, n: t, s: String(size), F: dir ? 'directory' : 'regular file',
      })[c] ?? ''));
    } else {
      out.push(
        `  File: ${t}`,
        `  Size: ${size}\tBlocks: ${Math.ceil(size / 512)}\tIO Block: 4096   ${dir ? 'directory' : 'regular file'}`,
        `Access: (0${mode}/${dir ? 'd' : '-'}${modeString(mode)})  Uid: (${owner})   Gid: (${group})`,
      );
    }
  }
  return ok(state, out.join('\n'));
}

// --- Pare-feu ---------------------------------------------------------------------------

function matches(rule: SimFirewallRule, from: string, port: number): boolean {
  const fromOk = !rule.from || rule.from === from || (rule.from.includes('/') && inCidr(from, rule.from));
  return fromOk && (rule.port === undefined || rule.port === port);
}

/** Une connexion venant de « from » vers le port local est-elle acceptée ? Première règle qui correspond. */
export function firewallAllows(state: MachineState, from: string, port: number): boolean {
  const fw = state.firewall;
  if (!fw?.active) return true;
  const rule = fw.rules.find((r) => matches(r, from, port));
  return rule ? rule.action === 'allow' : fw.defaultIncoming === 'allow';
}

const SERVICES: Record<string, number> = { ssh: 22, http: 80, https: 443, OpenSSH: 22, smtp: 25, mysql: 3306, postgresql: 5432 };

function ruleLabel(r: SimFirewallRule): { to: string; action: string; from: string } {
  return {
    to: r.port === undefined ? 'Anywhere' : `${r.port}/tcp`,
    action: `${r.action.toUpperCase()} IN`,
    from: r.from ?? 'Anywhere',
  };
}

function status(fw: SimFirewall, mode: 'plain' | 'numbered' | 'verbose'): string {
  if (!fw.active) return 'Status: inactive';
  const head = ['Status: active'];
  if (mode === 'verbose') head.push(`Default: ${fw.defaultIncoming} (incoming), allow (outgoing)`);
  const rows = fw.rules.map((r, i) => {
    const l = ruleLabel(r);
    return `${mode === 'numbered' ? `[${String(i + 1).padStart(2)}] ` : ''}${l.to.padEnd(27)}${l.action.padEnd(12)}${l.from}`;
  });
  return [...head, '', `${mode === 'numbered' ? '     ' : ''}To                         Action      From`, `${mode === 'numbered' ? '     ' : ''}--                         ------      ----`, ...rows].join('\n');
}

/**
 * Lit une règle ufw : « 22 », « 22/tcp », « ssh », « from IP », « from IP to any port 22 ».
 * Renvoie une chaîne d'erreur si la syntaxe n'est pas comprise.
 */
function parseRule(action: SimFirewallRule['action'], words: string[]): SimFirewallRule | string {
  if (!words.length) return 'ERROR: Need \'to\' or \'from\' clause';
  if (words[0] !== 'from') {
    if (words.length > 1) return `ERROR: Wrong number of arguments`;
    const p = /^(\d+)(?:\/tcp)?$/.exec(words[0]);
    const port = p ? Number(p[1]) : SERVICES[words[0]];
    if (!port || port > 65535) return `ERROR: Could not find a profile matching '${words[0]}'`;
    return { action, port };
  }
  const from = words[1];
  if (!from || !(isIp(from) || (/^[\d.]+\/\d{1,2}$/.test(from) && isIp(from.split('/')[0])) || from === 'any')) {
    return `ERROR: Bad source address`;
  }
  const rule: SimFirewallRule = { action, ...(from === 'any' ? {} : { from }) };
  const rest = words.slice(2);
  if (!rest.length) return rule;
  if (rest[0] !== 'to' || rest[1] !== 'any' || (rest.length > 2 && (rest[2] !== 'port' || rest.length !== 4))) {
    return 'ERROR: Wrong number of arguments (forme simulée : from IP [to any port N])';
  }
  if (rest.length === 4) {
    const port = /^\d+$/.test(rest[3]) ? Number(rest[3]) : SERVICES[rest[3]];
    if (!port || port > 65535) return `ERROR: Bad port '${rest[3]}'`;
    rule.port = port;
  }
  return rule;
}

const same = (a: SimFirewallRule, b: SimFirewallRule) => a.action === b.action && a.from === b.from && a.port === b.port;

export function ufw(state: MachineState, args: string[]): ShellResult {
  const fw: SimFirewall = state.firewall ?? { active: false, defaultIncoming: 'allow', rules: [] };
  const set = (next: SimFirewall, output: string) => ok({ ...state, firewall: next }, output);
  const [verb, ...rest] = args;
  switch (verb) {
    case undefined:
    case 'status':
      return ok(state, status(fw, rest[0] === 'numbered' ? 'numbered' : rest[0] === 'verbose' ? 'verbose' : 'plain'));
    case 'enable':
      return set({ ...fw, active: true }, 'Firewall is active and enabled on system startup');
    case 'disable':
      return set({ ...fw, active: false }, 'Firewall stopped and disabled on system startup');
    case 'reload':
      return ok(state, fw.active ? 'Firewall reloaded' : 'Firewall not enabled (skipping reload)');
    case 'default': {
      const [policy, direction = 'incoming'] = rest;
      if ((policy !== 'allow' && policy !== 'deny' && policy !== 'reject') || direction !== 'incoming') {
        return err(state, 'ufw default : forme simulée « ufw default deny|allow incoming »');
      }
      const p = policy === 'allow' ? 'allow' : 'deny';
      return set({ ...fw, defaultIncoming: p }, `Default incoming policy changed to '${p}'\n(be sure to update your rules accordingly)`);
    }
    case 'allow':
    case 'deny':
    case 'reject': {
      const rule = parseRule(verb, rest);
      if (typeof rule === 'string') return err(state, rule);
      if (fw.rules.some((r) => same(r, rule))) return ok(state, 'Skipping adding existing rule');
      return set({ ...fw, rules: [...fw.rules, rule] }, 'Rule added');
    }
    case 'insert': {
      const pos = Number(rest[0]);
      const action = rest[1];
      if (!Number.isInteger(pos) || pos < 1 || pos > fw.rules.length) {
        return err(state, `ERROR: Invalid position '${rest[0] ?? ''}'`);
      }
      if (action !== 'allow' && action !== 'deny' && action !== 'reject') return err(state, 'ufw insert N allow|deny|reject …');
      const rule = parseRule(action, rest.slice(2));
      if (typeof rule === 'string') return err(state, rule);
      if (fw.rules.some((r) => same(r, rule))) return ok(state, 'Skipping inserting existing rule');
      const rules = [...fw.rules];
      rules.splice(pos - 1, 0, rule);
      return set({ ...fw, rules }, 'Rule inserted');
    }
    case 'delete': {
      if (/^\d+$/.test(rest[0] ?? '')) {
        const n = Number(rest[0]);
        if (n < 1 || n > fw.rules.length) return err(state, `ERROR: Could not find rule '${n}'`);
        return set({ ...fw, rules: fw.rules.filter((_, i) => i !== n - 1) }, 'Rule deleted');
      }
      const action = rest[0];
      if (action !== 'allow' && action !== 'deny' && action !== 'reject') return err(state, 'ufw delete N, ou ufw delete allow|deny … (la règle telle qu’elle a été écrite)');
      const rule = parseRule(action, rest.slice(1));
      if (typeof rule === 'string') return err(state, rule);
      if (!fw.rules.some((r) => same(r, rule))) return err(state, 'Could not delete non-existent rule');
      return set({ ...fw, rules: fw.rules.filter((r) => !same(r, rule)) }, 'Rule deleted');
    }
    default:
      return err(state, 'ufw : formes simulées : status [numbered|verbose], enable, disable, default, allow, deny, reject, insert N, delete');
  }
}
