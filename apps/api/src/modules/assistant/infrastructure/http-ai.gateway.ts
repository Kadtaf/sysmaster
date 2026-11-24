import { Injectable, Logger } from '@nestjs/common';
import {
  AiAskRequest, AiAskResponse, AiExtractRequest, AiExtractResponse, AiGateway, AiQuizRequest, AiQuizResponse, AiStreamEvent, AiUnavailableError,
} from '../application/ports';

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

  /** Lit le flux Server-Sent Events du service : meta et delta sont relayés, answer termine, error échoue. */
  async askStream(req: AiAskRequest, onEvent: (e: AiStreamEvent) => void): Promise<AiAskResponse> {
    const res = await this.send('/v1/ask/stream', req);
    if (!res.body) throw new AiUnavailableError('flux vide');
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!event || data === undefined) continue;
          const payload: unknown = JSON.parse(data);
          if (event === 'answer') return payload as AiAskResponse;
          if (event === 'error') throw new AiUnavailableError(`flux interrompu : ${(payload as { message?: string }).message ?? 'inconnu'}`);
          if (event === 'meta' || event === 'delta') onEvent({ event, data: payload } as AiStreamEvent);
        }
      }
    } catch (err) {
      if (err instanceof AiUnavailableError) throw err;
      this.logger.error(`Flux du service IA interrompu : ${(err as Error).message}`);
      throw new AiUnavailableError(`flux interrompu : ${(err as Error).message}`);
    } finally {
      void reader.cancel().catch(() => undefined);
    }
    throw new AiUnavailableError('flux terminé sans réponse');
  }

  extractSymptoms(req: AiExtractRequest): Promise<AiExtractResponse> {
    return this.post<AiExtractResponse>('/v1/diagnostic/extract', req);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return (await (await this.send(path, body)).json()) as T;
  }

  private async send(path: string, body: unknown): Promise<Response> {
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
    return res;
  }
}
