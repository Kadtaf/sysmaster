import type { CauseContent } from '@sysmaster/contracts';
import type { KnowledgeSnapshot } from '../../diagnostic/domain/model';
import { simulate, withDraftCause } from './simulation';

const kb: KnowledgeSnapshot = {
  symptoms: [
    { code: 'reboot', label: 'Redémarre', platform: 'windows', synonyms: ['redémarre'] },
    { code: 'hot', label: 'Chauffe', platform: 'windows', synonyms: ['chauffe'] },
  ],
  causes: [
    { code: 'overheating', label: 'Surchauffe', prior: 0.2, explanation: '', actionPlan: [] },
    { code: 'psu', label: 'Alimentation', prior: 0.15, explanation: '', actionPlan: [] },
  ],
  rules: [
    { symptomCode: 'reboot', causeCode: 'overheating', likelihood: 0.7, rationale: '' },
    { symptomCode: 'hot', causeCode: 'overheating', likelihood: 0.85, rationale: '' },
    { symptomCode: 'reboot', causeCode: 'psu', likelihood: 0.8, rationale: '' },
  ],
  evidencePatterns: [],
};
const cases = [{ name: 'Chauffe et redémarre', description: 'il redémarre et chauffe', symptoms: [], evidence: '', expectedCause: 'overheating' }];

const psu = (over: Partial<CauseContent> = {}): CauseContent => ({
  code: 'psu', label: 'Alimentation', platform: 'windows', prior: 0.15, explanation: '', actionPlan: [],
  rules: [{ symptom: 'reboot', likelihood: 0.8, rationale: '' }], evidencePatterns: [], newSymptoms: [], ...over,
});

describe('simulation des règles de diagnostic', () => {
  it('sans changement : aucune régression', () => {
    const r = simulate(kb, withDraftCause(kb, psu()), cases);
    expect(r).toMatchObject({ regressions: 0, improvements: 0 });
    expect(r.cases[0].before).toEqual(r.cases[0].after);
  });

  it('détecte une régression : la bonne cause perd la première place', () => {
    const r = simulate(kb, withDraftCause(kb, psu({ prior: 0.9, rules: [{ symptom: 'reboot', likelihood: 0.95, rationale: '' }, { symptom: 'hot', likelihood: 0.9, rationale: '' }] })), cases);
    expect(r.regressions).toBe(1);
    expect(r.cases[0]).toMatchObject({ regression: true, before: { top: 'overheating', expectedRank: 1 }, after: { top: 'psu', expectedRank: 2 } });
  });

  it('withDraftCause ne modifie pas la base d’origine', () => {
    const copy = JSON.stringify(kb);
    withDraftCause(kb, psu({ prior: 0.5, newSymptoms: [{ code: 'beep', label: 'Bip', synonyms: [] }] }));
    expect(JSON.stringify(kb)).toBe(copy);
  });
});
