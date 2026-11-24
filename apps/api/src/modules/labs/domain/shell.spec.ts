import { specIssues } from './lab';
import type { MachineState } from './machine';
import { run, tokenize } from './shell';

const M = 1024 ** 2;

function machine(): MachineState {
  return {
    hostname: 'test',
    cwd: '/root',
    clock: '2026-11-24T09:00:00.000Z',
    nextPid: 100,
    dirs: ['/etc', '/root', '/srv', '/srv/data', '/var', '/var/log'],
    files: {
      '/etc/app.conf': { size: 12, content: 'port = 8080\n' },
      '/srv/data/a.bin': { size: 300 * M },
      '/srv/data/b.bin': { size: 100 * M },
      '/var/log/app.log': { size: 2048, content: 'ligne 1\nligne 2\nerreur fatale\nligne 4\n' },
    },
    mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 1024 * M, baseUsedBytes: 600 * M }],
    services: {
      app: { description: 'Application', active: 'inactive', enabled: false, process: 'app', ports: [8080], writes: '/var/log/app.log', needsFiles: ['/etc/app.conf'], journal: [] },
      squatter: { description: 'Occupant', active: 'active', enabled: true, process: 'squat', pid: 50, ports: [8080], journal: [] },
    },
  };
}

describe('Interpréteur de la machine simulée', () => {
  it('découpe les mots en respectant les guillemets', () => {
    expect(tokenize(`grep "erreur fatale" '/var/log/app.log'`)).toEqual(['grep', 'erreur fatale', '/var/log/app.log']);
    expect(tokenize('echo ""')).toEqual(['echo', '']);
  });

  it('navigue et lit les fichiers', () => {
    let r = run(machine(), 'cd /var/log');
    expect(r.state.cwd).toBe('/var/log');
    r = run(r.state, 'cat app.log | grep erreur');
    expect(r.output).toBe('erreur fatale');
    expect(run(r.state, 'tail -n 2 app.log').output).toBe('erreur fatale\nligne 4');
    expect(run(r.state, 'cat absent').exitCode).toBe(1);
    expect(run(r.state, 'pwd').output).toBe('/var/log');
  });

  it('mesure l’espace : df et du (avec motif *)', () => {
    const s = machine();
    expect(run(s, 'df -h').output).toMatch(/\/dev\/sda1\s+1G\s+1000M\s+24M\s+98% \//);
    expect(run(s, 'du -sh /srv/data/*').output).toBe('300M\t/srv/data/a.bin\n100M\t/srv/data/b.bin');
  });

  it('démarrage d’un service : port déjà pris, puis disque plein, puis succès', () => {
    let s = machine();
    let r = run(s, 'systemctl start app');
    expect(r.exitCode).toBe(1);
    expect(run(r.state, 'journalctl -u app').output).toContain('Address already in use');

    s = run(r.state, 'systemctl stop squatter').state;
    r = run(s, 'systemctl start app');
    expect(run(r.state, 'journalctl -u app -n 5').output).toContain('No space left on device');

    s = run(r.state, 'rm /srv/data/a.bin').state;
    r = run(s, 'sudo systemctl start app.service');
    expect(r.exitCode).toBe(0);
    expect(run(r.state, 'systemctl is-active app').output).toBe('active');
    expect(run(r.state, 'ss -tlnp').output).toContain('"app"');
  });

  it('un fichier de configuration manquant empêche le démarrage', () => {
    const s = run(run(machine(), 'systemctl stop squatter').state, 'rm /etc/app.conf').state;
    const r = run(s, 'systemctl start app');
    expect(r.exitCode).toBe(1);
    expect(r.state.services.app.journal.join('\n')).toContain('No such file or directory');
  });

  it('refuse d’effacer un répertoire système, avec une explication', () => {
    const r = run(machine(), 'rm -rf /');
    expect(r.exitCode).toBe(1);
    expect(r.warning).toMatch(/Cherchez d'abord/);
    expect(r.state.files['/etc/app.conf']).toBeDefined();
  });

  it('vide un fichier avec truncate ou une redirection', () => {
    expect(run(machine(), 'truncate -s 0 /srv/data/a.bin').state.files['/srv/data/a.bin'].size).toBe(0);
    expect(run(machine(), '> /srv/data/b.bin').state.files['/srv/data/b.bin'].size).toBe(0);
  });

  it('une seule commande à la fois, et les commandes inconnues le disent', () => {
    expect(run(machine(), 'ls; rm -rf /etc').exitCode).toBe(2);
    expect(run(machine(), 'echo $(id)').exitCode).toBe(2);
    expect(run(machine(), 'vim /etc/app.conf')).toMatchObject({ exitCode: 127, output: expect.stringContaining('help') });
  });

  it('l’horloge avance à chaque commande, l’état d’origine n’est jamais modifié', () => {
    const s = machine();
    const r = run(s, 'systemctl stop squatter');
    expect(r.state.clock).toBe('2026-11-24T09:00:01.000Z');
    expect(s.services.squatter.active).toBe('active');
  });

  it('une spécification sans panne est refusée', () => {
    const s = run(machine(), 'systemctl stop squatter').state;
    expect(specIssues({ machine: s, validators: [{ description: 'squatter arrêté', check: { kind: 'service_enabled', service: 'squatter', expected: true } }] }))
      .toContain('La machine de départ passe déjà tous les validateurs : il n’y a pas de panne.');
    expect(specIssues({ machine: s, validators: [{ description: 'x', check: { kind: 'service_active', service: 'nope' } }] }))
      .toContain('Validateur « x » : service nope inconnu.');
  });
});
