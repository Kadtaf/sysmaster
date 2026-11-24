import {
  children,
  humanSize,
  isDir,
  MachineState,
  mountOf,
  mountUsage,
  normalize,
  parentOf,
  sizeOf,
  startService,
  stopService,
  tick,
} from './machine';
import { docker } from './docker';
import { curl, dns, ip, ping } from './network-commands';

/**
 * Interpréteur de commandes de la machine simulée. Il ne lance jamais rien de réel : chaque
 * commande est une fonction pure de l'état. Une commande hors du jeu prévu le dit clairement,
 * au lieu de simuler un comportement faux.
 */

export interface ShellResult {
  state: MachineState;
  output: string;
  exitCode: number;
  /** Explication pédagogique quand la commande a été refusée par prudence. */
  warning?: string;
}

export const MAX_COMMAND_LENGTH = 500;

const SUPPORTED = [
  'pwd', 'cd', 'ls', 'cat', 'head', 'tail', 'df', 'du', 'rm', 'truncate',
  'systemctl', 'journalctl', 'ss', 'ps', 'echo', 'sed',
  'ip', 'ping', 'dig', 'nslookup', 'host', 'curl', 'docker', 'help',
] as const;

/** Découpe une ligne en mots, avec les guillemets simples et doubles. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

function flags(args: string[]): { opts: Set<string>; rest: string[]; values: Map<string, string> } {
  const opts = new Set<string>();
  const values = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n' || a === '-u' || a === '-s') {
      values.set(a, args[i + 1] ?? '');
      i++;
    } else if (a.startsWith('--')) {
      const [k, v] = a.split('=');
      opts.add(k);
      if (v !== undefined) values.set(k, v);
    } else if (a.startsWith('-') && a.length > 1) {
      for (const c of a.slice(1)) opts.add(`-${c}`);
    } else {
      rest.push(a);
    }
  }
  return { opts, rest, values };
}

/** Étend un motif « * » dans le dernier segment (du -sh /var/log/*). */
function expand(state: MachineState, arg: string): string[] {
  const path = normalize(arg, state.cwd);
  if (!arg.includes('*')) return [path];
  const dir = parentOf(path);
  const pattern = path.slice(dir === '/' ? 1 : dir.length + 1);
  const re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  const matches = children(state, dir).filter((n) => re.test(n) && !n.startsWith('.'));
  return matches.map((n) => (dir === '/' ? `/${n}` : `${dir}/${n}`));
}

const ok = (state: MachineState, output: string): ShellResult => ({ state, output, exitCode: 0 });
const err = (state: MachineState, output: string, exitCode = 1): ShellResult => ({ state, output, exitCode });

function lines(text: string, n: number, fromEnd: boolean): string {
  const all = text.replace(/\n$/, '').split('\n');
  return (fromEnd ? all.slice(-n) : all.slice(0, n)).join('\n');
}

function readable(state: MachineState, cmd: string, arg: string): { path: string; text?: string; error?: string } {
  const path = normalize(arg, state.cwd);
  if (isDir(state, path)) return { path, error: `${cmd}: ${arg}: Is a directory` };
  const f = state.files[path];
  if (!f) return { path, error: `${cmd}: ${arg}: No such file or directory` };
  return { path, text: f.content ?? (f.size > 0 ? `[${humanSize(f.size)} de données : seule la fin est utile, essayez tail]\n` : '') };
}

function ls(state: MachineState, args: string[]): ShellResult {
  const { opts, rest } = flags(args);
  const targets = rest.length ? rest : ['.'];
  const out: string[] = [];
  for (const t of targets) {
    const path = normalize(t, state.cwd);
    if (state.files[path]) {
      out.push(opts.has('-l') ? longLine(state, path, opts.has('-h')) : t);
      continue;
    }
    if (!isDir(state, path)) return err(state, `ls: cannot access '${t}': No such file or directory`, 2);
    const names = children(state, path).filter((n) => opts.has('-a') || !n.startsWith('.'));
    if (targets.length > 1) out.push(`${t}:`);
    if (opts.has('-l')) {
      out.push(`total ${Math.ceil(sizeOf(state, path) / 1024)}`);
      for (const n of names) out.push(longLine(state, path === '/' ? `/${n}` : `${path}/${n}`, opts.has('-h')));
    } else if (names.length) {
      out.push(names.join('  '));
    }
  }
  return ok(state, out.join('\n'));
}

