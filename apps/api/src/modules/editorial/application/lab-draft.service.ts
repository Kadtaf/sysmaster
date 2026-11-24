import { ForbiddenException, Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { LabContentSchema, type GenerateLabDraftInput, type LabContent, type LabDraftDto } from '@sysmaster/contracts';
import { AiQuota } from '../../assistant/application/ai-quota';
import { AiGateway, AiLabRequest, AiLabResponse, AiUnavailableError, AiUsageRepository } from '../../assistant/application/ports';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { labIssues } from '../domain/lab-rules';
import { labReference } from '../domain/lab-reference';
import { canCreate } from '../domain/workflow';
import { LabKindAdapter } from '../infrastructure/lab-kind.adapter';
import { RevisionRepository } from './ports';

const AGENT = 'lab_generator';

/** Ce que vaut une proposition du modèle : le lab, s'il a la bonne forme, et ce qui l'empêche encore d'être publié. */
export function assess(res: AiLabResponse, input: GenerateLabDraftInput): { content: LabContent | null; issues: string[] } {
  if (!res.lab) {
    return { content: null, issues: res.notes.length ? res.notes : ['Le modèle n’a pas proposé de lab.'] };
  }
  const parsed = LabContentSchema.safeParse({
    ...res.lab, category: input.category, difficulty: input.difficulty, ttlMinutes: 45,
  });
  if (!parsed.success) {
    return {
      content: null,
      issues: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || 'lab'} : ${i.message}`),
    };
  }
  return { content: parsed.data, issues: labIssues(parsed.data).map((i) => i.message) };
}

/**
 * Brouillon de lab rédigé par l'IA (agent 11). La proposition passe par les mêmes règles que celles
 * d'un auteur : forme exacte, puis démarche de référence REJOUÉE sur le simulateur. S'il reste des
 * problèmes, ils sont renvoyés une fois au modèle pour correction. Le résultat est une révision
 * ordinaire du back-office : un auteur la complète, une autre personne la relit, rien n'est publié seul.
 */
@Injectable()
export class LabDraftService {
  constructor(
    private readonly ai: AiGateway,
    private readonly quota: AiQuota,
    private readonly usage: AiUsageRepository,
    private readonly labs: LabKindAdapter,
    private readonly revisions: RevisionRepository,
  ) {}

  async draft(user: AuthenticatedUser, input: GenerateLabDraftInput): Promise<LabDraftDto> {
    if (!canCreate(user)) throw new ForbiddenException('Seuls les auteurs et les administrateurs rédigent des contenus.');
    const example = (await this.labs.example(input.category)) ?? this.labs.blank();
    const remainingToday = await this.quota.reserve(user);
    const base: AiLabRequest = {
      topic: input.topic, category: input.category, difficulty: input.difficulty,
      example: JSON.stringify(example), reference: labReference(),
    };

    const first = await this.call(user, base);
    let attempts = 1;
    let { content, issues } = assess(first, input);
    if (issues.length && first.outcome !== 'refused') {
      const second = await this.call(user, { ...base, ...(first.raw ? { previous: first.raw } : {}), issues });
      attempts = 2;
      const fixed = assess(second, input);
      // On garde la correction si elle a la bonne forme ; sinon la première proposition, si elle en avait une.
      if (fixed.content || !content) ({ content, issues } = fixed);
    }
    if (!content) {
      throw new UnprocessableEntityException({
        message: first.outcome === 'refused'
          ? 'L’IA a décliné ce sujet. Reformulez-le en incident technique.'
          : 'L’IA n’a pas produit de lab exploitable. Réessayez, ou précisez le sujet.',
        issues,
      });
    }
    if (await this.labs.published(content.slug)) content = { ...content, slug: `${content.slug}-${Date.now().toString(36).slice(-4)}` };
    const revisionId = await this.revisions.create('lab', user.id, null, content);
    return { revisionId, attempts, remainingIssues: issues, remainingToday };
  }

  private async call(user: AuthenticatedUser, req: AiLabRequest): Promise<AiLabResponse> {
    let res: AiLabResponse;
    try {
      res = await this.ai.generateLab(req);
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      await this.usage.record({ userId: user.id, agentCode: AGENT, model: 'unknown', latencyMs: null, outcome: 'error', failure: err.message });
      throw new ServiceUnavailableException('L’IA est momentanément indisponible. Réessayez dans un instant.');
    }
    await this.usage.record({
      userId: user.id, agentCode: AGENT, model: res.model, latencyMs: res.latencyMs,
      outcome: res.outcome === 'refused' ? 'refused' : 'ok', usage: res.usage,
    });
    return res;
  }
}
