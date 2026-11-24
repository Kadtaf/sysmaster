import { passes } from './lab';
import { canRead, type MachineState } from './machine';
import { applyChmod, firewallAllows, modeAtMost } from './security';
import { run } from './shell';

function machine(): MachineState {
  return {
    hostname: 's1', cwd: '/root', clock: '2026-01-01T00:00:00.000Z', nextPid: 10,
    dirs: ['/root', '/etc', '/srv'],
    files: {
      '/etc/group': { size: 40, content: 'www-data:x:33:\nadm:x:4:alice\n' },
      '/srv/secret': { size: 10, content: 'motdepasse\n', mode: '644', owner: 'root', group: 'www-data' },
      '/srv/journal': { size: 10, content: 'a\nb\n', mode: '640', owner: 'root', group: 'adm' },
    },
    mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 10 ** 9, baseUsedBytes: 10 ** 8 }],
    services: {
      app: { description: 'app', active: 'active', enabled: true, process: 'app', ports: [], user: 'www-data', needsFiles: ['/srv/secret'], journal: [] },
    },
    firewall: { active: true, defaultIncoming: 'deny', rules: [{ action: 'allow', port: 22 }] },
  };
}

describe('Droits des fichiers', () => {
  it('chmod octal et symbolique', () => {
    expect(applyChmod('644', '640')).toBe('640');
    expect(applyChmod('644', '0600')).toBe('600');
    expect(applyChmod('644', 'o-r')).toBe('640');
    expect(applyChmod('644', 'go-rwx')).toBe('600');
    expect(applyChmod('600', 'u+x,g=r')).toBe('740');
    expect(applyChmod('644', '+x')).toBe('755');
    expect(applyChmod('644', 'z+r')).toBeNull();
  });

  it('« au plus » compare bit à bit', () => {
    expect(modeAtMost('600', '640')).toBe(true);
    expect(modeAtMost('644', '640')).toBe(false);
    expect(modeAtMost('400', '600')).toBe(true);
  });

  it('lecture : propriétaire, groupe (y compris /etc/group), autres ; root lit tout', () => {
    const m = machine();
    expect(canRead(m, '/srv/secret', 'nobody')).toBe(true);
    expect(canRead(m, '/srv/journal', 'nobody')).toBe(false);
    expect(canRead(m, '/srv/journal', 'alice')).toBe(true);
    expect(canRead(m, '/srv/journal', 'root')).toBe(true);
    const locked = run(m, 'chmod 600 /srv/secret').state;
    expect(canRead(locked, '/srv/secret', 'www-data')).toBe(false);
  });

  it('ls -l et stat montrent droits, propriétaire et groupe', () => {
    const m = machine();
    expect(run(m, 'ls -l /srv').output).toMatch(/-rw-r--r-- 1 root\s+www-data .* secret/);
    expect(run(m, "stat -c '%a %U:%G' /srv/journal").output).toBe('640 root:adm');
    const after = run(m, 'chown alice:adm /srv/secret').state;
    expect(run(after, "stat -c '%U:%G' /srv/secret").output).toBe('alice:adm');
  });

  it('un service qui ne peut plus lire son fichier échoue au redémarrage', () => {
    let m = run(machine(), 'chmod 600 /srv/secret').state;
    m = run(m, 'systemctl restart app').state;
    expect(m.services.app.active).toBe('failed');
    expect(m.services.app.journal.join('\n')).toContain('Permission denied');
    m = run(m, 'chmod 640 /srv/secret').state;
    expect(run(m, 'systemctl start app').state.services.app.active).toBe('active');
  });

  it('les écritures (echo, sed) gardent les droits du fichier', () => {
    const m = run(run(machine(), 'chmod 600 /srv/secret').state, "sed -i 's/motdepasse/autre/' /srv/secret").state;
    expect(m.files['/srv/secret'].mode).toBe('600');
    expect(run(m, "echo x >> /srv/secret").state.files['/srv/secret'].mode).toBe('600');
  });
});

describe('Pare-feu ufw', () => {
  it('la première règle qui correspond gagne', () => {
    let m = run(machine(), 'ufw deny from 203.0.113.9').state;
    expect(firewallAllows(m, '203.0.113.9', 22)).toBe(true);
    expect(firewallAllows(m, '203.0.113.9', 80)).toBe(false);
    m = run(m, 'ufw insert 1 deny from 203.0.113.9').state;
    expect(m.firewall!.rules).toHaveLength(2);
    expect(firewallAllows(m, '203.0.113.9', 22)).toBe(true);
  });

  it('insert place la règle en tête ; status numbered la montre', () => {
    const m = run(machine(), 'ufw insert 1 deny from 203.0.113.0/24 to any port 22').state;
    expect(firewallAllows(m, '203.0.113.77', 22)).toBe(false);
    expect(firewallAllows(m, '198.51.100.1', 22)).toBe(true);
    const out = run(m, 'ufw status numbered').output;
    expect(out).toMatch(/\[ 1\] 22\/tcp\s+DENY IN\s+203\.0\.113\.0\/24/);
    expect(out).toMatch(/\[ 2\] 22\/tcp\s+ALLOW IN\s+Anywhere/);
  });

  it('delete, default, disable', () => {
    let m = run(machine(), 'ufw delete 1').state;
    expect(firewallAllows(m, '1.2.3.4', 22)).toBe(false);
    m = run(m, 'ufw allow ssh').state;
    expect(firewallAllows(m, '1.2.3.4', 22)).toBe(true);
    expect(run(m, 'ufw delete allow 22/tcp').state.firewall!.rules).toHaveLength(0);
    expect(firewallAllows(run(m, 'ufw default allow incoming').state, '1.2.3.4', 8080)).toBe(true);
    expect(firewallAllows(run(m, 'ufw disable').state, '1.2.3.4', 8080)).toBe(true);
    expect(run(m, 'ufw insert 9 deny from 1.2.3.4').output).toContain('Invalid position');
    expect(run(m, 'ufw allow 22').output).toBe('Skipping adding existing rule');
  });

  it('vérification firewall_allows', () => {
    const m = machine();
    expect(passes(m, { kind: 'firewall_allows', from: '1.2.3.4', port: 22, expected: true })).toBe(true);
    expect(passes(m, { kind: 'firewall_allows', from: '1.2.3.4', port: 80, expected: false })).toBe(true);
  });
});

describe('Filtres', () => {
  it('grep sur fichier, -c, -v ; uniq -c, sort -rn, wc -l, cut', () => {
    const log = 'x from 1.1.1.1\nx from 2.2.2.2\nx from 1.1.1.1\ny ok\n';
    const m = { ...machine(), files: { ...machine().files, '/srv/log': { size: log.length, content: log } } };
    expect(run(m, 'grep -c from /srv/log').output).toBe('3');
    expect(run(m, 'grep -v from /srv/log').output).toBe('y ok');
    expect(run(m, 'grep absent /srv/log').exitCode).toBe(1);
    expect(run(m, "grep from /srv/log | cut -d' ' -f3 | sort | uniq -c | sort -rn").output).toBe('      2 1.1.1.1\n      1 2.2.2.2');
    expect(run(m, 'cat /srv/log | wc -l').output).toBe('4');
  });
});
