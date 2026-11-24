import { parseCompose, YamlError, type ComposeService } from './compose';
import { normalize, parentOf, type MachineState } from './machine';
import type { ShellResult } from './shell';

/**
 * Docker simulé. Une image décrit ce dont le programme a besoin (variables obligatoires, port
 * écouté) ; démarrer un conteneur applique des règles génériques : variable manquante → le
 * programme s'arrête et le conteneur redémarre en boucle ; port de l'hôte déjà pris → le
 * conteneur reste créé mais jamais démarré.
 */

export interface SimImage {
  /** Variables d'environnement sans lesquelles le programme s'arrête au démarrage. */
  requiredEnv?: string[];
  /** Port écouté dans le conteneur. */
  listens?: number;
  startupLog: string[];
  /** Réponse HTTP sur le port écouté, quand le conteneur tourne. */
  http?: { status: number; body: string };
}

export interface SimContainer {
  /** Service compose d'origine ; absent pour un conteneur lancé à la main (docker run). */
  service?: string;
  image: string;
  status: 'running' | 'restarting' | 'exited' | 'created';
  restart: string;
  restartCount: number;
  ports: { host: number; container: number }[];
  env: Record<string, string>;
  logs: string[];
  /** Le conteneur a été arrêté explicitement (docker stop) : « unless-stopped » ne le relance pas. */
  stoppedByUser?: boolean;
}

export interface SimDocker {
  /** Fichier compose du projet (ex. /srv/facturation/compose.yaml) ; le projet porte le nom de son répertoire. */
  composeFile?: string;
  images: Record<string, SimImage>;
  containers: Record<string, SimContainer>;
}

const ok = (state: MachineState, output: string): ShellResult => ({ state, output, exitCode: 0 });
const err = (state: MachineState, output: string, exitCode = 1): ShellResult => ({ state, output, exitCode });

function withDocker(state: MachineState, docker: SimDocker): MachineState {
  return { ...state, docker };
}

/** Port de l'hôte déjà utilisé : par un service de la machine ou un autre conteneur démarré. */
function portOwner(state: MachineState, port: number, except: string): string | null {
  for (const [name, s] of Object.entries(state.services)) {
    if (s.active === 'active' && s.ports.includes(port)) return name;
  }
  for (const [name, c] of Object.entries(state.docker?.containers ?? {})) {
    if (name !== except && (c.status === 'running' || c.status === 'restarting') && c.ports.some((p) => p.host === port)) return name;
  }
  return null;
}

/** Démarre un conteneur selon les règles de son image. Renvoie l'erreur du démon, s'il y en a une. */
function startContainer(state: MachineState, name: string): { state: MachineState; error?: string } {
  const docker = state.docker!;
  const c = docker.containers[name];
  for (const p of c.ports) {
    if (portOwner(state, p.host, name)) {
      return {
        state,
        error: `Error response from daemon: driver failed programming external connectivity on endpoint ${name}: Bind for 0.0.0.0:${p.host} failed: port is already allocated`,
      };
    }
  }
  const image = docker.images[c.image];
  const t = state.clock.replace(/\.\d+Z$/, 'Z');
  const missing = (image?.requiredEnv ?? []).filter((v) => !c.env[v]);
  let next: SimContainer;
  if (!image) {
    next = { ...c, status: 'exited', logs: [...c.logs, `${t} exec: image ${c.image} introuvable dans ce lab`] };
  } else if (missing.length) {
    const crash = [
      `${t} Traceback (most recent call last):`,
      `${t}   File "/app/config.py", line 12, in <module>`,
      `${t}     DATABASE = os.environ["${missing[0]}"]`,
      `${t} KeyError: '${missing[0]}'`,
      `${t} ERREUR : variable d'environnement obligatoire manquante : ${missing[0]}`,
    ];
    const loops = c.restart === 'no' ? 0 : 7;
    next = {
      ...c,
      status: c.restart === 'no' ? 'exited' : 'restarting',
      restartCount: c.restartCount + loops,
      logs: [...c.logs, ...crash, ...(loops ? crash : [])].slice(-40),
      stoppedByUser: false,
    };
  } else {
    next = { ...c, status: 'running', logs: [...c.logs, ...image.startupLog.map((l) => `${t} ${l}`)].slice(-40), stoppedByUser: false };
  }
  return { state: withDocker(state, { ...docker, containers: { ...docker.containers, [name]: next } }) };
}

function stopContainer(state: MachineState, name: string): MachineState {
  const docker = state.docker!;
  const c = docker.containers[name];
  return withDocker(state, { ...docker, containers: { ...docker.containers, [name]: { ...c, status: 'exited', stoppedByUser: true } } });
}

/** Le conteneur repartira-t-il au prochain démarrage du démon (redémarrage de la machine) ? */
export function autostarts(c: SimContainer): boolean {
  if (c.restart === 'always') return true;
  if (c.restart === 'unless-stopped') return !c.stoppedByUser;
  return false;
}

