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
    /** Repérage des symptômes par l'IA (connecté, compte dans le quota quotidien) ; sinon par synonymes. */
    useAi: z.boolean().default(false),
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

export interface SymptomExtraction {
  /** « ai » : repérés par le modèle (citation vérifiée) ; « rules » : par synonymes. */
  method: 'ai' | 'rules';
  /** Pourquoi la méthode demandée n'a pas pu servir (IA indisponible…), ou null. */
  note: string | null;
  /** Pour chaque symptôme repéré par l'IA, le passage du texte de l'utilisateur qui le montre. */
  quotes: { code: string; label: string; quote: string; source: 'description' | 'evidence' }[];
  /** Lignes du journal relevées par l'IA, expliquées en une phrase. */
  logFindings: { summary: string; quote: string }[];
  remainingToday: number | null;
}

export interface AnalyzeResponse {
  sessionId: string | null;
  detectedSymptoms: { code: string; label: string }[];
  extraction: SymptomExtraction;
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

export interface LabSolvedV1 {
  instanceId: string;
  labSlug: string;
  userId: string;
  hintsUsed: number;
  score: number;
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

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$|^$/;
const LESSON_TYPES_ = ['reading', 'video', 'interactive', 'lab', 'quiz', 'case_study'] as const;

/** Cours : plan complet (modules et leçons). Les leçons sont reconnues par leur identifiant d'URL. */
export const CourseContentSchema = z.object({
  slug: text(80).regex(slugRe, 'minuscules, chiffres et tirets'),
  title: text(200),
  summary: text(1000),
  platform: z.enum(PLATFORMS),
  difficulty: z.enum(DIFFICULTIES),
  isPremium: z.boolean().default(false),
  modules: z
    .array(
      z.object({
        title: text(200),
        lessons: z
          .array(
            z.object({
              slug: text(80).regex(slugRe, 'minuscules, chiffres et tirets'),
              title: text(200),
              type: z.enum(LESSON_TYPES_),
              estMinutes: z.number().int().min(1).max(600).nullable().default(null),
              objectives: z.array(req(300)).max(10).default([]),
              contentMd: text(50000),
              skills: z.array(req(80)).max(10).default([]),
            }),
          )
          .max(50),
      }),
    )
    .max(30)
    .default([]),
});
export type CourseContent = z.infer<typeof CourseContentSchema>;

/** Parcours : présentation et suite ordonnée de cours publiés. */
export const PathContentSchema = z.object({
  slug: text(80).regex(slugRe, 'minuscules, chiffres et tirets'),
  title: text(200),
  summary: text(1000),
  career: text(60).nullable().default(null),
  difficulty: z.enum(DIFFICULTIES),
  estHours: z.number().int().min(1).max(2000).nullable().default(null),
  courses: z.array(req(80)).max(40).default([]),
});
export type PathContent = z.infer<typeof PathContentSchema>;

/** Cause de diagnostic : probabilité a priori, plan d'action, règles P(symptôme | cause) et indices de journaux. */
export const CauseContentSchema = z.object({
  code: text(60).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$|^$/, 'minuscules, chiffres et soulignés'),
  label: text(200),
  platform: z.enum(PLATFORMS),
  prior: z.number().gt(0).max(1),
  explanation: text(4000),
  actionPlan: z
    .array(z.object({ step: req(500), why: text(1000), risk: z.enum(RISK_LEVELS), commandSlug: text(80).nullable().default(null) }))
    .max(20)
    .default([]),
  rules: z
    .array(z.object({ symptom: req(60), likelihood: z.number().gt(0).lt(1), rationale: text(1000) }))
    .max(50)
    .default([]),
  evidencePatterns: z
    .array(
      z.object({
        name: req(120),
        source: z.enum(['windows_event', 'syslog', 'journald', 'docker', 'postgresql', 'nginx', 'apache', 'macos_log', 'screenshot_ocr']),
        pattern: req(500),
        boost: z.number().gt(0).max(50),
      }),
    )
    .max(20)
    .default([]),
  /** Symptômes à créer à la publication s'ils n'existent pas encore. */
  newSymptoms: z
    .array(z.object({ code: req(60).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'minuscules, chiffres et soulignés'), label: req(200), synonyms: z.array(req(100)).max(30).default([]) }))
    .max(20)
    .default([]),
});
export type CauseContent = z.infer<typeof CauseContentSchema>;

