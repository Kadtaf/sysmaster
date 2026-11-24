import { evaluate } from './lab';
import type { MachineState } from './machine';
import { inCidr, reach, resolve } from './network';
import { run } from './shell';

function machine(): MachineState {
  return {
    hostname: 'n1', cwd: '/root', clock: '2026-01-01T00:00:00.000Z', nextPid: 10,
    dirs: ['/etc', '/root'],
    files: {
      '/etc/resolv.conf': { size: 0, content: 'nameserver 10.0.0.9\nnameserver 10.0.0.2\n' },
      '/etc/hosts': { size: 0, content: '127.0.0.1 localhost\n10.0.0.50 nas # sauvegardes\n' },
    },
    mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 10 ** 9, baseUsedBytes: 10 ** 8 }],
    services: {},
    network: {
      interfaces: [{ name: 'eth0', address: '10.0.0.15/24', up: true }],
      routes: [{ destination: 'default', via: '10.0.0.1', dev: 'eth0' }],
      hosts: {
        '10.0.0.1': { respondsToPing: true },
        '10.0.0.2': { respondsToPing: true, dns: { 'web.lan': '10.0.0.80', 'exemple.org': '93.184.216.34' } },
        '10.0.0.50': { respondsToPing: true },
        '10.0.0.80': { respondsToPing: false, http: { status: 200, body: 'ok' } },
        '93.184.216.34': { respondsToPing: true, http: { status: 200, body: 'exemple' } },
      },
    },
  };
}

describe('Réseau simulé', () => {
  it('calcule l’appartenance à un réseau', () => {
    expect(inCidr('10.0.0.200', '10.0.0.0/24')).toBe(true);
    expect(inCidr('10.0.1.1', '10.0.0.0/24')).toBe(false);
    expect(inCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('résout via /etc/hosts puis les serveurs DNS joignables, dans l’ordre', () => {
    const m = machine();
    expect(resolve(m, 'nas')).toEqual({ ok: true, ip: '10.0.0.50', via: 'hosts' });
    // 10.0.0.9 n'existe pas : on passe au serveur suivant, comme la libc.
    expect(resolve(m, 'web.lan')).toEqual({ ok: true, ip: '10.0.0.80', via: '10.0.0.2' });
    expect(resolve(m, 'inconnu.lan')).toMatchObject({ ok: false, reason: 'nxdomain' });
  });

  it('route : lien direct, passerelle, absence de route', () => {
    const m = machine();
    expect(reach(m.network, '10.0.0.50')).toEqual({ ok: true, hops: 1 });
    expect(reach(m.network, '93.184.216.34')).toEqual({ ok: true, hops: 2 });
    const noRoute = run(m, 'ip route del default').state;
    expect(reach(noRoute.network, '93.184.216.34')).toEqual({ ok: false, reason: 'unreachable' });
    expect(run(noRoute, 'ping exemple.org').output).toBe('ping: connect: Network is unreachable');
  });

  it('ip route add refuse une passerelle hors du réseau local', () => {
    const noRoute = run(machine(), 'ip route del default').state;
    expect(run(noRoute, 'ip route add default via 192.168.1.1')).toMatchObject({ exitCode: 2, output: 'Error: Nexthop has invalid gateway.' });
    const fixed = run(noRoute, 'sudo ip route add default via 10.0.0.1').state;
    expect(run(fixed, 'ip route').output).toContain('default via 10.0.0.1 dev eth0');
    expect(run(fixed, 'ip route add default via 10.0.0.1').output).toBe('RTNETLINK answers: File exists');
  });

  it('une interface arrêtée coupe tout, ip link set la relance', () => {
    const down = run(machine(), 'ip link set dev eth0 down').state;
    expect(run(down, 'ping -c 1 10.0.0.1').exitCode).toBe(2);
    expect(run(down, 'ip a').output).toContain('state DOWN');
    const up = run(down, 'ip link set eth0 up').state;
    expect(run(up, 'ping -c 1 10.0.0.1').exitCode).toBe(0);
  });

  it('curl distingue nom inconnu, absence de route, serveur sans service web', () => {
    const m = machine();
    expect(run(m, 'curl http://web.lan').output).toBe('ok');
    expect(run(m, 'curl https://inconnu.lan')).toMatchObject({ exitCode: 6 });
    expect(run(m, 'curl http://nas')).toMatchObject({ exitCode: 7, output: expect.stringContaining('Connection refused') });
    expect(run(m, 'curl -I http://exemple.org').output).toMatch(/^HTTP\/1\.1 200 OK/);
  });

  it('dig, nslookup et host interrogent le serveur demandé', () => {
    const m = machine();
    expect(run(m, 'dig @10.0.0.9 web.lan')).toMatchObject({ exitCode: 9, output: expect.stringContaining('no servers could be reached') });
    expect(run(m, 'host web.lan').output).toBe('web.lan has address 10.0.0.80');
    expect(run(m, 'nslookup inconnu.lan').output).toContain('NXDOMAIN');
  });

  it('echo > et sed -i écrivent dans les fichiers ; les validateurs lisent le résultat', () => {
    let m = run(machine(), "echo 'nameserver 10.0.0.2' > /etc/resolv.conf").state;
    expect(m.files['/etc/resolv.conf'].content).toBe('nameserver 10.0.0.2\n');
    m = run(m, 'echo "search lan" >> /etc/resolv.conf').state;
    m = run(m, "sed -i 's/search lan/search exemple.lan/' /etc/resolv.conf").state;
    expect(m.files['/etc/resolv.conf'].content).toBe('nameserver 10.0.0.2\nsearch exemple.lan\n');
    expect(run(m, 'echo x > /absent/f').exitCode).toBe(1);
    const checks = evaluate(m, [
      { description: 'ligne', check: { kind: 'file_has_line', path: '/etc/resolv.conf', line: 'search  exemple.lan', expected: true } },
      { description: 'ancien', check: { kind: 'file_has_line', path: '/etc/resolv.conf', line: 'nameserver 10.0.0.9', expected: false } },
      { description: 'web', check: { kind: 'name_resolves', name: 'web.lan' } },
      { description: 'ping web', check: { kind: 'host_reachable', target: 'web.lan' } },
    ]);
    expect(checks.map((c) => c.passed)).toEqual([true, true, true, false]);
  });

  it('une machine sans réseau le dit', () => {
    const { network: _omit, ...m } = machine();
    expect(run(m, 'ip a').output).toContain('pas de réseau');
  });
});
