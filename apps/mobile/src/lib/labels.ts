import type { Difficulty, LessonStatus, Platform, RiskLevel } from '@sysmaster/contracts';

export const difficultyLabel: Record<Difficulty, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
  expert: 'Expert',
};

/** Le risque est toujours écrit en toutes lettres, jamais seulement signalé par une couleur. */
export const riskLabel: Record<RiskLevel, string> = {
  none: 'Aucun risque',
  low: 'Risque faible',
  medium: 'Risque moyen',
  high: 'Risque élevé',
  critical: 'Risque critique',
};

export const lessonTypeLabel: Record<string, string> = {
  reading: 'Lecture',
  video: 'Vidéo',
  interactive: 'Interactif',
  lab: 'Pratique',
  quiz: 'Quiz',
  case_study: 'Étude de cas',
};

export const lessonStatusLabel: Record<LessonStatus, string> = {
  completed: 'Validée',
  available: 'Disponible',
  locked: 'Verrouillée',
};

export const platformLabel: Partial<Record<Platform, string>> = {
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
  network: 'Réseau',
  cross_platform: 'Multiplateforme',
};