function longLine(state: MachineState, path: string, human: boolean): string {
  const dir = isDir(state, path);
  const size = dir ? 4096 : state.files[path].size;
  const name = path.split('/').pop();
  return `${dir ? 'drwxr-xr-x' : '-rw-r-----'} 1 root root ${(human ? humanSize(size) : String(size)).padStart(6)} nov. 24 09:12 ${name}`;
}

function df(state: MachineState, args: string[]): ShellResult {
  const { opts, rest } = flags(args);
  const fmt = (n: number) => (opts.has('-h') ? humanSize(n) : String(Math.ceil(n / 1024)));
  const mounts = rest.length ? rest.map((r) => mountOf(state, normalize(r, state.cwd))) : state.mounts;
  const out = [`Filesystem      ${opts.has('-h') ? ' Size  Used Avail' : '1K-blocks      Used Available'} Use% Mounted on`];
  for (const m of [...new Set(mounts)]) {
    const u = mountUsage(state, m);
    out.push(
      `${m.device.padEnd(15)} ${fmt(m.sizeBytes).padStart(5)} ${fmt(u.used).padStart(5)} ${fmt(u.free).padStart(5)} ${`${u.percent}%`.padStart(4)} ${m.target}`,
    );
  }
  return ok(state, out.join('\n'));
}

function du(state: MachineState, args: string[]): ShellResult {
  const { opts, rest } = flags(args);
  const targets = (rest.length ? rest : ['.']).flatMap((t) => expand(state, t));
  if (!targets.length) return err(state, `du: cannot access '${rest[0]}': No such file or directory`);
  const fmt = (n: number) => (opts.has('-h') ? humanSize(n) : String(Math.ceil(n / 1024)));
  const out: string[] = [];
  for (const t of targets) {
    if (!state.files[t] && !isDir(state, t)) return err(state, `du: cannot access '${t}': No such file or directory`);
    if (!opts.has('-s') && isDir(state, t)) {
      for (const n of children(state, t)) {
        const p = t === '/' ? `/${n}` : `${t}/${n}`;
        if (isDir(state, p)) out.push(`${fmt(sizeOf(state, p))}\t${p}`);
      }
    }
    out.push(`${fmt(sizeOf(state, t))}\t${t}`);
  }
  return ok(state, out.join('\n'));
}

/** Chemins que l'on refuse d'effacer : la leçon est de comprendre ce qu'on efface. */
const PROTECTED = ['/', '/bin', '/boot', '/etc', '/home', '/lib', '/root', '/sbin', '/usr', '/var', '/var/log', '/var/lib'];

function rm(state: MachineState, args: string[]): ShellResult {
  const { opts, rest } = flags(args);
  if (!rest.length) return err(state, 'rm: missing operand');
  const recursive = opts.has('-r') || opts.has('-R') || opts.has('--recursive');
  let next = state;
  for (const t of rest.flatMap((r) => expand(state, r))) {
    if (PROTECTED.includes(t)) {
      return {
        state,
        output: `rm: refus d'effacer '${t}'`,
        exitCode: 1,
        warning: `Effacer ${t} détruirait le système ou ses journaux. Cherchez d'abord le fichier précis qui pose problème (du -sh, ls -lh), puis agissez sur lui seul.`,
      };
    }
    if (next.files[t]) {
      const files = { ...next.files };
      delete files[t];
      next = { ...next, files };
    } else if (isDir(next, t)) {
      if (!recursive) return err(state, `rm: cannot remove '${t}': Is a directory`);
      const prefix = `${t}/`;
      next = {
        ...next,
        dirs: next.dirs.filter((d) => d !== t && !d.startsWith(prefix)),
        files: Object.fromEntries(Object.entries(next.files).filter(([p]) => !p.startsWith(prefix))),
      };
    } else if (!opts.has('-f')) {
      return err(state, `rm: cannot remove '${t}': No such file or directory`);
    }
  }
  return ok(next, '');
}

