import { LabContentSchema } from '@sysmaster/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { labIssues } from '../src/modules/editorial/domain/lab-rules';
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

  it('chaque lab passe les règles de publication du back-office (démarche de référence comprise)', () => {
    for (const l of labs) {
      const raw = l as unknown as Record<string, unknown> & { simulation: SimulationSpec };
      const content = LabContentSchema.parse({
        ...raw, hints: l.hints.map((h) => h.text), machine: raw.simulation.machine,
        validators: raw.simulation.validators, walkthrough: raw.simulation.walkthrough,
      });
      expect({ slug: l.slug, issues: labIssues(content) }).toEqual({ slug: l.slug, issues: [] });
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

  describe('DNS interne', () => {
    const lab = bySlug('reseau-dns-interne');

    it('un DNS public résout les noms publics mais pas le dépôt interne', () => {
      const { state, outputs } = play(lab.simulation.machine, ["echo 'nameserver 1.1.1.1' > /etc/resolv.conf", 'curl https://depot.exemple.fr']);
      expect(outputs[1]).toContain('Could not resolve host');
      expect(evaluate(state, lab.simulation.validators).every((c) => c.passed)).toBe(false);
    });

    it('ajouter le bon serveur sans retirer l’ancien ne suffit pas', () => {
      const { state } = play(lab.simulation.machine, ["echo 'nameserver 10.0.0.2' >> /etc/resolv.conf"]);
      const checks = evaluate(state, lab.simulation.validators);
      expect(checks.filter((c) => c.passed).length).toBe(2);
    });
  });

  describe('route par défaut', () => {
    const lab = bySlug('reseau-route-par-defaut');

    it('la route ajoutée à chaud répare, mais ne survit pas au redémarrage', () => {
      const { state } = play(lab.simulation.machine, ['ip route add default via 10.0.0.1']);
      const checks = evaluate(state, lab.simulation.validators);
      expect(checks.map((c) => c.passed)).toEqual([true, true, false]);
    });
  });

  describe('Docker', () => {
    it('variable renommée : docker restart ne répare pas, revenir en 2.3 non plus', () => {
      const lab = bySlug('docker-variable-renommee');
      const restarted = play(lab.simulation.machine, ['docker restart facturation-app-1']).state;
      expect(evaluate(restarted, lab.simulation.validators).every((c) => c.passed)).toBe(false);
      const rollback = play(lab.simulation.machine, [
        'cd /srv/facturation', "sed -i 's/facturation:2.4/facturation:2.3/' compose.yaml", 'docker compose up -d',
      ]).state;
      const checks = evaluate(rollback, lab.simulation.validators);
      expect(checks.map((c) => c.passed)).toEqual([true, false]);
    });

    it('port alloué : arrêter l’ancien conteneur sans le supprimer ne suffit pas', () => {
      const lab = bySlug('docker-port-deja-alloue');
      const { state } = play(lab.simulation.machine, ['docker stop grafana-test', 'cd /srv/tableau', 'docker compose up -d']);
      expect(evaluate(state, lab.simulation.validators).map((c) => c.passed)).toEqual([true, true, false]);
    });
  });

  describe('Cyber', () => {
    it('force brute : ufw deny ajouté en fin de liste ne bloque pas l’attaquant', () => {
      const lab = bySlug('cyber-ssh-force-brute');
      const { state, outputs } = play(lab.simulation.machine, [
        'grep "Failed password" /var/log/auth.log | cut -d\' \' -f11 | sort | uniq -c',
        'ufw deny from 203.0.113.45',
      ]);
      expect(outputs[0]).toContain('46 203.0.113.45');
      expect(outputs[0]).toContain('3 198.51.100.77');
      expect(evaluate(state, lab.simulation.validators)[0].passed).toBe(false);
    });

    it('force brute : tout fermer bloque l’attaquant mais coupe aussi l’équipe', () => {
      const lab = bySlug('cyber-ssh-force-brute');
      const { state } = play(lab.simulation.machine, ['ufw delete allow 22']);
      expect(evaluate(state, lab.simulation.validators).slice(0, 3).map((c) => c.passed)).toEqual([true, false, true]);
    });

    it('secrets : chmod 600 sur la configuration casse la boutique au redémarrage', () => {
      const lab = bySlug('cyber-secrets-lisibles');
      const { state, outputs } = play(lab.simulation.machine, [
        'chmod 600 /var/www/boutique/.env',
        'systemctl restart php8.2-fpm',
        'journalctl -u php8.2-fpm -n 5',
      ]);
      expect(outputs[2]).toContain('Permission denied');
      const checks = evaluate(state, lab.simulation.validators);
      expect(checks[0].passed).toBe(false);
      expect(checks[5].passed).toBe(false);
    });
  });
});
