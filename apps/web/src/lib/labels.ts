import type { Difficulty, RiskLevel } from '@sysmaster/contracts';

export const difficultyLabel: Record<Difficulty, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
  expert: 'Expert',
};

/** Le risque est toujours affiché avec un libellé texte, jamais seulement une couleur (accessibilité). */
export const riskMeta: Record<RiskLevel, { label: string; className: string }> = {
  none: { label: 'Aucun risque', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' },
  low: { label: 'Risque faible', className: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200' },
  medium: { label: 'Risque moyen', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  high: { label: 'Risque élevé', className: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200' },
  critical: { label: 'Risque critique', className: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' },
};

export const lessonTypeLabel: Record<string, string> = {
  reading: 'Lecture',
  video: 'Vidéo',
  interactive: 'Interactif',
  lab: 'Pratique',
  quiz: 'Quiz',
  case_study: 'Étude de cas',
};
