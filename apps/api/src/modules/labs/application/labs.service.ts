import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LabCheckResultDto,
  LabCommandResultDto,
  LabDetailDto,
  LabInstanceDto,
  LabSummaryDto,
  LabTranscriptEntry,
} from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { evaluate, labScore } from '../domain/lab';
import type { MachineState } from '../domain/machine';
import { run } from '../domain/shell';
import { LabInstance, LabRepository, LabTemplate } from './ports';

/** Historique gardé par instance, et taille maximale d'une sortie enregistrée. */
export const MAX_TRANSCRIPT = 200;
export const MAX_OUTPUT = 8000;

export function prompt(state: MachineState): string {
  return `root@${state.hostname}:${state.cwd === '/root' ? '~' : state.cwd}#`;
}

@Injectable()
export class LabsService {
  constructor(private readonly repo: LabRepository) {}

  list(): Promise<LabSummaryDto[]> {
    return this.repo.list();
  }

  async detail(slug: string): Promise<LabDetailDto> {
    const t = await this.template(slug);
    return {
      slug: t.slug, title: t.title, category: t.category, difficulty: t.difficulty, runtime: t.runtime,
      ttlMinutes: t.ttlMinutes, objectives: t.objectives, briefMd: t.briefMd, hintCount: t.hints.length,
      checks: t.simulation?.validators.map((v) => v.description) ?? [],
    };
  }

  /** Démarre le lab, ou reprend l'instance encore ouverte. `fresh` repart d'une machine neuve. */
  async start(user: AuthenticatedUser, slug: string, fresh = false): Promise<LabInstanceDto> {
    const t = await this.template(slug);
    if (!t.simulation) throw new ConflictException('Ce lab demande un environnement réel, pas encore disponible.');
    const current = await this.repo.active(user.id, t.id);
    if (current && !fresh) return this.view(current, t);
    if (current) await this.repo.close(current.id);
    return this.view(await this.repo.create(user.id, t), t);
  }

  async get(user: AuthenticatedUser, id: string): Promise<LabInstanceDto> {
    const { instance, template } = await this.owned(user, id);
    return this.view(instance, template);
  }

  async command(user: AuthenticatedUser, id: string, line: string): Promise<LabCommandResultDto> {
    const { instance } = await this.owned(user, id, true);
    const r = run(instance.state, line);
    const entry: LabTranscriptEntry = {
      command: line.trim(),
      output: r.output.length > MAX_OUTPUT ? `${r.output.slice(0, MAX_OUTPUT)}\n[… sortie tronquée]` : r.output,
      exitCode: r.exitCode,
      ...(r.warning ? { warning: r.warning } : {}),
    };
    const transcript = [...instance.transcript, entry].slice(-MAX_TRANSCRIPT);
    const saved = await this.repo.saveCommand(instance.id, instance.commandCount, r.state, transcript);
    if (!saved) throw new ConflictException('Une autre commande vient d’être exécutée sur ce lab : rechargez la page.');
    return { ...entry, prompt: prompt(r.state) };
  }

  async hint(user: AuthenticatedUser, id: string): Promise<LabInstanceDto> {
    const { instance, template } = await this.owned(user, id, true);
    if (instance.hintsUsed >= template.hints.length) return this.view(instance, template);
    const used = await this.repo.useHint(instance.id);
    return this.view({ ...instance, hintsUsed: used }, template);
  }

  /** Vérifie l'état de la machine. Si tout passe, le lab est résolu et rapporte de l'XP. */
  async check(user: AuthenticatedUser, id: string): Promise<LabCheckResultDto> {
    const { instance, template } = await this.owned(user, id);
    const checks = evaluate(instance.state, template.simulation!.validators);
    const solved = checks.every((c) => c.passed);
    let current = instance;
    if (solved && instance.status === 'running') {
      const score = labScore(instance.hintsUsed);
      const won = await this.repo.solve(instance, template.slug, score);
      // Deux vérifications simultanées : une seule passe l'instance à « résolue ».
      current = won ? { ...instance, status: 'solved', score } : ((await this.repo.get(id)) ?? instance);
    }
    return { solved: solved || current.status === 'solved', checks, instance: this.view(current, template) };
  }

  private async template(slug: string): Promise<LabTemplate> {
    const t = await this.repo.find(slug);
    if (!t) throw new NotFoundException('Lab introuvable');
    return t;
  }

  private async owned(user: AuthenticatedUser, id: string, mustRun = false): Promise<{ instance: LabInstance; template: LabTemplate }> {
    const instance = await this.repo.get(id);
    if (!instance) throw new NotFoundException('Session de lab introuvable');
    if (instance.userId !== user.id) throw new ForbiddenException('Cette session de lab appartient à un autre apprenant');
    const template = await this.repo.findById(instance.templateId);
    if (!template?.simulation) throw new NotFoundException('Lab introuvable');
    if (mustRun && instance.status === 'expired') throw new GoneException('Cette session a expiré : redémarrez le lab.');
    if (mustRun && instance.status === 'solved') throw new ConflictException('Ce lab est déjà résolu : redémarrez-le pour vous entraîner à nouveau.');
    return { instance, template };
  }

  private view(i: LabInstance, t: LabTemplate): LabInstanceDto {
    return {
      id: i.id,
      labSlug: t.slug,
      status: i.status,
      prompt: prompt(i.state),
      transcript: i.transcript,
      hints: t.hints.slice(0, i.hintsUsed),
      hintCount: t.hints.length,
      expiresAt: i.expiresAt.toISOString(),
      score: i.status === 'solved' ? i.score : null,
      // L'explication n'est donnée qu'après la réussite : avant, ce serait la réponse.
      solutionMd: i.status === 'solved' ? t.solutionMd : null,
    };
  }
}
