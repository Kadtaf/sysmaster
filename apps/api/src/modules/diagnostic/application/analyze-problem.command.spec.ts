import { rebootKnowledge } from '../../../../test/fixtures/reboot-knowledge';
import { AnalyzeProblemCommand, AnalyzeProblemHandler } from './analyze-problem.command';
import { DiagnosticKnowledgePort, DiagnosticSessionRepository, NewDiagnosticSession } from './ports';

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
      new AnalyzeProblemCommand({ platform: 'windows', description: 'il chauffe beaucoup', symptoms: ['unexpected_reboot', 'inconnu'] }),
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
    const res = await handler.execute(new AnalyzeProblemCommand({ platform: 'windows', description: 'bonjour' }));
    expect(res.sessionId).toBeNull();
    expect(res.hypotheses).toEqual([]);
    expect(sessions.saved).toHaveLength(0);
  });
});
