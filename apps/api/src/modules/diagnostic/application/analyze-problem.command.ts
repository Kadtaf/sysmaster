import { Optional, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { AnalyzeRequest, AnalyzeResponse, SymptomExtraction } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { DeductionEngine } from '../domain/deduction-engine';
import { KnowledgeSnapshot } from '../domain/model';
import { extractSymptoms } from '../domain/symptom-extractor';
import {
  AssistedSymptomExtractor,
  DiagnosticKnowledgePort,
  DiagnosticSessionRepository,
  SymptomExtractionUnavailableError,
} from './ports';

export class AnalyzeProblemCommand {
  constructor(
    readonly request: AnalyzeRequest,
    readonly user: AuthenticatedUser | null = null,
  ) {}
}

interface Extracted {
  codes: string[];
  source: 'extracted_text' | 'extracted_ai';
  extraction: Omit<SymptomExtraction, 'quotes'> & { quotes: { code: string; quote: string; source: 'description' | 'evidence' }[] };
}

@CommandHandler(AnalyzeProblemCommand)
export class AnalyzeProblemHandler implements ICommandHandler<AnalyzeProblemCommand, AnalyzeResponse> {
  constructor(
    private readonly knowledge: DiagnosticKnowledgePort,
    private readonly sessions: DiagnosticSessionRepository,
    @Optional() private readonly assisted?: AssistedSymptomExtractor,
  ) {}

  /**
   * Le modèle repère, le moteur décide : l'IA ne fait que proposer des codes du catalogue, justifiés
   * par une citation du texte de l'utilisateur. Si elle est indisponible, les synonymes prennent le relais.
   */
  private async extract(request: AnalyzeRequest, user: AuthenticatedUser | null, kb: KnowledgeSnapshot): Promise<Extracted> {
    const rules = (note: string | null): Extracted => ({
      codes: extractSymptoms(request.description ?? '', kb.symptoms),
      source: 'extracted_text',
      extraction: { method: 'rules', note, quotes: [], logFindings: [], remainingToday: null },
    });
    if (!request.useAi) return rules(null);
    if (!user) throw new UnauthorizedException('Connectez-vous pour utiliser l’analyse par l’IA.');
    if (!this.assisted) return rules('Analyse par l’IA non disponible sur ce serveur : repérage par mots-clés.');
    try {
      const res = await this.assisted.extract(user, request.platform, request.description ?? '', request.evidence ?? '', kb.symptoms);
      return {
        codes: res.codes.filter((c) => kb.symptoms.some((s) => s.code === c)),
        source: 'extracted_ai',
        extraction: { method: 'ai', note: null, quotes: res.quotes, logFindings: res.logFindings, remainingToday: res.remainingToday },
      };
    } catch (err) {
      if (!(err instanceof SymptomExtractionUnavailableError)) throw err;
      return rules('L’IA est momentanément indisponible : symptômes repérés par mots-clés.');
    }
  }

  async execute({ request, user }: AnalyzeProblemCommand): Promise<AnalyzeResponse> {
    const kb = await this.knowledge.load(request.platform);
    const userId = user?.id ?? null;

    const selected = (request.symptoms ?? []).filter((c) => kb.symptoms.some((s) => s.code === c));
    const found = await this.extract(request, user, kb);
    const extracted = found.codes.filter((c) => !selected.includes(c));
    const all = [...selected, ...extracted];

    const result = new DeductionEngine(kb).rank(all, request.evidence ?? '');

    const sessionId =
      result.hypotheses.length > 0
        ? await this.sessions.saveCompleted({
            userId,
            platform: request.platform,
            description: request.description ?? '',
            symptoms: [
              ...selected.map((code) => ({ code, source: 'user_selected' as const })),
              ...extracted.map((code) => ({ code, source: found.source })),
            ],
            result,
          })
        : null;

    const label = (code: string) => kb.symptoms.find((s) => s.code === code)?.label ?? code;
    const causeLabel = (code: string) => kb.causes.find((c) => c.code === code)?.label ?? code;

    return {
      sessionId,
      detectedSymptoms: all.map((code) => ({ code, label: label(code) })),
      extraction: { ...found.extraction, quotes: found.extraction.quotes.map((q) => ({ ...q, label: label(q.code) })) },
      matchedEvidence: result.matchedEvidence.map((e) => ({ name: e.name, cause: causeLabel(e.causeCode) })),
      confidence: result.confidence,
      hypotheses: result.hypotheses.map((h) => ({
        cause: h.cause.code,
        label: h.cause.label,
        probability: Math.round(h.probability * 1000) / 1000,
        explanation: h.cause.explanation,
        reasoning: h.reasoning,
        actionPlan: h.cause.actionPlan,
      })),
      clarifyingQuestions: result.clarifyingQuestions.map((q) => ({
        symptom: q.symptom.code,
        question: `Constatez-vous ceci : « ${q.symptom.label} » ?`,
      })),
    };
  }
}
