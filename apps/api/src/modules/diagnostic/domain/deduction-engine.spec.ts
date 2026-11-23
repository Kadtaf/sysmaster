import { rebootKnowledge } from '../../../../test/fixtures/reboot-knowledge';
import { DeductionEngine } from './deduction-engine';

describe('DeductionEngine — « Mon PC redémarre seul »', () => {
  const engine = new DeductionEngine(rebootKnowledge);
  const top = (symptoms: string[], evidence = '') => engine.rank(symptoms, evidence).hypotheses.map((h) => h.cause.code);

  it('ne renvoie rien sans observation', () => {
    expect(engine.rank([])).toEqual({ hypotheses: [], confidence: 0, matchedEvidence: [], clarifyingQuestions: [] });
  });

  it('produit des probabilités normalisées', () => {
    const { hypotheses } = engine.rank(['unexpected_reboot']);
    const sum = hypotheses.reduce((s, h) => s + h.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('ignore les causes sans lien avec les symptômes, même à forte probabilité a priori', () => {
    expect(top(['unexpected_reboot'])).not.toContain('unrelated');
  });

  it('place la surchauffe en tête quand le PC redémarre en jeu et chauffe', () => {
    expect(top(['unexpected_reboot', 'reboot_under_load', 'loud_fans'])[0]).toBe('overheating');
  });

  it('place le pilote en tête en cas d\'écran bleu', () => {
    expect(top(['unexpected_reboot', 'bsod'])[0]).toBe('driver_fault');
  });

  it('fait remonter l\'alimentation quand le journal contient Kernel-Power 41', () => {
    const without = engine.rank(['unexpected_reboot', 'reboot_under_load']);
    const withEvidence = engine.rank(['unexpected_reboot', 'reboot_under_load'], 'Event ID 41 Kernel-Power critical');
    const p = (r: typeof without) => r.hypotheses.find((h) => h.cause.code === 'psu_failure')!.probability;
    expect(p(withEvidence)).toBeGreaterThan(p(without));
    expect(withEvidence.hypotheses[0].cause.code).toBe('psu_failure');
    expect(withEvidence.matchedEvidence.map((e) => e.name)).toEqual(['Kernel-Power 41']);
  });

  it('ne plante pas sur un motif de preuve invalide en base', () => {
    expect(() => engine.rank(['unexpected_reboot'], 'texte quelconque')).not.toThrow();
  });

  it('explique chaque hypothèse', () => {
    const [first] = engine.rank(['unexpected_reboot', 'loud_fans']).hypotheses;
    expect(first.reasoning.length).toBeGreaterThan(0);
    expect(first.reasoning.join(' ')).toContain('Ventilateurs bruyants');
  });

  it('augmente la confiance avec plus d\'observations concordantes', () => {
    const low = engine.rank(['unexpected_reboot']).confidence;
    const high = engine.rank(['unexpected_reboot', 'reboot_under_load', 'loud_fans']).confidence;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('propose une question qui départage les deux meilleures hypothèses', () => {
    const { hypotheses, clarifyingQuestions } = engine.rank(['unexpected_reboot', 'reboot_under_load']);
    expect(hypotheses.slice(0, 2).map((h) => h.cause.code).sort()).toEqual(['overheating', 'psu_failure']);
    // « chauffe » sépare surchauffe (0,85) et alimentation (0,15).
    expect(clarifyingQuestions[0].symptom.code).toBe('loud_fans');
  });
});
