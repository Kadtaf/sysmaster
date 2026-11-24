import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, specIssues, type SimulationSpec } from '../src/modules/labs/domain/lab';
import type { MachineState } from '../src/modules/labs/domain/machine';
import { run } from '../src/modules/labs/domain/shell';

/**
 * Les labs du seed 007 doivent être jouables : spécification cohérente, panne réelle au départ,
 * démarche attendue qui les résout, et raccourci destructeur qui ne les résout pas.
 * (Sans base : on lit les blocs JSON du fichier généré.)
 */
const sql = readFileSync(join(__dirname, '../../../db/seeds/007_labs.sql'), 'utf8');
const labs = [...sql.matchAll(/\$json\$(.*?)\$json\$/gs)].map(
  (m) => JSON.parse(m[1]) as { slug: string; hints: { text: string }[]; solutionMd: string; simulation: SimulationSpec },
);
const bySlug = (slug: string) => labs.find((l) => l.slug === slug)!;

function play(machine: MachineState, commands: string[]): { state: MachineState; outputs: string[] } {
  let state = machine;
  const outputs: string[] = [];
  for (const c of commands) {
    const r = run(state, c);
    state = r.state;
    outputs.push(r.output);
  }
  return { state, outputs };
}

describe('Labs du seed 007', () => {
  it('chaque lab a une spécification valide, des indices et une solution expliquée', () => {
    expect(labs.length).toBeGreaterThanOrEqual(2);
    for (const l of labs) {
      expect({ slug: l.slug, issues: specIssues(l.simulation) }).toEqual({ slug: l.slug, issues: [] });
      expect(l.hints.length).toBeGreaterThanOrEqual(2);
      expect(l.solutionMd.length).toBeGreaterThan(200);
    }
  });

  describe('disque plein', () => {
    const lab = bySlug('linux-disque-plein-nginx');

    it('la démarche attendue répare la machine', () => {
      const { state, outputs } = play(lab.simulation.machine, [
        'systemctl status nginx',
        'df -h',
        'du -sh /var/log/*',
        'truncate -s 0 /var/log/app/debug.log',
        'systemctl restart nginx',
      ]);
      expect(outputs[0]).toContain('No space left on device');
      expect(outputs[1]).toMatch(/100% \/var/);
      expect(outputs[2]).toMatch(/1\.9G\t\/var\/log\/app/);
      expect(evaluate(state, lab.simulation.validators).every((c) => c.passed)).toBe(true);
    });

    it('relancer nginx sans libérer de place échoue encore', () => {
      const { state, outputs } = play(lab.simulation.machine, ['systemctl restart nginx']);
      expect(outputs[0]).toContain('Job for nginx.service failed');
      expect(state.services.nginx.active).toBe('failed');
    });

    it('tout effacer dans /var/log libère la place mais ne valide pas le lab', () => {
      const refused = run(lab.simulation.machine, 'rm -rf /var/log');
      expect(refused.warning).toBeDefined();
      const { state } = play(lab.simulation.machine, ['rm -rf /var/log/*', 'systemctl start nginx']);
      const checks = evaluate(state, lab.simulation.validators);
      expect(checks.find((c) => c.description.includes('syslog'))?.passed).toBe(false);
    });
  });

  describe('port 80 occupé', () => {
    const lab = bySlug('linux-port-80-occupe');

    it('la démarche attendue répare la machine', () => {
      const { state, outputs } = play(lab.simulation.machine, [
        'journalctl -u nginx -n 20',
        'ss -tlnp | grep :80',
        'systemctl stop apache2',
        'systemctl disable apache2',
        'systemctl start nginx',
      ]);
      expect(outputs[0]).toContain('Address already in use');
      expect(outputs[1]).toContain('apache2');
      expect(evaluate(state, lab.simulation.validators).every((c) => c.passed)).toBe(true);
    });

    it('arrêter apache2 sans le désactiver ne suffit pas', () => {
      const { state } = play(lab.simulation.machine, ['systemctl stop apache2', 'systemctl start nginx']);
      expect(state.services.nginx.active).toBe('active');
      expect(evaluate(state, lab.simulation.validators).every((c) => c.passed)).toBe(false);
    });
  });
});
