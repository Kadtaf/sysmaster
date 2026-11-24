import { Injectable, Logger } from '@nestjs/common';
import { AiAskRequest, AiAskResponse, AiExtractRequest, AiExtractResponse, AiGateway, AiQuizRequest, AiQuizResponse, AiUnavailableError } from '../application/ports';

/** Client HTTP du service IA. Le jeton partagé prouve au service que l'appel vient du cœur. */
@Injectable()
export class HttpAiGateway extends AiGateway {
  private readonly logger = new Logger(HttpAiGateway.name);
  private readonly baseUrl = (process.env.AI_SERVICE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  private readonly token = process.env.AI_SERVICE_TOKEN ?? 'dev-only-ai-token';
  private readonly timeoutMs = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 90_000);

  ask(req: AiAskRequest): Promise<AiAskResponse> {
    return this.post<AiAskResponse>('/v1/ask', req);
  }

  generateQuiz(req: AiQuizRequest): Promise<AiQuizResponse> {
    return this.post<AiQuizResponse>('/v1/quiz/generate', req);
  }

  extractSymptoms(req: AiExtractRequest): Promise<AiExtractResponse> {
    return this.post<AiExtractResponse>('/v1/diagnostic/extract', req);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ai-token': this.token },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.logger.error(`Service IA injoignable : ${(err as Error).message}`);
      throw new AiUnavailableError(`injoignable : ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      this.logger.error(`Service IA ${path} : ${res.status} ${text}`);
      throw new AiUnavailableError(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