function truncate(state: MachineState, args: string[]): ShellResult {
  const { rest, values } = flags(args);
  if (values.get('-s') !== '0') return err(state, 'truncate: seule la remise à zéro (-s 0) est simulée dans ce lab');
  if (!rest.length) return err(state, "truncate: missing file operand");
  let next = state;
  for (const t of rest) {
    const path = normalize(t, state.cwd);
    if (!next.files[path]) return err(state, `truncate: cannot open '${t}' for writing: No such file or directory`);
    next = { ...next, files: { ...next.files, [path]: { size: 0, content: '' } } };
  }
  return ok(next, '');
}

function systemctl(state: MachineState, args: string[]): ShellResult {
  const { rest } = flags(args);
  const [verb, ...units] = rest;
  const names = units.map((u) => u.replace(/\.service$/, ''));
  if (!verb) return err(state, 'systemctl: précisez une action (status, start, stop, restart, enable, disable, is-active)');
  if (verb === 'list-units' || verb === '--failed') {
    const out = Object.entries(state.services).map(([n, s]) => `  ${`${n}.service`.padEnd(24)} loaded ${s.active.padEnd(8)} ${s.description}`);
    return ok(state, out.join('\n'));
  }
  if (!names.length) return err(state, `systemctl: ${verb} attend un nom de service`);
  for (const n of names) {
    if (!state.services[n]) return err(state, `Unit ${n}.service could not be found.`, verb === 'status' ? 4 : 5);
  }
  let next = state;
  const out: string[] = [];
  let code = 0;
  for (const n of names) {
    const s = next.services[n];
    switch (verb) {
      case 'status': {
        const state3 = s.active === 'active' ? 'active (running)' : s.active === 'failed' ? 'failed (Result: exit-code)' : 'inactive (dead)';
        out.push(
          `${s.active === 'active' ? '●' : s.active === 'failed' ? '×' : '○'} ${n}.service - ${s.description}`,
          `     Loaded: loaded (/lib/systemd/system/${n}.service; ${s.enabled ? 'enabled' : 'disabled'})`,
          `     Active: ${state3}`,
          ...(s.pid ? [`   Main PID: ${s.pid} (${s.process})`] : []),
          '',
          ...s.journal.slice(-5),
        );
        if (s.active !== 'active') code = 3;
        break;
      }
      case 'is-active':
        out.push(s.active);
        if (s.active !== 'active') code = 3;
        break;
      case 'is-enabled':
        out.push(s.enabled ? 'enabled' : 'disabled');
        if (!s.enabled) code = 1;
        break;
      case 'start':
      case 'restart': {
        if (verb === 'restart') next = stopService(next, n);
        const r = startService(next, n);
        next = r.state;
        if (!r.ok) {
          out.push(
            `Job for ${n}.service failed because the control process exited with error code.`,
            `See "systemctl status ${n}.service" and "journalctl -xeu ${n}.service" for details.`,
          );
          code = 1;
        }
        break;
      }
      case 'stop':
        next = stopService(next, n);
        break;
      case 'enable':
      case 'disable':
        next = { ...next, services: { ...next.services, [n]: { ...s, enabled: verb === 'enable' } } };
        out.push(
          verb === 'enable'
            ? `Created symlink /etc/systemd/system/multi-user.target.wants/${n}.service → /lib/systemd/system/${n}.service.`
            : `Removed "/etc/systemd/system/multi-user.target.wants/${n}.service".`,
        );
        break;
      default:
        return err(state, `systemctl: l'action « ${verb} » n'est pas simulée dans ce lab`);
    }
  }
  return { state: next, output: out.join('\n'), exitCode: code };
}

function journalctl(state: MachineState, args: string[]): ShellResult {
  const { values } = flags(args);
  const unit = values.get('-u')?.replace(/\.service$/, '');
  const n = Number(values.get('-n') ?? NaN);
  let entries: string[];
  if (unit) {
    if (!state.services[unit]) return ok(state, '-- No entries --');
    entries = state.services[unit].journal;
  } else {
    entries = Object.values(state.services).flatMap((s) => s.journal).sort();
  }
  if (Number.isFinite(n) && n > 0) entries = entries.slice(-n);
  return ok(state, entries.length ? entries.join('\n') : '-- No entries --');
}