/** Réponse HTTP d'un port publié sur l'hôte, si un conteneur démarré l'écoute. */
export function publishedHttp(state: MachineState, port: number): { status: number; body: string } | null {
  for (const c of Object.values(state.docker?.containers ?? {})) {
    if (c.status !== 'running') continue;
    const image = state.docker!.images[c.image];
    const p = c.ports.find((x) => x.host === port);
    if (p && image?.http && (image.listens === undefined || image.listens === p.container)) return image.http;
  }
  return null;
}

function status(c: SimContainer): string {
  switch (c.status) {
    case 'running': return 'Up 2 minutes';
    case 'restarting': return 'Restarting (1) 4 seconds ago';
    case 'exited': return 'Exited (0) 1 minute ago';
    case 'created': return 'Created';
  }
}

function ps(state: MachineState, all: boolean, only?: (name: string, c: SimContainer) => boolean): string {
  const rows = Object.entries(state.docker!.containers).filter(([n, c]) => (all || c.status === 'running' || c.status === 'restarting') && (!only || only(n, c)));
  const w = Math.max(5, ...rows.map(([, c]) => c.image.length));
  const out = [`CONTAINER ID   ${'IMAGE'.padEnd(w)}   STATUS                         PORTS                    NAMES`];
  for (const [i, [name, c]] of rows.entries()) {
    const ports = c.status === 'running' ? c.ports.map((p) => `0.0.0.0:${p.host}->${p.container}/tcp`).join(', ') : '';
    out.push(`${(0x3f2a9c1b0000 + i * 0x1111).toString(16).slice(0, 12)}   ${c.image.padEnd(w)}   ${status(c).padEnd(30)} ${ports.padEnd(24)} ${name}`);
  }
  return out.join('\n');
}

function container(state: MachineState, name: string | undefined): SimContainer | ShellResult {
  if (!name) return err(state, 'docker : précisez le nom du conteneur', 1);
  const c = state.docker!.containers[name];
  return c ?? err(state, `Error response from daemon: No such container: ${name}`, 1);
}

const isResult = (x: SimContainer | ShellResult): x is ShellResult => 'exitCode' in x;

export function docker(state: MachineState, args: string[]): ShellResult {
  if (!state.docker) return err(state, 'docker: command not found', 127);
  const [verb, ...rest] = args;
  const names = rest.filter((a) => !a.startsWith('-'));
  switch (verb) {
    case 'ps':
      return ok(state, ps(state, rest.includes('-a') || rest.includes('--all')));
    case 'logs': {
      const c = container(state, names.find((n) => rest[rest.indexOf(n) - 1] !== '--tail' && rest[rest.indexOf(n) - 1] !== '-n') ?? names[names.length - 1]);
      if (isResult(c)) return c;
      const tailIdx = Math.max(rest.indexOf('--tail'), rest.indexOf('-n'));
      const n = tailIdx >= 0 ? Number(rest[tailIdx + 1]) : NaN;
      return ok(state, (Number.isFinite(n) ? c.logs.slice(-n) : c.logs).join('\n'));
    }
    case 'inspect': {
      const c = container(state, names[0]);
      if (isResult(c)) return c;
      return ok(state, JSON.stringify([{
        Name: `/${names[0]}`, State: { Status: c.status, Restarting: c.status === 'restarting' }, RestartCount: c.restartCount,
        Config: { Image: c.image, Env: Object.entries(c.env).map(([k, v]) => `${k}=${v}`) },
        HostConfig: { RestartPolicy: { Name: c.restart }, PortBindings: Object.fromEntries(c.ports.map((p) => [`${p.container}/tcp`, [{ HostPort: String(p.host) }]])) },
      }], null, 2));
    }
    case 'start':
    case 'restart': {
      let next = state;
      const out: string[] = [];
      for (const n of names) {
        const c = container(next, n);
        if (isResult(c)) return c;
        if (verb === 'restart') next = stopContainer(next, n);
        const r = startContainer(next, n);
        if (r.error) return err(r.state, `${r.error}\nError: failed to start containers: ${n}`);
        next = r.state;
        out.push(n);
      }
      return ok(next, out.join('\n'));
    }
    case 'stop': {
      let next = state;
      for (const n of names) {
        const c = container(next, n);
        if (isResult(c)) return c;
        next = stopContainer(next, n);
      }
      return ok(next, names.join('\n'));
    }
    case 'rm': {
      const force = rest.includes('-f') || rest.includes('--force');
      const containers = { ...state.docker.containers };
      for (const n of names) {
        const c = containers[n];
        if (!c) return err(state, `Error response from daemon: No such container: ${n}`);
        if (!force && (c.status === 'running' || c.status === 'restarting')) {
          return err(state, `Error response from daemon: cannot remove container "/${n}": container is running: stop the container before removing or force remove`);
        }
        delete containers[n];
      }
      return ok(withDocker(state, { ...state.docker, containers }), names.join('\n'));
    }
    case 'update': {
      const policy = rest.find((a) => a.startsWith('--restart='))?.split('=')[1] ?? (rest.includes('--restart') ? rest[rest.indexOf('--restart') + 1] : undefined);
      const target = names.filter((n) => n !== policy)[0];
      if (!policy) return err(state, 'docker update : seule l’option --restart=<politique> est simulée');
      if (!['no', 'always', 'unless-stopped', 'on-failure'].includes(policy)) return err(state, `invalid restart policy: ${policy}`);
      const c = container(state, target);
      if (isResult(c)) return c;
      return ok(withDocker(state, { ...state.docker, containers: { ...state.docker.containers, [target!]: { ...c, restart: policy } } }), target!);
    }
    case 'compose':
      return compose(state, rest);
    case 'images':
      return ok(state, ['REPOSITORY:TAG', ...Object.keys(state.docker.images)].join('\n'));
    default:
      return err(state, `docker : « ${verb ?? ''} » n'est pas simulé (ps, logs, inspect, start, stop, restart, rm, update, images, compose)`);
  }
}

