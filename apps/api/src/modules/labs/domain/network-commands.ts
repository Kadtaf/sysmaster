import type { MachineState } from './machine';
import { inCidr, isIp, nameservers, networkOf, onLink, reach, resolve, type SimNetwork } from './network';
import type { ShellResult } from './shell';

/** Commandes réseau de la machine simulée : ip, ping, dig/nslookup/host, curl. */

const ok = (state: MachineState, output: string): ShellResult => ({ state, output, exitCode: 0 });
const err = (state: MachineState, output: string, exitCode = 1): ShellResult => ({ state, output, exitCode });

const NO_NET = 'Cette machine simulée n’a pas de réseau décrit dans ce lab.';

function withNetwork(state: MachineState, net: SimNetwork): MachineState {
  return { ...state, network: net };
}

export function ip(state: MachineState, args: string[]): ShellResult {
  const net = state.network;
  if (!net) return err(state, NO_NET);
  const [object = 'help', ...rest] = args.filter((a) => a !== '-br' && a !== '-4');
  if (/^a(d(dr?|dress)?)?$/.test(object)) {
    const out = [
      '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN',
      '    inet 127.0.0.1/8 scope host lo',
      ...net.interfaces.flatMap((i, k) => [
        `${k + 2}: ${i.name}: <BROADCAST,MULTICAST${i.up ? ',UP,LOWER_UP' : ''}> mtu 1500 state ${i.up ? 'UP' : 'DOWN'}`,
        `    link/ether ${i.mac ?? '52:54:00:12:34:56'} brd ff:ff:ff:ff:ff:ff`,
        `    inet ${i.address} scope global ${i.name}`,
      ]),
    ];
    return ok(state, out.join('\n'));
  }
  if (/^r(o(u(te?)?)?)?$/.test(object)) return route(state, net, rest);
  if (/^l(i(nk?)?)?$/.test(object)) return link(state, net, rest);
  return err(state, 'ip : objets simulés : addr, route, link (ex. ip a, ip route, ip link set eth0 up)');
}

function route(state: MachineState, net: SimNetwork, args: string[]): ShellResult {
  const [verb = 'show', ...rest] = args;
  if (verb === 'show' || verb === 'list') {
    const out = net.routes.map((r) => `${r.destination}${r.via ? ` via ${r.via}` : ''} dev ${r.dev}${r.via ? '' : ' proto kernel scope link'}`);
    // Les réseaux directement connectés apparaissent toujours (route « kernel »).
    for (const i of net.interfaces.filter((x) => x.up)) {
      const n = networkOf(i.address);
      if (!net.routes.some((r) => r.destination === n)) out.push(`${n} dev ${i.name} proto kernel scope link src ${i.address.split('/')[0]}`);
    }
    return ok(state, out.join('\n'));
  }
  if (verb === 'add' || verb === 'replace' || verb === 'del' || verb === 'delete') {
    const destination = rest[0] === '0.0.0.0/0' ? 'default' : rest[0];
    if (!destination || (destination !== 'default' && !/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(destination))) {
      return err(state, 'Error: any valid prefix is expected rather than "' + (rest[0] ?? '') + '".');
    }
    const via = valueAfter(rest, 'via');
    const devArg = valueAfter(rest, 'dev');
    if (verb === 'del' || verb === 'delete') {
      const routes = net.routes.filter((r) => r.destination !== destination);
      if (routes.length === net.routes.length) return err(state, 'RTNETLINK answers: No such process', 2);
      return ok(withNetwork(state, { ...net, routes }), '');
    }
    if (via && !isIp(via)) return err(state, `Error: inet prefix is expected rather than "${via}".`);
    const iface = devArg ? net.interfaces.find((i) => i.name === devArg) : via ? onLink(net, via) : undefined;
    if (devArg && !iface) return err(state, `Cannot find device "${devArg}"`);
    if (!iface) return err(state, 'Error: Nexthop has invalid gateway.', 2);
    if (via && !inCidr(via, networkOf(iface.address))) return err(state, 'Error: Nexthop has invalid gateway.', 2);
    if (verb === 'add' && net.routes.some((r) => r.destination === destination)) return err(state, 'RTNETLINK answers: File exists', 2);
    const routes = [...net.routes.filter((r) => r.destination !== destination), { destination, via, dev: iface.name }];
    return ok(withNetwork(state, { ...net, routes }), '');
  }
  return err(state, `ip route : « ${verb} » n'est pas simulé (show, add, replace, del)`);
}

function link(state: MachineState, net: SimNetwork, args: string[]): ShellResult {
  if (args[0] === 'show' || args.length === 0) {
    return ok(state, net.interfaces.map((i, k) => `${k + 2}: ${i.name}: state ${i.up ? 'UP' : 'DOWN'}`).join('\n'));
  }
  if (args[0] !== 'set') return err(state, 'ip link : seuls « show » et « set <interface> up|down » sont simulés');
  const rest = args.slice(1).filter((a) => a !== 'dev');
  const name = rest[0];
  const updown = rest[1];
  const iface = net.interfaces.find((i) => i.name === name);
  if (!iface) return err(state, `Cannot find device "${name ?? ''}"`);
  if (updown !== 'up' && updown !== 'down') return err(state, 'ip link set : précisez up ou down');
  const interfaces = net.interfaces.map((i) => (i.name === name ? { ...i, up: updown === 'up' } : i));
  return ok(withNetwork(state, { ...net, interfaces }), '');
}

function valueAfter(args: string[], key: string): string | undefined {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
}