function ss(state: MachineState): ShellResult {
  const out = ['State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process'];
  for (const [, s] of Object.entries(state.services)) {
    if (s.active !== 'active') continue;
    for (const p of s.ports) {
      out.push(`LISTEN 0      511          0.0.0.0:${String(p).padEnd(5)}      0.0.0.0:*     users:(("${s.process}",pid=${s.pid},fd=6))`);
    }
  }
  return ok(state, out.join('\n'));
}

function ps(state: MachineState): ShellResult {
  const out = ['USER         PID %CPU %MEM COMMAND', 'root           1  0.0  0.4 /sbin/init'];
  for (const s of Object.values(state.services)) {
    if (s.active === 'active') out.push(`root    ${String(s.pid).padStart(8)}  0.1  1.2 ${s.process}`);
  }
  return ok(state, out.join('\n'));
}

/** Écrit dans un fichier (echo … > fichier, >> pour ajouter). Le répertoire doit exister. */
function write(state: MachineState, target: string, text: string, append: boolean): ShellResult {
  const path = normalize(target, state.cwd);
  if (isDir(state, path)) return err(state, `bash: ${target}: Is a directory`);
  if (!isDir(state, parentOf(path))) return err(state, `bash: ${target}: No such file or directory`);
  const before = state.files[path]?.content ?? '';
  const content = append ? `${before}${before && !before.endsWith('\n') ? '\n' : ''}${text}\n` : `${text}\n`;
  return ok({ ...state, files: { ...state.files, [path]: { size: content.length, content } } }, '');
}

/**
 * sed -i 's/ancien/nouveau/[g]' fichier : le motif est pris LITTÉRALEMENT (pas d'expression
 * régulière), ce qui suffit pour décommenter ou corriger une ligne et reste sans surprise.
 */
function sed(state: MachineState, args: string[]): ShellResult {
  const inPlace = args.includes('-i');
  const rest = args.filter((a) => a !== '-i');
  const [expr, target] = rest;
  if (!inPlace || !expr || !target) return err(state, "sed : seule la forme sed -i 's/ancien/nouveau/' FICHIER est simulée");
  const sep = expr[1];
  const parts = expr.slice(2).split(sep);
  if (expr[0] !== 's' || !sep || parts.length < 3) return err(state, `sed: -e expression #1, char ${expr.length}: unterminated \`s' command`);
  const [from, to, flags] = parts;
  const path = normalize(target, state.cwd);
  const f = state.files[path];
  if (!f) return err(state, `sed: can't read ${target}: No such file or directory`, 2);
  if (!from) return err(state, 'sed: -e expression #1: motif vide');
  const content = f.content ?? '';
  const replaced = content
    .split('\n')
    .map((l) => (flags.includes('g') ? l.split(from).join(to) : l.replace(from, () => to)))
    .join('\n');
  return ok({ ...state, files: { ...state.files, [path]: { size: replaced.length, content: replaced } } }, '');
}

const HELP = `Machine simulée : les commandes ne s'exécutent nulle part, elles transforment un état.
Commandes disponibles : ${SUPPORTED.join(', ')}.
Filtres après | : grep MOT, head [-n N], tail [-n N].
Vider un fichier : truncate -s 0 FICHIER ou > FICHIER.
Écrire : echo 'texte' > FICHIER (>> pour ajouter) ; corriger : sed -i 's/ancien/nouveau/' FICHIER (motif littéral).`;

