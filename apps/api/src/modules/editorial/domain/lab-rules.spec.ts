import { LabContentSchema, type LabContent } from '@sysmaster/contracts';
import { labIssues, replay } from './lab-rules';

const M = 1024 ** 2;

function lab(overrides: Partial<LabContent> = {}): LabContent {
  return LabContentSchema.parse({
    slug: 'lab-regles', title: 'Disque plein', category: 'linux', difficulty: 'beginner', briefMd: 'Le service ne démarre plus.',
    objectives: ['Lire un journal'], hints: ['Regardez df -h'],
    solutionMd: 'Un fichier temporaire remplissait le disque : on le supprime, puis on relance le service. Ensuite, on surveille la place.',
    machine: {
      hostname: 'srv', cwd: '/root', clock: '2026-01-01T00:00:00.000Z', nextPid: 100,
      dirs: ['/root', '/tmp', '/var', '/var/log'],
      files: { '/tmp/gros.bin': { size: 950 * M }, '/var/log/syslog': { size: 1024, content: '' } },
      mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 1024 * M, baseUsedBytes: 50 * M }],
      services: { app: { description: 'App', active: 'failed', enabled: true, process: 'app', ports: [], writes: '/var/log/app.log', journal: [] } },
    },
    validators: [{ description: 'app démarré', check: { kind: 'service_active', service: 'app' } }],
    walkthrough: ['df -h', 'rm /tmp/gros.bin', 'systemctl start app'],
    ...overrides,
  });
}

describe('Règles de publication d’un lab', () => {
  it('un lab complet dont la démarche répare la machine est publiable', () => {
    expect(labIssues(lab())).toEqual([]);
    expect(replay(lab()).steps.map((s) => s.exitCode)).toEqual([0, 0, 0]);
  });

  it('signale une démarche qui ne répare pas, ou qui utilise une commande non simulée', () => {
    const issues = labIssues(lab({ walkthrough: ['vim /etc/x', 'systemctl start app'] }));
    expect(issues.map((i) => i.message)).toEqual([
      'Étape 1 (« vim /etc/x ») : commande non simulée.',
      'La démarche de référence ne répare pas la machine : « app démarré » échoue encore.',
    ]);
  });

  it('exige énoncé, objectifs, indices, solution et démarche', () => {
    const fields = labIssues(lab({ briefMd: '', objectives: [], hints: [], solutionMd: 'court', walkthrough: [] })).map((i) => i.field);
    expect(fields).toEqual(['briefMd', 'objectives', 'hints', 'solutionMd', 'walkthrough']);
  });

  it('vérifie la cohérence de la machine', () => {
    const base = lab();
    const broken = lab({
      machine: { ...base.machine, cwd: '/home/absent', files: { ...base.machine.files, '/opt/x/y': { size: 1 } },
        services: { ...base.machine.services, db: { description: 'DB', active: 'active', enabled: true, process: 'db', ports: [], journal: [] } } },
    });
    expect(labIssues(broken).filter((i) => i.field === 'machine').map((i) => i.message)).toEqual([
      'Le répertoire de départ /home/absent n’existe pas dans la machine.',
      'Le fichier /opt/x/y est dans un répertoire absent de « dirs » (/opt/x).',
      'Le service db est actif mais sans pid.',
    ]);
  });
});