function compose(state: MachineState, args: string[]): ShellResult {
  const d = state.docker!;
  const fIdx = args.indexOf('-f');
  const file = fIdx >= 0 ? normalize(args[fIdx + 1] ?? '', state.cwd) : d.composeFile && parentOf(d.composeFile) === state.cwd ? d.composeFile : undefined;
  const rest = fIdx >= 0 ? [...args.slice(0, fIdx), ...args.slice(fIdx + 2)] : args;
  const [verb, ...opts] = rest;
  if (!file || !state.files[file]) {
    return err(state, 'no configuration file provided: not found\n(placez-vous dans le répertoire du projet, ou utilisez -f <fichier>)', 14);
  }
  let spec: Record<string, ComposeService>;
  try {
    spec = parseCompose(state.files[file].content ?? '').services;
  } catch (e) {
    return err(state, e instanceof YamlError ? `${file}: ${e.message}` : String(e), 15);
  }
  const prefix = parentOf(file).split('/').pop()!;
  const nameOf = (service: string) => `${prefix}-${service}-1`;
  switch (verb) {
    case 'config':
      return ok(state, state.files[file].content ?? '');
    case 'ps':
      return ok(state, ps(state, true, (_, c) => !!c.service && Object.keys(spec).includes(c.service)));
    case 'logs': {
      const service = opts.find((o) => !o.startsWith('-'));
      const lines = Object.entries(d.containers)
        .filter(([, c]) => c.service && (!service || c.service === service))
        .flatMap(([n, c]) => c.logs.map((l) => `${n}  | ${l}`));
      return ok(state, lines.join('\n'));
    }
    case 'down': {
      const containers = Object.fromEntries(Object.entries(d.containers).filter(([, c]) => !c.service || !(c.service in spec)));
      return ok(withDocker(state, { ...d, containers }), Object.keys(spec).map((s) => ` ✔ Container ${nameOf(s)}  Removed`).join('\n'));
    }
    case 'up': {
      if (!opts.includes('-d') && !opts.includes('--detach')) {
        return err(state, 'Dans ce lab, lancez le projet en arrière-plan : docker compose up -d');
      }
      let next = state;
      const out: string[] = [];
      for (const [service, s] of Object.entries(spec)) {
        const name = nameOf(service);
        const current = next.docker!.containers[name];
        const same = current && current.image === s.image && current.restart === s.restart &&
          JSON.stringify(current.env) === JSON.stringify(s.env) && JSON.stringify(current.ports) === JSON.stringify(s.ports);
        if (same && current.status === 'running') {
          out.push(` ✔ Container ${name}  Running`);
          continue;
        }
        // Configuration changée (ou conteneur arrêté) : compose recrée le conteneur.
        const fresh: SimContainer = { service, image: s.image, status: 'created', restart: s.restart, restartCount: 0, ports: s.ports, env: s.env, logs: [] };
        next = withDocker(next, { ...next.docker!, containers: { ...next.docker!.containers, [name]: same ? { ...current, status: 'created' } : fresh } });
        out.push(` ✔ Container ${name}  ${same ? 'Started' : 'Recreated'}`);
        const r = startContainer(next, name);
        if (r.error) return err(r.state, [...out.slice(0, -1), ` ✘ Container ${name}  Error`, r.error].join('\n'));
        next = r.state;
      }
      return ok(next, out.join('\n'));
    }
    case 'restart': {
      let next = state;
      for (const service of Object.keys(spec)) {
        const name = nameOf(service);
        if (!next.docker!.containers[name]) continue;
        const r = startContainer(stopContainer(next, name), name);
        if (r.error) return err(r.state, r.error);
        next = r.state;
      }
      return ok(next, Object.keys(spec).map((s) => ` ✔ Container ${nameOf(s)}  Started`).join('\n'));
    }
    default:
      return err(state, `docker compose : « ${verb ?? ''} » n'est pas simulé (ps, logs, up -d, down, restart, config)`);
  }
}

