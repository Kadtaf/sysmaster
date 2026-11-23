import { rebootKnowledge } from '../../../../test/fixtures/reboot-knowledge';
import { extractSymptoms } from './symptom-extractor';

describe('extractSymptoms', () => {
  it('reconnaît les symptômes sans tenir compte des accents ni de la casse', () => {
    const codes = extractSymptoms('Mon PC REDEMARRE seul quand je suis en jeu, et il chauffe', rebootKnowledge.symptoms);
    expect(codes.sort()).toEqual(['loud_fans', 'reboot_under_load', 'unexpected_reboot']);
  });

  it('renvoie une liste vide pour une description vide', () => {
    expect(extractSymptoms('   ', rebootKnowledge.symptoms)).toEqual([]);
  });

  it('ne confond pas un terme avec la fin d\'un autre mot', () => {
    expect(extractSymptoms('problème de lignes (pas de bsod) ', rebootKnowledge.symptoms)).toEqual(['bsod']);
    expect(extractSymptoms('enjeu commercial', rebootKnowledge.symptoms)).toEqual([]);
  });
});
