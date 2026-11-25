import type { Difficulty, LabCategory, RiskLevel } from '@sysmaster/contracts';

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

export const xpReasonLabel: Record<string, string> = {
  'lesson.completed': 'Leçon validée',
  'diagnostic.completed': 'Diagnostic mené à terme',
  'path.completed': 'Parcours terminé',
  'lab.solved': 'Lab résolu',
};

export const labCategoryLabel: Record<LabCategory, string> = {
  windows: 'Windows', linux: 'Linux', macos: 'macOS', docker: 'Docker', network: 'Réseau',
  cyber: 'Cybersécurité', cloud: 'Cloud', database: 'Bases de données',
};

export const rarityLabel: Record<string, string> = {
  common: 'Courant', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire',
};

export const revisionStatusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-muted text-foreground' },
  in_review: { label: 'En relecture', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' },
  changes_requested: { label: 'Changements demandés', className: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100' },
  published: { label: 'Publiée', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' },
  withdrawn: { label: 'Retirée', className: 'bg-muted text-muted-foreground' },
};

export const revisionActionLabel: Record<string, string> = {
  created: 'a créé la révision',
  submitted: 'a soumis à la relecture',
  changes_requested: 'a demandé des changements',
  approved: 'a approuvé et publié',
  withdrawn: 'a retiré la révision',
};

export const EDITORIAL_ROLES = ['author', 'reviewer', 'admin', 'super_admin'];

export const contentKindMeta: Record<string, { label: string; newLabel: string; placeholder: string; href: (key: string) => string; rule: string }> = {
  command: {
    label: 'Fiche commande', newLabel: 'Nouvelle fiche', placeholder: 'linux-systemctl', href: (k) => `/commandes/${k}`,
    rule: 'Une fiche n’est publiable que si le lecteur peut comprendre avant d’exécuter',
  },
  course: {
    label: 'Cours', newLabel: 'Nouveau cours', placeholder: 'linux-systemd', href: (k) => `/cours/${k}`,
    rule: 'Un cours n’est publiable que si chaque leçon a des objectifs et un contenu, sans effacer la progression des apprenants',
  },
  path: {
    label: 'Parcours', newLabel: 'Nouveau parcours', placeholder: 'administrateur-linux', href: (k) => `/parcours/${k}`,
    rule: 'Un parcours n’est publiable que s’il présente son objectif et enchaîne des cours publiés',
  },
  diagnostic_cause: {
    label: 'Cause de diagnostic', newLabel: 'Nouvelle cause', placeholder: 'psu_failure', href: () => '/diagnostic',
    rule: 'Une cause n’est publiable que si chaque probabilité est justifiée et que le plan d’action commence sans danger',
  },
  quiz: {
    label: 'Quiz', newLabel: 'Nouveau quiz', placeholder: 'quiz-linux-df', href: (k) => `/quiz/${k}`,
    rule: 'Un quiz n’est publiable que si chaque question a une bonne réponse parmi ses choix et explique pourquoi',
  },
  lab: {
    label: 'Lab simulé', newLabel: 'Nouveau lab', placeholder: 'linux-disque-plein-nginx', href: (k) => `/labs/${k}`,
    rule: 'Un lab n’est publiable que s’il part d’une vraie panne et que sa démarche de référence répare la machine',
  },
  agent_profile: {
    label: 'Profil d’agent IA', newLabel: 'Nouveau profil', placeholder: 'network_expert', href: () => '/assistant',
    rule: 'Réservé aux administrateurs, relu par un second administrateur ; les règles de sécurité de l’assistant restent dans le code',
  },
};

export const MODERATOR_ROLES = ['moderator', 'admin', 'super_admin'];

/** « il y a 3 h », « il y a 2 j » : assez précis pour un fil de discussion. */
export function since(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'medium' });
}

export const mentorshipStatusLabel: Record<'requested' | 'active' | 'ended' | 'declined', string> = {
  requested: 'En attente', active: 'En cours', ended: 'Terminé', declined: 'Refusé ou retiré',
};