/**
 * Profil d'agent IA : la mission (tuteur, diagnosticien) ou les consignes d'un domaine (Windows, Linux…)
 * ajoutées au socle de sécurité du service IA, qui, lui, ne se modifie pas ici.
 */
export const AgentProfileContentSchema = z.object({
  code: req(40).regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, 'minuscules, chiffres et soulignés'),
  name: req(120),
  /** Ce que fait l'agent, en une phrase (affiché, non envoyé au modèle). */
  mission: z.string().trim().max(400).default(''),
  /** Consignes envoyées au modèle après le socle de sécurité. */
  systemPrompt: z.string().trim().max(4000).default(''),
  enabled: z.boolean().default(true),
});
export type AgentProfileContent = z.infer<typeof AgentProfileContentSchema>;

/** Quiz d'entraînement : questions à choix, chacune avec l'explication de la bonne réponse. */
const choiceId = z.string().regex(/^[a-f]$/, 'lettre de a à f');
export const QuizQuestionSchema = z.object({
  type: z.enum(['single', 'multiple']),
  promptMd: req(2000),
  choices: z.array(z.object({ id: choiceId, text: req(500) })).max(6).default([]),
  answer: z.array(choiceId).max(6).default([]),
  /** Pourquoi la bonne réponse est juste, et pourquoi les autres ne le sont pas. */
  explanation: text(3000),
  difficulty: z.enum(DIFFICULTIES),
  /** Proposée par l'IA : la relecture humaine reste obligatoire avant publication. */
  generatedByAi: z.boolean().default(false),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export const QuizContentSchema = z.object({
  slug: text(80).regex(slugRe, 'minuscules, chiffres et tirets'),
  title: text(200),
  platform: z.enum(PLATFORMS),
  /** Fiche dont le quiz vérifie la compréhension (lien affiché sur la fiche). */
  commandSlug: text(80).nullable().default(null),
  questions: z.array(QuizQuestionSchema).max(30).default([]),
});
export type QuizContent = z.infer<typeof QuizContentSchema>;

/** Demande de brouillon de quiz rédigé par l'IA à partir d'une fiche publiée. */
export const GenerateQuizDraftSchema = z.object({
  commandSlug: req(80),
  count: z.number().int().min(1).max(10).default(5),
  level: z.enum(DIFFICULTIES).default('beginner'),
});
export type GenerateQuizDraftInput = z.infer<typeof GenerateQuizDraftSchema>;
export interface QuizDraftDto {
  revisionId: string;
  /** Questions ajoutées par l'IA (après vérification de forme). */
  added: number;
  /** Questions écartées par les vérifications, avec la raison. */
  notes: string[];
  remainingToday: number;
}

// ---------- Labs simulés (Phase 4) ----------
export const LAB_CATEGORIES = ['windows', 'linux', 'macos', 'docker', 'network', 'cyber', 'cloud', 'database'] as const;
export type LabCategory = (typeof LAB_CATEGORIES)[number];

export interface LabSummaryDto {
  slug: string;
  title: string;
  category: LabCategory;
  difficulty: Difficulty;
  runtime: 'simulation' | 'container' | 'microvm' | 'windows_vm';
  ttlMinutes: number;
  objectives: string[];
}
export interface LabDetailDto extends LabSummaryDto {
  briefMd: string;
  hintCount: number;
  /** Ce que la validation vérifiera : l'objectif est connu, pas le chemin pour y arriver. */
  checks: string[];
}
export interface LabTranscriptEntry {
  command: string;
  output: string;
  exitCode: number;
  /** Explication quand la commande a été refusée par prudence. */
  warning?: string;
}
export type LabInstanceStatus = 'running' | 'solved' | 'expired';
export interface LabInstanceDto {
  id: string;
  labSlug: string;
  status: LabInstanceStatus;
  /** Invite du terminal, ex. « root@web01:/root# ». */
  prompt: string;
  transcript: LabTranscriptEntry[];
  hints: string[];
  hintCount: number;
  expiresAt: string;
  /** Renseignés une fois le lab résolu. */
  score: number | null;
  solutionMd: string | null;
}
export const LabCommandSchema = z.object({ command: z.string().max(500) });
// Contenu éditable d'un lab simulé (back-office). La machine est décrite dans son état de panne.
const absPath = z.string().max(300).regex(/^\/[^\0]*$/, 'chemin absolu (commence par /)');
export const LabMachineSchema = z.object({
  hostname: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/, 'minuscules, chiffres et tirets'),
  cwd: absPath,
  /** Horloge de départ (ISO 8601) : les journaux produits pendant le lab la suivent. */
  clock: z.string().datetime(),
  nextPid: z.number().int().min(2).max(4_000_000),
  dirs: z.array(absPath).max(300),
  files: z.record(absPath, z.object({ size: z.number().int().min(0).max(2 ** 50), content: z.string().max(20_000).optional() })),
  mounts: z.array(z.object({
    target: absPath,
    device: z.string().min(1).max(60),
    sizeBytes: z.number().int().positive().max(2 ** 50),
    baseUsedBytes: z.number().int().min(0).max(2 ** 50),
  })).min(1).max(10),
  services: z.record(z.string().regex(/^[a-z0-9@._-]+$/).max(60), z.object({
    description: z.string().max(200),
    active: z.enum(['active', 'inactive', 'failed']),
    enabled: z.boolean(),
    process: z.string().min(1).max(60),
    pid: z.number().int().positive().optional(),
    ports: z.array(z.number().int().min(1).max(65535)).max(10),
    writes: absPath.optional(),
    needsFiles: z.array(absPath).max(20).optional(),
    journal: z.array(z.string().max(500)).max(60),
  })),
  network: z.object({
    interfaces: z.array(z.object({
      name: z.string().regex(/^[a-z0-9]+$/).max(15),
      address: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, 'adresse CIDR, ex. 10.0.0.15/24'),
      up: z.boolean(),
      mac: z.string().max(17).optional(),
    })).max(6),
    routes: z.array(z.object({
      destination: z.string().regex(/^default$|^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, '« default » ou réseau CIDR'),
      via: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/).optional(),
      dev: z.string().max(15),
    })).max(20),
    hosts: z.record(z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/), z.object({
      label: z.string().max(60).optional(),
      respondsToPing: z.boolean(),
      dns: z.record(z.string().max(253), z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/)).optional(),
      http: z.object({ status: z.number().int().min(100).max(599), body: z.string().max(5000) }).optional(),
    })),
  }).optional(),
});
export type LabMachine = z.infer<typeof LabMachineSchema>;
export const LabCheckSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('service_active'), service: z.string().max(60) }),
  z.object({ kind: z.literal('service_enabled'), service: z.string().max(60), expected: z.boolean() }),
  z.object({ kind: z.literal('disk_usage_below'), mount: absPath, percent: z.number().int().min(1).max(100) }),
  z.object({ kind: z.literal('path_exists'), path: absPath, expected: z.boolean() }),
  z.object({ kind: z.literal('host_reachable'), target: z.string().min(1).max(253) }),
  z.object({ kind: z.literal('name_resolves'), name: z.string().min(1).max(253) }),
  z.object({ kind: z.literal('file_has_line'), path: absPath, line: z.string().min(1).max(300), expected: z.boolean() }),
]);
export type LabCheck = z.infer<typeof LabCheckSchema>;
export const LabContentSchema = z.object({
  slug: text(80).regex(slugRe, 'minuscules, chiffres et tirets'),
  title: text(200),
  category: z.enum(LAB_CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  ttlMinutes: z.number().int().min(10).max(240).default(60),
  briefMd: text(8000),
  objectives: z.array(text(300)).max(10).default([]),
  /** Indices progressifs : du plus général au plus précis. */
  hints: z.array(text(500)).max(8).default([]),
  /** Explication montrée après la réussite : cause, démarche, prévention. */
  solutionMd: text(10_000),
  machine: LabMachineSchema,
  validators: z.array(z.object({ description: text(200), check: LabCheckSchema })).max(10).default([]),
  /**
   * Démarche de référence : commandes qui doivent réparer la machine. Rejouée à chaque
   * enregistrement : un lab n'est publiable que si elle passe tous les validateurs.
   */
  walkthrough: z.array(z.string().max(500)).max(40).default([]),
});
export type LabContent = z.infer<typeof LabContentSchema>;

export type LabCommandInput = z.infer<typeof LabCommandSchema>;
export interface LabCommandResultDto extends LabTranscriptEntry {
  prompt: string;
}
export interface LabCheckResultDto {
  solved: boolean;
  checks: { description: string; passed: boolean }[];
  instance: LabInstanceDto;
}

// ---------- Quiz d'entraînement (apprenants) ----------
export interface QuizSummaryDto {
  slug: string;
  title: string;
  questionCount: number;
}
/** Quiz tel que l'apprenant le voit : sans les réponses, qui ne sont révélées qu'après sa tentative. */
export interface PracticeQuizDto {
  slug: string;
  title: string;
  platform: Platform | null;
  commandSlug: string | null;
  passScore: number;
  questions: { id: string; type: 'single' | 'multiple'; promptMd: string; choices: { id: string; text: string }[]; difficulty: Difficulty }[];
}
export const QuizAttemptSchema = z.object({
  /** Identifiant de question → lettres cochées. Une question sans réponse compte comme fausse. */
  answers: z.record(z.string().uuid(), z.array(z.string().regex(/^[a-f]$/)).max(6)),
});
export type QuizAttemptInput = z.infer<typeof QuizAttemptSchema>;
export interface QuizAttemptResultDto {
  score: number;
  passed: boolean;
  correctCount: number;
  total: number;
  /** false si la tentative n'est pas enregistrée (visiteur non connecté). */
  recorded: boolean;
  results: { questionId: string; correct: boolean; given: string[]; answer: string[]; explanation: string }[];
}

export const CONTENT_KINDS = ['command', 'course', 'path', 'diagnostic_cause', 'agent_profile', 'quiz', 'lab'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const REVISION_STATUSES = ['draft', 'in_review', 'changes_requested', 'published', 'withdrawn'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/** Écart aux règles de publication : empêche la soumission tant qu'il en reste. */
export interface ContentIssue { field: string; message: string }

export interface RevisionSummaryDto {
  id: string;
  kind: ContentKind;
  /** Identifiant d'URL (fiche, cours, parcours) ou code (cause de diagnostic). */
  key: string;
  title: string;
  /** true : crée un contenu ; false : modifie un contenu publié. */
  isNew: boolean;
  status: RevisionStatus;
  author: string;
  updatedAt: string;
}

export type RevisionContent =
  | { kind: 'command'; content: CommandContent }
  | { kind: 'course'; content: CourseContent }
  | { kind: 'path'; content: PathContent }
  | { kind: 'diagnostic_cause'; content: CauseContent }
  | { kind: 'agent_profile'; content: AgentProfileContent }
  | { kind: 'quiz'; content: QuizContent }
  | { kind: 'lab'; content: LabContent };

export type RevisionDto = RevisionSummaryDto &
  RevisionContent & {
    issues: ContentIssue[];
    reviewer: string | null;
    reviewComment: string | null;
    /** Ce que l'utilisateur courant peut faire : l'interface n'a pas à deviner les règles. */
    can: { edit: boolean; submit: boolean; review: boolean; withdraw: boolean };
    history: { action: string; actor: string; comment: string | null; at: string }[];
  };

export const CreateRevisionSchema = z.object({
  kind: z.enum(CONTENT_KINDS).default('command'),
  /** Contenu publié à modifier (identifiant d'URL ou code) ; absent : nouveau contenu. */
  from: z.string().trim().max(80).optional(),
  /** Ancien nom du champ, accepté pour les fiches. */
  fromSlug: z.string().trim().max(80).optional(),
});
export const ReviewDecisionSchema = z
  .object({ decision: z.enum(['approve', 'request_changes']), comment: z.string().trim().max(4000).default('') })
  .refine((d) => d.decision === 'approve' || d.comment.length > 0, {
    message: 'Expliquez ce qu’il faut changer : un refus sans explication n’aide pas l’auteur.',
    path: ['comment'],
  });

/** Résultat d'une simulation de règles de diagnostic sur les cas de référence. */
export interface SimulationCaseDto {
  name: string;
  expected: { code: string; label: string };
  before: { top: string | null; expectedRank: number | null; expectedProbability: number };
  after: { top: string | null; expectedRank: number | null; expectedProbability: number };
  /** La bonne cause était première et ne l'est plus. */
  regression: boolean;
  /** La bonne cause n'était pas première et le devient. */
  improvement: boolean;
}
export interface SimulationDto {
  cases: SimulationCaseDto[];
  regressions: number;
  improvements: number;
}

export interface ContentPublishedV1 {
  kind: ContentKind;
  /** Identifiant de la cible (uuid, ou code pour une cause). */
  targetId: string;
  key: string;
  revisionId: string;
  authorId: string;
  reviewerId: string;
  isNew: boolean;
}
/** Conservé pour les consommateurs de kb.command.published.v1. */
export interface CommandPublishedV1 {
  commandId: string;
  slug: string;
  revisionId: string;
  authorId: string;
  reviewerId: string;
  isNew: boolean;
}

// ---------- Assistant IA (Phase 3) ----------
// Miroir du contrat du service IA (services/ai/app/schemas.py).
export const ASSISTANT_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const AskAssistantSchema = z.object({
  question: z.string().trim().min(3, 'Posez une question d’au moins 3 caractères.').max(4000),
  platform: z.enum(PLATFORMS).optional(),
  level: z.enum(ASSISTANT_LEVELS).default('beginner'),
  conversationId: z.string().uuid().optional(),
});
export type AskAssistantInput = z.infer<typeof AskAssistantSchema>;

export interface AssistantSource {
  ref: number;
  title: string;
  url: string;
  /** Fiche SysMaster (relue, pédagogique) ou passage de documentation officielle (référence exacte). */
  kind: 'kb_command' | 'official_doc';
  slug: string | null;
  /** Mention de licence à afficher avec un passage de documentation officielle (CC BY…). */
  attribution?: string | null;
}

export interface AssistantStep {
  title: string;
  why: string;
  how: string;
  command: string | null;
  shell: string | null;
  when: string;
  risk: RiskLevel;
  riskNote: string;
  alternatives: string[];
  /** Règle P-2 appliquée par le service : commande masquée tant que les risques ne sont pas lus. */
  maskedUntilRisksRead: boolean;
  copyAllowed: boolean;
  /** Motifs destructifs reconnus par le service (indépendamment du modèle). */
  flaggedBy: string[];
}

export interface AssistantAnswer {
  summary: string;
  explanation: string;
  steps: AssistantStep[];
  sources: AssistantSource[];
  checkQuestions: string[];
  /** Faux si la réponse ne s'appuie sur aucune source fournie : affichée « non vérifiée ». */
  verified: boolean;
  outOfScope: boolean;
  notes: string[];
}

export interface AssistantReplyDto {
  conversationId: string;
  messageId: string;
  answer: AssistantAnswer;
  agent: 'tutor' | 'diagnostician';
  domain: string | null;
  outcome: 'answered' | 'refused';
  remainingToday: number;
}

/**
 * Événements du flux `POST /assistant/ask/stream` (Server-Sent Events, dans cet ordre) :
 * `meta` (routage et documents consultés), `delta`* (résumé et explication au fil de la génération),
 * puis `reply` (réponse validée par les garde-fous, seule à porter les étapes et commandes) ou `error`.
 */
export type AssistantStreamEvent =
  | { event: 'meta'; data: { agent: 'tutor' | 'diagnostician'; domain: string | null; consulted: { ref: number; title: string; kind: 'kb_command' | 'official_doc' }[] } }
  | { event: 'delta'; data: { field: 'summary' | 'explanation'; text: string } }
  | { event: 'reply'; data: AssistantReplyDto }
  | { event: 'error'; data: { message: string; status: number } };

export interface AssistantConversationSummary {
  id: string;
  title: string;
  createdAt: string;
}

export interface AssistantTurnDto {
  messageId: string;
  question: string;
  reply: AssistantAnswer | null;
  agent: string | null;
  createdAt: string;
}

export const AssistantFeedbackSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().trim().max(2000).optional(),
});
