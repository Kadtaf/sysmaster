import { KnowledgeSnapshot } from '../../src/modules/diagnostic/domain/model';

/** Extrait des règles de db/seeds/001_demo.sql pour tester le domaine sans base de données. */
export const rebootKnowledge: KnowledgeSnapshot = {
  symptoms: [
    { code: 'unexpected_reboot', label: 'Le PC redémarre seul', platform: 'windows', synonyms: ['redémarre seul', 'redemarre'] },
    { code: 'reboot_under_load', label: 'Redémarre pendant un jeu ou une tâche lourde', platform: 'windows', synonyms: ['en jeu', 'jeu'] },
    { code: 'loud_fans', label: 'Ventilateurs bruyants ou PC très chaud', platform: 'windows', synonyms: ['ventilateur', 'chauffe'] },
    { code: 'bsod', label: 'Écran bleu avant le redémarrage', platform: 'windows', synonyms: ['écran bleu', 'bsod'] },
  ],
  causes: [
    { code: 'overheating', label: 'Surchauffe', prior: 0.2, explanation: 'x', actionPlan: [] },
    { code: 'driver_fault', label: 'Pilote défectueux', prior: 0.25, explanation: 'x', actionPlan: [] },
    { code: 'psu_failure', label: 'Alimentation', prior: 0.15, explanation: 'x', actionPlan: [] },
    { code: 'ram_fault', label: 'RAM', prior: 0.15, explanation: 'x', actionPlan: [] },
    { code: 'unrelated', label: 'Cause sans rapport', prior: 0.9, explanation: 'x', actionPlan: [] },
  ],
  rules: [
    { symptomCode: 'unexpected_reboot', causeCode: 'overheating', likelihood: 0.7, rationale: '' },
    { symptomCode: 'unexpected_reboot', causeCode: 'driver_fault', likelihood: 0.6, rationale: '' },
    { symptomCode: 'unexpected_reboot', causeCode: 'psu_failure', likelihood: 0.8, rationale: '' },
    { symptomCode: 'unexpected_reboot', causeCode: 'ram_fault', likelihood: 0.5, rationale: '' },
    { symptomCode: 'reboot_under_load', causeCode: 'overheating', likelihood: 0.85, rationale: '' },
    { symptomCode: 'reboot_under_load', causeCode: 'psu_failure', likelihood: 0.8, rationale: '' },
    { symptomCode: 'reboot_under_load', causeCode: 'driver_fault', likelihood: 0.35, rationale: '' },
    { symptomCode: 'loud_fans', causeCode: 'overheating', likelihood: 0.85, rationale: '' },
    { symptomCode: 'loud_fans', causeCode: 'psu_failure', likelihood: 0.15, rationale: '' },
    { symptomCode: 'bsod', causeCode: 'driver_fault', likelihood: 0.85, rationale: '' },
    { symptomCode: 'bsod', causeCode: 'ram_fault', likelihood: 0.7, rationale: '' },
    { symptomCode: 'bsod', causeCode: 'psu_failure', likelihood: 0.1, rationale: '' },
    { symptomCode: 'bsod', causeCode: 'overheating', likelihood: 0.2, rationale: '' },
  ],
  evidencePatterns: [
    { name: 'Kernel-Power 41', pattern: '(Event ?ID[: ]*41|Kernel-Power)', causeCode: 'psu_failure', boost: 2.5 },
    { name: 'Motif invalide', pattern: '([', causeCode: 'ram_fault', boost: 10 },
  ],
};