function resolveError(state: MachineState, tool: string, name: string): ShellResult {
  return err(state, `${tool}: ${name}: Temporary failure in name resolution`, 2);
}

export function ping(state: MachineState, args: string[]): ShellResult {
  const target = args.filter((a, i) => !a.startsWith('-') && !(args[i - 1] ?? '').match(/^-[cwWi]$/))[0];
  const countArg = args.indexOf('-c');
  const count = Math.min(5, Math.max(1, Number(countArg >= 0 ? args[countArg + 1] : 4) || 4));
  if (!target) return err(state, 'ping: usage error: Destination address required', 2);
  const r = resolve(state, target);
  if (!r.ok) return resolveError(state, 'ping', target);
  const path = reach(state.network, r.ip);
  if (!path.ok && path.reason === 'unreachable') return err(state, 'ping: connect: Network is unreachable', 2);
  const head = `PING ${target} (${r.ip}) 56(84) bytes of data.`;
  const host = r.ip.startsWith('127.') ? { respondsToPing: true } : state.network?.hosts[r.ip];
  if (!path.ok || !host?.respondsToPing) {
    return err(state, `${head}\n\n--- ${target} ping statistics ---\n${count} packets transmitted, 0 received, 100% packet loss, time ${count * 1000 - 1000}ms`);
  }
  const rtt = (path.hops === 0 ? 0.04 : path.hops === 1 ? 0.4 : 12.3).toFixed(path.hops === 0 ? 3 : 1);
  const replies = Array.from({ length: count }, (_, i) => `64 bytes from ${r.ip}: icmp_seq=${i + 1} ttl=${path.hops > 1 ? 57 : 64} time=${rtt} ms`);
  return ok(state, [head, ...replies, '', `--- ${target} ping statistics ---`, `${count} packets transmitted, ${count} received, 0% packet loss`].join('\n'));
}

/** dig, nslookup et host : interrogent les serveurs de /etc/resolv.conf (ou celui donné par @serveur). */
export function dns(state: MachineState, tool: 'dig' | 'nslookup' | 'host', args: string[]): ShellResult {
  const at = args.find((a) => a.startsWith('@'))?.slice(1);
  const words = args.filter((a) => !a.startsWith('@') && !a.startsWith('+') && !a.startsWith('-'));
  const name = words[0];
  const explicit = tool === 'nslookup' ? words[1] : at;
  if (!name) return err(state, `${tool} : précisez un nom à résoudre`);
  let ip: string | undefined;
  let server: string | undefined;
  let answered = false;
  const servers = explicit ? [explicit] : nameservers(state);
  for (const ns of servers) {
    const host = state.network?.hosts[ns];
    if (!host?.dns || !reach(state.network, ns).ok) continue;
    answered = true;
    server = ns;
    ip = host.dns[name.toLowerCase().replace(/\.$/, '')];
    if (ip) break;
  }
  if (!answered) {
    const out = tool === 'dig'
      ? `;; communications error to ${servers[0] ?? '?'}#53: timed out\n;; no servers could be reached`
      : `;; connection timed out; no servers could be reached`;
    return err(state, out, tool === 'dig' ? 9 : 1);
  }
  if (!ip) {
    const out = tool === 'dig'
      ? `;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN\n;; QUESTION SECTION:\n;${name}.\t\tIN\tA\n\n;; SERVER: ${server}#53(${server})`
      : tool === 'host' ? `Host ${name} not found: 3(NXDOMAIN)` : `Server:\t\t${server}\n\n** server can't find ${name}: NXDOMAIN`;
    return err(state, out, tool === 'dig' ? 0 : 1);
  }
  if (tool === 'dig') {
    return ok(state, `;; ->>HEADER<<- opcode: QUERY, status: NOERROR\n;; ANSWER SECTION:\n${name}.\t\t300\tIN\tA\t${ip}\n\n;; SERVER: ${server}#53(${server})`);
  }
  if (tool === 'host') return ok(state, `${name} has address ${ip}`);
  return ok(state, `Server:\t\t${server}\nAddress:\t${server}#53\n\nName:\t${name}\nAddress: ${ip}`);
}

export function curl(state: MachineState, args: string[]): ShellResult {
  const head = args.includes('-I') || args.includes('--head');
  const url = args.find((a) => !a.startsWith('-'));
  if (!url) return err(state, 'curl: no URL specified!', 2);
  const m = /^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
  if (!m) return err(state, `curl: (3) URL using bad/illegal format or missing URL`, 3);
  const hostName = m[2];
  const r = resolve(state, hostName);
  if (!r.ok) return err(state, `curl: (6) Could not resolve host: ${hostName}`, 6);
  const path = reach(state.network, r.ip);
  const http = state.network?.hosts[r.ip]?.http;
  if (!path.ok) {
    return path.reason === 'unreachable'
      ? err(state, `curl: (7) Failed to connect to ${hostName} port ${m[3] ?? (m[1] === 'http' ? 80 : 443)}: Network is unreachable`, 7)
      : err(state, `curl: (28) Failed to connect to ${hostName} port ${m[3] ?? (m[1] === 'http' ? 80 : 443)} after 10000 ms: Timeout was reached`, 28);
  }
  if (!http) return err(state, `curl: (7) Failed to connect to ${hostName} port ${m[3] ?? 443}: Connection refused`, 7);
  const status = `HTTP/1.1 ${http.status} ${http.status === 200 ? 'OK' : http.status < 400 ? 'Redirect' : 'Error'}`;
  return ok(state, head ? `${status}\ncontent-type: text/html` : http.body);
}
