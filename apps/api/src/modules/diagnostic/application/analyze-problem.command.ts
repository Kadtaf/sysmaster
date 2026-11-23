import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { AnalyzeRequest, AnalyzeResponse } from '@sysmaster/contracts';
import { DeductionEngine } from '../domain/deduction-engine';
import { extractSymptoms } from '../domain/symptom-extractor';
import { DiagnosticKnowledgePort, DiagnosticSessionRepository } from './ports';

export class AnalyzeProblemCommand {
  constructor(
    readonly request: AnalyzeRequest,
    readonly userId: string | null = null,
  ) {}
}

@CommandHandler(AnalyzeProblemCommand)
export class AnalyzeProblemHandler implements ICommandHandler<AnalyzeProblemCommand, AnalyzeResponse> {
  constructor(
    private readonly knowledge: DiagnosticKnowledgePort,
    private readonly sessions: DiagnosticSessionRepository,
  ) {}

  async execute({ request, userId }: AnalyzeProblemCommand): Promise<AnalyzeResponse> {
    const kb = await this.knowledge.load(request.platform);

    const selected = (request.symptoms ?? []).filter((c) => kb.symptoms.some((s) => s.code === c));
    const extracted = extractSymptoms(request.description ?? '', kb.symptoms).filter((c) => !selected.includes(c));
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
              ...extracted.map((code) => ({ code, source: 'extracted_text' as const })),
            ],
            result,
          })
        : null;

    const label = (code: string) => kb.symptoms.find((s) => s.code === code)?.label ?? code;
    const causeLabel = (code: string) => kb.causes.find((c) => c.code === code)?.label ?? code;

    return {
      sessionId,
      detectedSymptoms: all.map((code) => ({ code, label: label(code) })),
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
