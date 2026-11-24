import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { CommandContent, GenerateQuizDraftInput, QuizContent, QuizDraftDto } from '@sysmaster/contracts';
import { AiQuota } from '../../assistant/application/ai-quota';
import { AiGateway, AiUnavailableError, AiUsageRepository } from '../../assistant/application/ports';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { canCreate } from '../domain/workflow';
import { CommandKindAdapter } from '../infrastructure/command-kind.adapter';
import { QuizKindAdapter } from '../infrastructure/quiz-kind.adapter';
import { OpenRevisionExistsError, RevisionRepository } from './ports';

const OPEN = new Set(['draft', 'in_review', 'changes_requested']);

/** Fiche rendue en texte pour le modèle : tout ce qui fait comprendre, rien de ce qui est mise en page. */
export function renderCommand(c: CommandContent): string {
  const lines = [
    `Commande : ${c.name} (${c.platform}) — niveau de risque ${c.riskLevel}${c.requiresAdmin ? ', droits administrateur requis' : ''}`,
    `Résumé : ${c.summary}`,
    `Syntaxe : ${c.syntax}`,
    `Pourquoi : ${c.why}`,
    `Quand l'utiliser : ${c.whenToUse}`,
  ];
  if (c.context) lines.push(`Contexte : ${c.context}`);
  if (c.risks.length) lines.push('Risques :', ...c.risks.map((r) => `- (${r.level}) ${r.text}`));
  if (c.parameters.length) lines.push('Paramètres :', ...c.parameters.map((p) => `- ${p.flag} (risque ${p.riskLevel}) : ${p.description}`));
  if (c.examples.length) lines.push('Exemples :', ...c.examples.map((e) => `- ${e.title} : ${e.code} — ${e.explanation}`));
  if (c.commonErrors.length) lines.push('Erreurs fréquentes :', ...c.commonErrors.map((e) => `- ${e.error} ; cause : ${e.cause} ; correction : ${e.fix}`));
  if (c.bestPractices.length) lines.push('Bonnes pratiques :', ...c.bestPractices.map((b) => `- ${b}`));
  if (c.alternatives.length) lines.push('Alternatives :', ...c.alternatives.map((a) => `- ${a.slug} : ${a.note}`));
  return lines.join('\n').slice(0, 30_000);
}

/**
 * Brouillon de quiz rédigé par l'IA à partir d'une fiche publiée. Le résultat est une révision
 * ordinaire du back-office : l'auteur la corrige, une autre personne la relit, rien n'est publié seul.
 * L'appel compte dans le quota IA commun et est tracé (agent « quiz_generator »).
 */
@Injectable()
export class QuizDraftService {
  constructor(
    private readonly ai: AiGateway,
    private readonly quota: AiQuota,
    private readonly usage: AiUsageRepository,
    private readonly commands: CommandKindAdapter,
    private readonly quizzes: QuizKindAdapter,
    private readonly revisions: RevisionRepository,
  ) {}

  async draft(user: AuthenticatedUser, input: GenerateQuizDraftInput): Promise<QuizDraftDto> {
    if (!canCreate(user)) throw new ForbiddenException('Seuls les auteurs et les administrateurs rédigent des contenus.');
    const fiche = await this.commands.published(input.commandSlug);
    if (!fiche) throw new NotFoundException(`Aucune fiche publiée « ${input.commandSlug} ».`);
    const slug = `quiz-${input.commandSlug}`;
    // Vérifié avant l'appel au modèle : inutile de consommer le quota pour un brouillon impossible à créer.
    const open = (await this.revisions.list({ kind: 'quiz' })).find((r) => r.key === slug && OPEN.has(r.status));
    if (open) throw new ConflictException(`Un brouillon du quiz « ${slug} » est déjà en cours : complétez-le ou retirez-le d’abord.`);
    const existing = await this.quizzes.published(slug);

    const remainingToday = await this.quota.reserve(user);
    let res;
    try {
      res = await this.ai.generateQuiz({
        title: fiche.content.name, platform: fiche.content.platform, level: input.level, text: renderCommand(fiche.content), count: input.count,
      });
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      await this.usage.record({ userId: user.id, agentCode: 'quiz_generator', model: 'unknown', latencyMs: null, outcome: 'error', failure: err.message });
      throw new ServiceUnavailableException('L’IA est momentanément indisponible. Réessayez dans un instant.');
    }
    await this.usage.record({
      userId: user.id, agentCode: 'quiz_generator', model: res.model, latencyMs: res.latencyMs,
      outcome: res.outcome === 'refused' ? 'refused' : 'ok', usage: res.usage,
    });

    const content: QuizContent = existing?.content ?? {
      slug, title: `Quiz : ${fiche.content.name}`, platform: fiche.content.platform, commandSlug: input.commandSlug, questions: [],
    };
    content.questions = [...content.questions, ...res.questions.map((q) => ({ ...q, generatedByAi: true }))].slice(0, 30);
    try {
      const revisionId = await this.revisions.create('quiz', user.id, existing?.targetId ?? null, content);
      return { revisionId, added: res.questions.length, notes: res.notes, remainingToday };
    } catch (err) {
      if (err instanceof OpenRevisionExistsError) throw new ConflictException('Un brouillon de ce quiz vient d’être créé par quelqu’un d’autre.');
      throw err;
    }
  }
}
