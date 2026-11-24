import type { MachineState } from './machine';

/**
 * Réseau simulé : interfaces, table de routage et « le reste du monde » (hôtes joignables,
 * serveurs DNS et leurs enregistrements, serveurs web). La résolution de noms lit les vrais
 * fichiers de la machine (/etc/hosts, /etc/resolv.conf) : les modifier change le résultat.
 */

export interface SimInterface {
  name: string;
  /** Adresse en notation CIDR, ex. « 10.0.0.15/24 ». */
  address: string;
  up: boolean;
  mac?: string;
}

export interface SimRoute {
  /** « default » ou un réseau en notation CIDR. */
  destination: string;
  via?: string;
  dev: string;
}

export interface SimRemoteHost {
  /** Nom affiché (facultatif), ex. « routeur », « dns interne ». */
  label?: string;
  respondsToPing: boolean;
  /** Serveur DNS : noms qu'il sait résoudre (nom → adresse IP). */
  dns?: Record<string, string>;
  /** Serveur web : réponse à une requête HTTP(S). */
  http?: { status: number; body: string };
}

export interface SimNetwork {
  interfaces: SimInterface[];
  routes: SimRoute[];
  /** Hôtes du monde simulé, par adresse IP. */
  hosts: Record<string, SimRemoteHost>;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIp(s: string): boolean {
  const m = IPV4.exec(s);
  return !!m && m.slice(1).every((x) => Number(x) <= 255);
}

function toInt(ip: string): number {
  return ip.split('.').reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}

export function inCidr(ip: string, cidr: string): boolean {
  const [net, bits] = cidr.split('/');
  const n = Number(bits ?? 32);
  if (!isIp(ip) || !isIp(net) || !(n >= 0 && n <= 32)) return false;
  const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
  return (toInt(ip) & mask) === (toInt(net) & mask);
}

/** Réseau d'une adresse CIDR : 10.0.0.15/24 → 10.0.0.0/24. */
export function networkOf(cidr: string): string {
  const [ip, bits] = cidr.split('/');
  const n = Number(bits);
  const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
  const v = (toInt(ip) & mask) >>> 0;
  return `${[24, 16, 8, 0].map((s) => (v >>> s) & 255).join('.')}/${n}`;
}

/** Interface active dont le réseau contient l'adresse (lien direct). */
export function onLink(net: SimNetwork, ip: string): SimInterface | undefined {
  return net.interfaces.find((i) => i.up && inCidr(ip, networkOf(i.address)));
}

export type Reach = { ok: true; hops: number } | { ok: false; reason: 'unreachable' | 'timeout' };

/**
 * Une adresse est joignable si elle est sur un réseau directement connecté (et existe), ou si une
 * route la couvre avec une passerelle elle-même joignable en direct. La route la plus précise gagne.
 */
export function reach(net: SimNetwork | undefined, ip: string): Reach {
  if (ip.startsWith('127.')) return { ok: true, hops: 0 };
  if (!net) return { ok: false, reason: 'unreachable' };
  if (onLink(net, ip)) return net.hosts[ip] ? { ok: true, hops: 1 } : { ok: false, reason: 'timeout' };
  const candidates = net.routes
    .filter((r) => r.destination === 'default' || inCidr(ip, r.destination))
    .sort((a, b) => prefix(b.destination) - prefix(a.destination));
  const route = candidates.find((r) => net.interfaces.some((i) => i.name === r.dev && i.up));
  if (!route) return { ok: false, reason: 'unreachable' };
  if (!route.via) return net.hosts[ip] ? { ok: true, hops: 1 } : { ok: false, reason: 'timeout' };
  if (!onLink(net, route.via) || !net.hosts[route.via]) return { ok: false, reason: 'timeout' };
  return net.hosts[ip] ? { ok: true, hops: 2 } : { ok: false, reason: 'timeout' };
}

function prefix(dest: string): number {
  return dest === 'default' ? 0 : Number(dest.split('/')[1] ?? 32);
}

function fileLines(state: MachineState, path: string): string[] {
  return (state.files[path]?.content ?? '').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
}

export function nameservers(state: MachineState): string[] {
  return fileLines(state, '/etc/resolv.conf')
    .map((l) => /^nameserver\s+(\S+)/.exec(l)?.[1])
    .filter((x): x is string => !!x && isIp(x));
}

export type Resolution =
  | { ok: true; ip: string; via: 'hosts' | string }
  | { ok: false; reason: 'nxdomain' | 'no_server'; tried: string[] };

/** Résout un nom comme la libc : /etc/hosts d'abord, puis chaque serveur de /etc/resolv.conf dans l'ordre. */
export function resolve(state: MachineState, name: string): Resolution {
  if (isIp(name)) return { ok: true, ip: name, via: 'hosts' };
  if (name === 'localhost') return { ok: true, ip: '127.0.0.1', via: 'hosts' };
  for (const l of fileLines(state, '/etc/hosts')) {
    const [ip, ...names] = l.split(/\s+/);
    if (isIp(ip) && names.includes(name)) return { ok: true, ip, via: 'hosts' };
  }
  const servers = nameservers(state);
  let answered = false;
  for (const ns of servers) {
    const host = state.network?.hosts[ns];
    if (!host?.dns || !reach(state.network, ns).ok) continue;
    answered = true;
    const ip = host.dns[name.toLowerCase().replace(/\.$/, '')];
    if (ip) return { ok: true, ip, via: ns };
  }
  return { ok: false, reason: answered ? 'nxdomain' : 'no_server', tried: servers };
}

/** Un nom (ou une adresse) est joignable de bout en bout : résolu, puis routé. */
export function reachable(state: MachineState, target: string): boolean {
  const r = resolve(state, target);
  return r.ok && reach(state.network, r.ip).ok && (r.ip.startsWith('127.') || !!state.network?.hosts[r.ip]?.respondsToPing);
}