function runOne(state: MachineState, words: string[]): ShellResult {
  const [cmd, ...args] = words;
  switch (cmd) {
    case 'help':
      return ok(state, HELP);
    case 'pwd':
      return ok(state, state.cwd);
    case 'cd': {
      const path = normalize(args[0] ?? '/root', state.cwd);
      if (!isDir(state, path)) return err(state, `cd: ${args[0]}: No such file or directory`);
      return ok({ ...state, cwd: path }, '');
    }
    case 'ls':
      return ls(state, args);
    case 'cat': {
      const { rest } = flags(args);
      if (!rest.length) return err(state, 'cat: précisez un fichier');
      const parts: string[] = [];
      for (const a of rest) {
        const r = readable(state, 'cat', a);
        if (r.error) return err(state, r.error);
        parts.push(r.text!.replace(/\n$/, ''));
      }
      return ok(state, parts.join('\n'));
    }
    case 'head':
    case 'tail': {
      const { rest, values } = flags(args);
      if (!rest.length) return err(state, `${cmd}: précisez un fichier`);
      const r = readable(state, cmd, rest[0]);
      if (r.error) return err(state, r.error);
      const f = state.files[r.path];
      const text = f.content ?? '';
      return ok(state, lines(text, Number(values.get('-n') ?? 10) || 10, cmd === 'tail'));
    }
    case 'df':
      return df(state, args);
    case 'du':
      return du(state, args);
    case 'rm':
      return rm(state, args);
    case 'truncate':
      return truncate(state, args);
    case 'systemctl':
      return systemctl(state, args);
    case 'journalctl':
      return journalctl(state, args);
    case 'ss':
    case 'netstat':
      return ss(state);
    case 'ps':
      return ps(state);
    case 'echo':
      return ok(state, args.join(' '));
    case 'sed':
      return sed(state, args);
    case 'ip':
      return ip(state, args);
    case 'ping':
      return ping(state, args);
    case 'dig':
    case 'nslookup':
    case 'host':
      return dns(state, cmd, args);
    case 'curl':
      return curl(state, args);
    case 'docker':
      return docker(state, args);
    default:
      return err(state, `${cmd}: commande non simulée dans ce lab. Tapez help pour la liste.`, 127);
  }
}

function filter(output: string, words: string[]): string | null {
  const [cmd, ...args] = words;
  const { rest, values, opts } = flags(args);
  if (cmd === 'grep') {
    const needle = rest[0] ?? '';
    const ci = opts.has('-i');
    return output
      .split('\n')
      .filter((l) => (ci ? l.toLowerCase().includes(needle.toLowerCase()) : l.includes(needle)))
      .join('\n');
  }
  if (cmd === 'head' || cmd === 'tail') return lines(output, Number(values.get('-n') ?? 10) || 10, cmd === 'tail');
  if (cmd === 'sort') return output.split('\n').sort().join('\n');
  return null;
}

/** Exécute une ligne : préfixe sudo accepté, redirection « > fichier » et filtres après « | ». */
export function run(state: MachineState, line: string): ShellResult {
  const trimmed = line.trim();
  if (!trimmed) return ok(state, '');
  if (trimmed.length > MAX_COMMAND_LENGTH) return err(state, 'Commande trop longue.');
  if (/[;&`$]|\|\|/.test(trimmed)) {
    return err(state, 'Une commande à la fois dans ce lab : pas de ;, &&, ||, $() ni de variables.', 2);
  }
  const clocked = tick(state);

  // « > fichier » seul (ou « : > fichier ») vide le fichier.
  const redirect = /^(?:sudo\s+)?(?::\s*)?>\s*(\S+)$/.exec(trimmed);
  if (redirect) return truncate(clocked, ['-s', '0', redirect[1]]);

  // echo … > fichier / >> fichier : la seule écriture de fichier simulée (avec sed -i).
  const echo = /^(?:sudo\s+)?echo\s+(?:-e\s+)?(.*?)\s*(>>?)\s*(\S+)$/.exec(trimmed);
  if (echo) return write(clocked, echo[3], tokenize(echo[1]).join(' '), echo[2] === '>>');

  const [first, ...pipes] = trimmed.split('|').map((s) => tokenize(s));
  const words = first[0] === 'sudo' ? first.slice(1) : first;
  if (!words.length) return ok(clocked, '');
  let result = runOne(clocked, words);
  for (const p of pipes) {
    const filtered = filter(result.output, p);
    if (filtered === null) return err(clocked, `${p[0] ?? ''}: filtre non simulé (grep, head, tail, sort)`, 127);
    result = { ...result, output: filtered };
  }
  return result;
}
