/**
 * Contrats partagés entre le web et l'API : types de lecture et schémas de validation.
 * Règle : ce paquet ne contient aucune logique métier, seulement des formes de données.
 */
import { z } from 'zod';

export const PLATFORMS = [
  'windows', 'linux', 'macos', 'ios', 'ipados', 'android', 'network', 'cloud',
  'security', 'devops', 'docker', 'kubernetes', 'postgresql', 'mysql', 'software', 'cross_platform',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const RISK_LEVELS = ['none', 'low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// ---------- Knowledge base ----------
export interface RiskItem { level: RiskLevel; text: string }
export interface CommonError { error: string; cause: string; fix: string }
export interface CommandParameter { flag: string; description: string; riskLevel: RiskLevel }
export interface CommandExample { title: string; code: string; explanation: string; isRealCase: boolean }
export interface CommandAlternative { slug: string; name: string; note: string }
export interface SourceRef { title: string; url: string; publisher: string }

export interface CommandSummary {
  slug: string;
  name: string;
  platform: Platform;
  summary: string;
  difficulty: Difficulty;
  riskLevel: RiskLevel;
}

export interface CommandDetail extends CommandSummary {
  shell: string | null;
  history: string | null;
  internals: string | null;
  syntax: string;
  why: string;
  whenToUse: string;
  context: string | null;
  bestPractices: string[];
  commonErrors: CommonError[];
  risks: RiskItem[];
  requiresAdmin: boolean;
  /** true si l'interface doit masquer la commande jusqu'à lecture des risques (règle P-2). */
  maskedUntilRisksRead: boolean;
  /** false pour les commandes critiques : pas de bouton copier (règle P-2). */
  copyAllowed: boolean;
  parameters: CommandParameter[];
  examples: CommandExample[];
  alternatives: CommandAlternative[];
  sources: SourceRef[];
}

// ---------- Learning ----------
export interface LearningPathSummary {
  slug: string;
  title: string;
  summary: string;
  career: string | null;
  difficulty: Difficulty;
  estHours: number | null;
  courseCount: number;
}

// ---------- Diagnostic ----------
export const AnalyzeRequestSchema = z
  .object({
    platform: z.enum(PLATFORMS).default('windows'),
    description: z.string().trim().max(5000).optional(),
    symptoms: z.array(z.string().max(64)).max(30).optional(),
    evidence: z.string().max(100_000).optional(),
  })
  .refine((v) => Boolean(v.description?.length || v.symptoms?.length || v.evidence?.length), {
    message: 'Décrivez le problème, sélectionnez au moins un symptôme ou fournissez un extrait de journal.',
  });
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export interface ActionStep { step: string; why: string; risk: RiskLevel }

export interface HypothesisDto {
  cause: string;
  label: string;
  probability: number;
  explanation: string;
  reasoning: string[];
  actionPlan: ActionStep[];
}

export interface AnalyzeResponse {
  sessionId: string | null;
  detectedSymptoms: { code: string; label: string }[];
  matchedEvidence: { name: string; cause: string }[];
  confidence: number;
  hypotheses: HypothesisDto[];
  clarifyingQuestions: { symptom: string; question: string }[];
}

export interface SymptomDto { code: string; label: string; platform: Platform }

// ---------- Événements (CloudEvents data) ----------
export interface DiagnosticSessionCompletedV1 {
  sessionId: string;
  userId: string | null;
  platform: Platform;
  topCause: string | null;
  confidence: number;
}

// ---------- Académie (Phase 2) ----------
export type LessonStatus = 'completed' | 'available' | 'locked';
export type LessonType = 'reading' | 'video' | 'interactive' | 'lab' | 'quiz' | 'case_study';

export interface EnrollmentDto {
  pathSlug: string;
  pathTitle: string;
  progressPct: number;
  startedAt: string;
  completedAt: string | null;
}

export interface PathCourseDto {
  slug: string;
  title: string;
  summary: string;
  platform: Platform;
  difficulty: Difficulty;
  isPremium: boolean;
  lessonCount: number;
  completedCount: number;
}

export interface LearningPathDetail extends LearningPathSummary {
  courses: PathCourseDto[];
  /** null si l'utilisateur n'est pas connecté ou pas inscrit. */
  enrollment: EnrollmentDto | null;
}

export interface LessonRef {
  id: string;
  slug: string;
  title: string;
  type: LessonType;
  estMinutes: number | null;
  /** null pour un visiteur anonyme : la progression n'existe que pour un compte. */
  status: LessonStatus | null;
}

export interface CourseDetail {
  slug: string;
  title: string;
  summary: string;
  platform: Platform;
  difficulty: Difficulty;
  isPremium: boolean;
  modules: { title: string; lessons: LessonRef[] }[];
}

export interface LessonDetail extends LessonRef {
  courseSlug: string;
  courseTitle: string;
  moduleTitle: string;
  contentMd: string;
  objectives: string[];
  blockedBy: { slug: string; title: string } | null;
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
}

export interface CompleteLessonResult {
  lessonId: string;
  alreadyCompleted: boolean;
  next: { slug: string; title: string } | null;
  enrollments: EnrollmentDto[];
}

// Événement
export interface LessonCompletedV1 {
  userId: string;
  lessonId: string;
  courseId: string;
  completedAt: string;
  /** Durée estimée de la leçon (les consommateurs n'ont pas à lire le schéma learning). */
  estMinutes: number | null;
}

export interface PathCompletedV1 {
  userId: string;
  pathId: string;
}

// --- Gamification et tableau de bord (Phase 2) ---

export interface BadgeDto {
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | string;
  earnedAt: string | null;
}

export interface GamificationProfileDto {
  totalXp: number;
  level: number;
  levelTitle: string;
  /** Seuil d'XP du niveau actuel. */
  currentLevelXp: number;
  nextLevel: { level: number; title: string; minXp: number } | null;
  streakDays: number;
  longestStreak: number;
  lessonsCompleted: number;
  diagnosticsCompleted: number;
  pathsCompleted: number;
  showInLeaderboard: boolean;
  badges: BadgeDto[];
  recentXp: { amount: number; reason: string; at: string }[];
}

export interface LeaderboardEntryDto {
  position: number;
  /** Nom abrégé (« Alice M. ») : jamais l'e-mail ni le nom complet. */
  name: string;
  totalXp: number;
  level: number;
  isMe: boolean;
}

export interface LeaderboardDto {
  top: LeaderboardEntryDto[];
  me: LeaderboardEntryDto | null;
}

export interface SkillProgressDto {
  code: string;
  name: string;
  platform: Platform;
  totalLessons: number;
  completedLessons: number;
  pct: number;
}

export interface RecommendationDto {
  kind: 'start' | 'continue';
  text: string;
  href: string;
}

export interface DashboardDto {
  gamification: GamificationProfileDto;
  enrollments: EnrollmentDto[];
  skills: SkillProgressDto[];
  strengths: SkillProgressDto[];
  weaknesses: SkillProgressDto[];
  recommendations: RecommendationDto[];
}

// --- Back-office éditorial (Phase 2) ---

const text = (max: number) => z.string().trim().max(max);
const req = (max: number) => text(max).min(1, 'obligatoire');

/** Contenu complet d'une fiche commande, tel qu'un auteur le rédige (brouillon : tout peut être incomplet). */
export const CommandContentSchema = z.object({
  slug: text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$|^$/, 'minuscules, chiffres et tirets'),
  name: text(80),
  platform: z.enum(PLATFORMS),
  shell: text(40).nullable().default(null),
  summary: text(500),
  history: text(4000).nullable().default(null),
  internals: text(8000).nullable().default(null),
  syntax: text(500),
  why: text(4000),
  whenToUse: text(4000),
  context: text(4000).nullable().default(null),
  riskLevel: z.enum(RISK_LEVELS),
  risks: z.array(z.object({ level: z.enum(RISK_LEVELS), text: req(1000) })).max(20).default([]),
  difficulty: z.enum(DIFFICULTIES),
  requiresAdmin: z.boolean().default(false),
  bestPractices: z.array(req(500)).max(30).default([]),
  commonErrors: z.array(z.object({ error: req(300), cause: req(1000), fix: req(1000) })).max(30).default([]),
  parameters: z.array(z.object({ flag: req(60), description: req(1000), riskLevel: z.enum(RISK_LEVELS) })).max(50).default([]),
  examples: z
    .array(z.object({ title: req(200), code: req(2000), explanation: req(2000), isRealCase: z.boolean().default(false) }))
    .max(30)
    .default([]),
  alternatives: z.array(z.object({ slug: req(80), note: req(1000) })).max(20).default([]),
  sources: z.array(z.object({ title: req(300), url: z.string().url().max(500), publisher: req(100) })).max(20).default([]),
});
export type CommandContent = z.infer<typeof CommandContentSchema>;

export const REVISION_STATUSES = ['draft', 'in_review', 'changes_requested', 'published', 'withdrawn'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/** Écart à la règle « comprendre avant d'exécuter » : empêche la soumission tant qu'il en reste. */
export interface ContentIssue { field: string; message: string }

export interface RevisionSummaryDto {
  id: string;
  commandSlug: string;
  name: string;
  /** null : nouvelle fiche ; sinon modification d'une fiche publiée. */
  isNew: boolean;
  status: RevisionStatus;
  author: string;
  updatedAt: string;
}

export interface RevisionDto extends RevisionSummaryDto {
  content: CommandContent;
  issues: ContentIssue[];
  reviewer: string | null;
  reviewComment: string | null;
  /** Ce que l'utilisateur courant peut faire : l'interface n'a pas à deviner les règles. */
  can: { edit: boolean; submit: boolean; review: boolean; withdraw: boolean };
  history: { action: string; actor: string; comment: string | null; at: string }[];
}

export const CreateRevisionSchema = z.object({ fromSlug: z.string().trim().max(80).optional() });
export const ReviewDecisionSchema = z
  .object({ decision: z.enum(['approve', 'request_changes']), comment: z.string().trim().max(4000).default('') })
  .refine((d) => d.decision === 'approve' || d.comment.length > 0, {
    message: 'Expliquez ce qu’il faut changer : un refus sans explication n’aide pas l’auteur.',
    path: ['comment'],
  });

export interface CommandPublishedV1 {
  commandId: string;
  slug: string;
  revisionId: string;
  authorId: string;
  reviewerId: string;
  isNew: boolean;
}
