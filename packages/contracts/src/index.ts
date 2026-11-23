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
