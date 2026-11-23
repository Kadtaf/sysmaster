import { Injectable } from '@nestjs/common';
import { AiQuota } from '../../assistant/application/ai-quota';
import { AiGateway, AiUnavailableError, AiUsageRepository } from '../../assistant/application/ports';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { AssistedExtraction, AssistedSymptomExtractor, SymptomExtractionUnavailableError } from '../application/ports';
import { Symptom } from '../domain/model';

/** Adaptateur : service IA + quota commun + trace d'usage (ai.agent_runs, agent « symptom_extractor »). */
@Injectable()
export class AiSymptomExtractor extends AssistedSymptomExtractor {
  constructor(
    private readonly ai: AiGateway,
    private readonly quota: AiQuota,
    private readonly usage: AiUsageRepository,
  ) {
    super();
  }

  async extract(user: AuthenticatedUser, platform: string, description: string, evidence: string, catalogue: Symptom[]): Promise<AssistedExtraction> {
    const remainingToday = await this.quota.reserve(user);
    try {
      const res = await this.ai.extractSymptoms({
        platform, description, evidence,
        catalogue: catalogue.map((s) => ({ code: s.code, label: [s.label, ...s.synonyms.slice(0, 3)].join(' ; ').slice(0, 300) })),
      });
      await this.usage.record({
        userId: user.id, agentCode: 'symptom_extractor', model: res.model, latencyMs: res.latencyMs,
        outcome: res.outcome === 'refused' ? 'refused' : 'ok', usage: res.usage,
      });
      return {
        codes: [...new Set(res.symptoms.map((s) => s.code))],
        quotes: res.symptoms,
        logFindings: res.logFindings,
        remainingToday,
      };
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      // L'essai compte : sans cela, une panne du service permettrait de dépasser le quota en boucle.
      await this.usage.record({ userId: user.id, agentCode: 'symptom_extractor', model: 'unknown', latencyMs: null, outcome: 'error', failure: err.message });
      throw new SymptomExtractionUnavailableError(err.message);
    }
  }
}
