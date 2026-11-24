import { rebootKnowledge } from '../../../../test/fixtures/reboot-knowledge';
import { AnalyzeProblemCommand, AnalyzeProblemHandler } from './analyze-problem.command';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import {
  AssistedExtraction,
  AssistedSymptomExtractor,
  DiagnosticKnowledgePort,
  DiagnosticSessionRepository,
  NewDiagnosticSession,
  SymptomExtractionUnavailableError,
} from './ports';

/** Adaptateurs en mémoire : l'intérêt de l'architecture hexagonale est de pouvoir tester ainsi. */
class InMemoryKnowledge extends DiagnosticKnowledgePort {
  load = async () => rebootKnowledge;
  listSymptoms = async () => rebootKnowledge.symptoms;
}
class InMemorySessions extends DiagnosticSessionRepository {
  saved: NewDiagnosticSession[] = [];
  saveCompleted = async (s: NewDiagnosticSession) => {
    this.saved.push(s);
    return `session-${this.saved.length}`;
  };
}

describe('AnalyzeProblemHandler', () => {
  it('combine symptômes sélectionnés et extraits, enregistre la session et renvoie des hypothèses expliquées', async () => {
    const sessions = new InMemorySessions();
    const handler = new AnalyzeProblemHandler(new InMemoryKnowledge(), sessions);

    const res = await handler.execute(
      new AnalyzeProblemCommand({ platform: 'windows', description: 'il chauffe beaucoup', symptoms: ['unexpected_reboot', 'inconnu'], useAi: false }),
    );

    expect(res.sessionId).toBe('session-1');
    expect(res.detectedSymptoms.map((s) => s.code)).toEqual(['unexpected_reboot', 'loud_fans']);
    expect(res.hypotheses[0].cause).toBe('overheating');
    expect(sessions.saved[0].symptoms).toEqual([
      { code: 'unexpected_reboot', source: 'user_selected' },
      { code: 'loud_fans', source: 'extracted_text' },
    ]);
  });

  it('n\'enregistre pas de session quand rien n\'est reconnu', async () => {
    const sessions = new InMemorySessions();
    const handler = new AnalyzeProblemHandler(new InMemoryKnowledge(), sessions);
    const res = await handler.execute(new AnalyzeProblemCommand({ platform: 'windows', description: 'bonjour', useAi: false }));
    expect(res.sessionId).toBeNull();
    expect(res.hypotheses).toEqual([]);
    expect(sessions.saved).toHaveLength(0);
  });
});

class ScriptedExtractor extends AssistedSymptomExtractor {
  constructor(private readonly result: AssistedExtraction | Error) {
    super();
  }
  extract = async () => {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  };
}

const user = { id: 'u1', roles: ['learner'] } as unknown as AuthenticatedUser;

describe('AnalyzeProblemHandler — repérage par l’IA', () => {
  const request = { platform: 'windows' as const, description: 'Le PC s’éteint quand je joue, ça souffle fort', useAi: true };

  it('utilise les codes proposés par l’IA (catalogue seulement) et garde la trace de leur origine', async () => {
    const sessions = new InMemorySessions();
    const ai = new ScriptedExtractor({
      codes: ['loud_fans', 'code_inexistant'],
      quotes: [{ code: 'loud_fans', quote: 'ça souffle fort', source: 'description' }],
      logFindings: [],
      remainingToday: 12,
    });
    const res = await new AnalyzeProblemHandler(new InMemoryKnowledge(), sessions, ai).execute(new AnalyzeProblemCommand(request, user));

    expect(res.detectedSymptoms.map((s) => s.code)).toEqual(['loud_fans']);
    expect(res.extraction).toMatchObject({ method: 'ai', note: null, remainingToday: 12 });
    expect(res.extraction.quotes[0]).toMatchObject({ code: 'loud_fans', quote: 'ça souffle fort', label: expect.any(String) });
    expect(sessions.saved[0].symptoms).toEqual([{ code: 'loud_fans', source: 'extracted_ai' }]);
  });

  it('se replie sur les synonymes quand l’IA est indisponible, et le dit', async () => {
    const ai = new ScriptedExtractor(new SymptomExtractionUnavailableError('HTTP 503'));
    const res = await new AnalyzeProblemHandler(new InMemoryKnowledge(), new InMemorySessions(), ai).execute(
      new AnalyzeProblemCommand({ ...request, description: 'il chauffe beaucoup' }, user),
    );
    expect(res.extraction.method).toBe('rules');
    expect(res.extraction.note).toContain('indisponible');
    expect(res.detectedSymptoms.map((s) => s.code)).toEqual(['loud_fans']);
  });

  it('exige une connexion', async () => {
    const handler = new AnalyzeProblemHandler(new InMemoryKnowledge(), new InMemorySessions(), new ScriptedExtractor(new Error('jamais appelé')));
    await expect(handler.execute(new AnalyzeProblemCommand(request, null))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
