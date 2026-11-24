import { parseCompose, parseYaml, YamlError } from './compose';
import { evaluate } from './lab';
import type { MachineState } from './machine';
import { run } from './shell';

const compose = `services:
  api:
    image: app:2   # commentaire
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      TOKEN: "abc"
`;

function machine(): MachineState {
  return {
    hostname: 'd1', cwd: '/srv/projet', clock: '2026-01-01T00:00:00.000Z', nextPid: 10,
    dirs: ['/root', '/srv', '/srv/projet'],
    files: { '/srv/projet/compose.yaml': { size: compose.length, content: compose } },
    mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 10 ** 9, baseUsedBytes: 10 ** 8 }],
    services: { nginx: { description: 'nginx', active: 'inactive', enabled: false, process: 'nginx', ports: [8080], journal: [] } },
    docker: {
      composeFile: '/srv/projet/compose.yaml',
      images: { 'app:2': { requiredEnv: ['TOKEN', 'MODE'], listens: 80, startupLog: ['prêt'], http: { status: 200, body: 'app 2' } } },
      containers: {},
    },
  };
}

describe('Fichier compose', () => {
  it('lit tables, listes, guillemets et commentaires', () => {
    expect(parseCompose(compose).services.api).toEqual({ image: 'app:2', restart: 'unless-stopped', ports: [{ host: 8080, container: 80 }], env: { TOKEN: 'abc' } });
    expect(parseYaml('a:\n- x\n- "y # pas un commentaire"\n')).toEqual({ a: ['x', 'y # pas un commentaire'] });
  });

  it('refuse un YAML invalide en donnant la ligne', () => {
    expect(() => parseYaml('services:\n  api:\n    image: [a, b]\n')).toThrow(new YamlError(3, 'syntaxe YAML non prise en charge ici (flux, ancre ou bloc)'));
    expect(() => parseYaml('services:\n\tapi: x\n')).toThrow(YamlError);
    expect(() => parseCompose('services:\n  api:\n    restart: always\n')).toThrow(/neither an image/);
  });
});

describe('Docker simulé', () => {
  it('variable manquante : boucle de redémarrage ; restart ne relit pas le fichier, compose up -d recrée', () => {
    let s = run(machine(), 'docker compose up -d').state;
    expect(run(s, 'docker ps').output).toContain('Restarting');
    expect(run(s, 'docker logs projet-api-1').output).toContain("KeyError: 'MODE'");

    s = run(s, "echo '      MODE: prod' >> compose.yaml").state;
    expect(run(s, 'docker restart projet-api-1').state.docker!.containers['projet-api-1'].status).toBe('restarting');
    const r = run(s, 'docker compose up -d');
    expect(r.output).toContain('Recreated');
    expect(r.state.docker!.containers['projet-api-1']).toMatchObject({ status: 'running', env: { TOKEN: 'abc', MODE: 'prod' } });
    expect(run(r.state, 'curl http://localhost:8080').output).toBe('app 2');
  });

  it('port de l’hôte occupé par un service : le conteneur reste créé', () => {
    let s = run(machine(), "echo '      MODE: prod' >> compose.yaml").state;
    s = run(s, 'systemctl start nginx').state;
    const r = run(s, 'docker compose up -d');
    expect(r).toMatchObject({ exitCode: 1, output: expect.stringContaining('port is already allocated') });
    expect(r.state.docker!.containers['projet-api-1'].status).toBe('created');
    expect(run(r.state, 'curl http://localhost:8080').exitCode).toBe(7);
  });

  it('compose exige le répertoire du projet ou -f', () => {
    const elsewhere = { ...machine(), cwd: '/root' };
    expect(run(elsewhere, 'docker compose ps').exitCode).toBe(14);
    expect(run(elsewhere, 'docker compose -f /srv/projet/compose.yaml ps').exitCode).toBe(0);
  });

  it('politique de redémarrage : stop, rm, update', () => {
    let s = run(machine(), "echo '      MODE: prod' >> compose.yaml").state;
    s = run(s, 'docker compose up -d').state;
    const autostart = (st: MachineState) => evaluate(st, [{ description: 'a', check: { kind: 'container_autostart', name: 'projet-api-1', expected: true } }])[0].passed;
    expect(autostart(s)).toBe(true);
    // unless-stopped : un arrêt volontaire empêche le redémarrage automatique.
    expect(autostart(run(s, 'docker stop projet-api-1').state)).toBe(false);
    expect(run(s, 'docker rm projet-api-1').output).toContain('container is running');
    expect(run(s, 'docker rm -f projet-api-1').state.docker!.containers['projet-api-1']).toBeUndefined();
    const always = run(s, 'docker update --restart=always projet-api-1').state;
    expect(autostart(run(always, 'docker stop projet-api-1').state)).toBe(true);
  });

  it('http_ok et container_running lisent l’état final', () => {
    let s = run(machine(), "echo '      MODE: prod' >> compose.yaml").state;
    s = run(s, 'docker compose up -d').state;
    const checks = evaluate(s, [
      { description: 'tourne', check: { kind: 'container_running', name: 'projet-api-1', expected: true } },
      { description: 'répond', check: { kind: 'http_ok', url: 'http://localhost:8080', contains: 'app 2' } },
      { description: 'mauvaise version', check: { kind: 'http_ok', url: 'http://localhost:8080', contains: 'app 3' } },
    ]);
    expect(checks.map((c) => c.passed)).toEqual([true, true, false]);
  });

  it('une machine sans Docker le dit', () => {
    const { docker: _omit, ...m } = machine();
    expect(run(m, 'docker ps').exitCode).toBe(127);
  });
});
