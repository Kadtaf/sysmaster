import { AiUnavailableError, type AiStreamEvent } from '../application/ports';
import { HttpAiGateway } from './http-ai.gateway';

/** Réponse HTTP dont le corps arrive en morceaux arbitraires, comme sur le réseau. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('HttpAiGateway.askStream', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('relaie meta et delta, même coupés au milieu, et rend la réponse finale', async () => {
    const stream = [
      'event: meta\ndata: {"agent":"tutor","domain":null,"consulted":[]}\n\n',
      'event: delta\ndata: {"field":"summary","text":"Bon',
      'jour é"}\n\nevent: answer\ndata: {"outcome":"answered","answer":{"summary":"Bonjour é"}}\n\n',
    ];
    global.fetch = jest.fn().mockResolvedValue(sseResponse(stream));
    const seen: AiStreamEvent[] = [];
    const res = await new HttpAiGateway().askStream({ question: 'q', level: 'beginner', history: [] }, (e) => seen.push(e));
    expect(seen.map((e) => e.event)).toEqual(['meta', 'delta']);
    expect(seen[1]).toEqual({ event: 'delta', data: { field: 'summary', text: 'Bonjour é' } });
    expect(res.answer.summary).toBe('Bonjour é');
  });

  it('échoue sur un événement error ou un flux sans réponse', async () => {
    global.fetch = jest.fn().mockResolvedValue(sseResponse(['event: error\ndata: {"message":"RuntimeError"}\n\n']));
    await expect(new HttpAiGateway().askStream({ question: 'q', level: 'beginner', history: [] }, () => undefined)).rejects.toBeInstanceOf(AiUnavailableError);
    global.fetch = jest.fn().mockResolvedValue(sseResponse(['event: meta\ndata: {}\n\n']));
    await expect(new HttpAiGateway().askStream({ question: 'q', level: 'beginner', history: [] }, () => undefined)).rejects.toThrow('flux terminé sans réponse');
  });
});
