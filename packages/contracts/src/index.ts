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
  files: z.record(absPath, z.object({
    size: z.number().int().min(0).max(2 ** 50),
    content: z.string().max(20_000).optional(),
    /** Droits en octal, ex. « 640 » (644 si absent). */
    mode: z.string().regex(/^[0-7]{3}$/, 'droits en octal, ex. 640').optional(),
    owner: z.string().regex(/^[a-z_][a-z0-9_-]*$/).max(32).optional(),
    group: z.string().regex(/^[a-z_][a-z0-9_-]*$/).max(32).optional(),
  })),
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
    user: z.string().regex(/^[a-z_][a-z0-9_-]*$/).max(32).optional(),
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
  docker: z.object({
    composeFile: absPath.optional(),
    images: z.record(z.string().max(200), z.object({
      requiredEnv: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(20).optional(),
      listens: z.number().int().min(1).max(65535).optional(),
      startupLog: z.array(z.string().max(300)).max(20),
      http: z.object({ status: z.number().int().min(100).max(599), body: z.string().max(5000) }).optional(),
    })),
    containers: z.record(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).max(100), z.object({
      service: z.string().max(60).optional(),
      image: z.string().max(200),
      status: z.enum(['running', 'restarting', 'exited', 'created']),
      restart: z.enum(['no', 'always', 'unless-stopped', 'on-failure']),
      restartCount: z.number().int().min(0),
      ports: z.array(z.object({ host: z.number().int().min(1).max(65535), container: z.number().int().min(1).max(65535) })).max(10),
      env: z.record(z.string().max(100), z.string().max(500)),
      logs: z.array(z.string().max(500)).max(60),
      stoppedByUser: z.boolean().optional(),
    })),
  }).optional(),
  firewall: z.object({
    active: z.boolean(),
    defaultIncoming: z.enum(['allow', 'deny']),
    rules: z.array(z.object({
      action: z.enum(['allow', 'deny', 'reject']),
      from: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/, 'adresse IP ou réseau CIDR').optional(),
      port: z.number().int().min(1).max(65535).optional(),
    })).max(30),
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
  z.object({ kind: z.literal('container_running'), name: z.string().min(1).max(100), expected: z.boolean() }),
  z.object({ kind: z.literal('container_autostart'), name: z.string().min(1).max(100), expected: z.boolean() }),
  z.object({ kind: z.literal('http_ok'), url: z.string().min(1).max(300), contains: z.string().max(200).optional() }),
  z.object({ kind: z.literal('file_mode_at_most'), path: absPath, mode: z.string().regex(/^[0-7]{3}$/, 'droits en octal, ex. 640') }),
  z.object({ kind: z.literal('file_readable_by'), path: absPath, user: z.string().regex(/^[a-z_][a-z0-9_-]*$/).max(32), expected: z.boolean() }),
  z.object({ kind: z.literal('firewall_allows'), from: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/, 'adresse IP'), port: z.number().int().min(1).max(65535), expected: z.boolean() }),
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

/** Demande de brouillon de lab à l'IA (agent 11) : l'incident à mettre en scène, en quelques phrases. */
export const GenerateLabDraftSchema = z.object({
  topic: z.string().trim().min(10, 'Décrivez l’incident en une ou deux phrases.').max(1000),
  category: z.enum(LAB_CATEGORIES),
  difficulty: z.enum(DIFFICULTIES).default('beginner'),
});
export type GenerateLabDraftInput = z.infer<typeof GenerateLabDraftSchema>;
export interface LabDraftDto {
  revisionId: string;
  /** Appels au modèle : 1, ou 2 quand une passe de correction a suivi la vérification. */
  attempts: number;
  /** Problèmes encore relevés par les règles de publication (démarche rejouée comprise) : à corriger à la main. */
  remainingIssues: string[];
  remainingToday: number;
}

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

// ---------- Certifications (Phase 5) ----------
export const CERTIFICATE_STATUSES = ['valid', 'expired', 'revoked'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export interface CertificationRequirementDto {
  kind: 'lab' | 'prerequisite';
  /** Identifiant du lab ou code de la certification exigée. */
  ref: string;
  title: string;
  /** Rempli pour l'utilisateur connecté ; null pour un visiteur. */
  met: boolean | null;
}
export interface CertificationDto {
  code: string;
  title: string;
  description: string;
  level: Difficulty;
  validityMonths: number | null;
  priceCents: number;
  exam: {
    questionCount: number;
    timeLimitS: number;
    passScore: number;
    retryAfterHours: number;
    /** false tant que la banque relue n'a pas assez de questions pour tirer un examen. */
    available: boolean;
  };
  /**
   * Paiement de l'examen. required est faux tant que le paiement en ligne est fermé (examen ouvert
   * sans payer) ; amountCents tient compte de la remise de l'offre de la personne connectée.
   */
  payment: { required: boolean; amountCents: number; discountPct: number };
  requirements: CertificationRequirementDto[];
  /** Situation de l'utilisateur connecté ; null pour un visiteur. */
  me: {
    eligible: boolean;
    /** Ce qui empêche de passer l'examen maintenant, en phrases. */
    reasons: string[];
    nextAttemptAt: string | null;
    certificate: { serial: string; status: CertificateStatus } | null;
    openSession: { id: string; deadlineAt: string } | null;
    /** Une tentative payée attend d'être utilisée. */
    paid: boolean;
  } | null;
}
export interface ExamSessionDto {
  id: string;
  certificationCode: string;
  certificationTitle: string;
  startedAt: string;
  deadlineAt: string;
  passScore: number;
  questions: { id: string; type: 'single' | 'multiple'; promptMd: string; choices: { id: string; text: string }[] }[];
}
export const ExamSubmissionSchema = z.object({
  answers: z.record(z.string().uuid(), z.array(z.string().regex(/^[a-f]$/)).max(6)),
  /** Surveillance légère déclarée par le navigateur : conservée, jamais éliminatoire à elle seule. */
  integrity: z.object({
    tabSwitches: z.number().int().min(0).max(10_000).default(0),
    pastes: z.number().int().min(0).max(10_000).default(0),
  }).prefault({}),
});
export type ExamSubmissionInput = z.infer<typeof ExamSubmissionSchema>;
export interface ExamResultDto {
  score: number;
  passed: boolean;
  correctCount: number;
  total: number;
  passScore: number;
  /** Soumis après l'échéance (délai de grâce compris) : les réponses ne sont pas prises en compte. */
  late: boolean;
  certificate: { serial: string } | null;
  nextAttemptAt: string | null;
}
export interface CertificateDto {
  serial: string;
  holderName: string;
  certification: { code: string; title: string; level: Difficulty };
  issuedAt: string;
  expiresAt: string | null;
  status: CertificateStatus;
  revokedAt: string | null;
  revokeReason: string | null;
  /** La signature Ed25519 correspond au contenu (numéro, certification, titulaire, dates). */
  signatureValid: boolean;
}
export const RevokeCertificateSchema = z.object({ reason: z.string().trim().min(5, 'Précisez le motif.').max(500) });
export type RevokeCertificateInput = z.infer<typeof RevokeCertificateSchema>;

// ---------- Communauté (Phase 5) ----------
export const THREAD_KINDS = ['discussion', 'question', 'script_share', 'lab_share'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];
export const VOTE_TARGETS = ['thread', 'post'] as const;
export type VoteTarget = (typeof VOTE_TARGETS)[number];

export interface CommunityCategoryDto {
  slug: string;
  name: string;
  description: string;
  threadCount: number;
}
export interface CommunityAuthorDto {
  displayName: string;
  level: number;
}
/** Contenu masqué par la modération : visible seulement de son auteur et des modérateurs. */
export interface HiddenInfo {
  at: string;
  reason: string | null;
}
export interface ThreadSummaryDto {
  id: string;
  category: { slug: string; name: string };
  kind: ThreadKind;
  title: string;
  excerpt: string;
  tags: string[];
  author: CommunityAuthorDto;
  score: number;
  postCount: number;
  answered: boolean;
  isLocked: boolean;
  hidden: HiddenInfo | null;
  createdAt: string;
  lastActivityAt: string;
  /** Partage de script : langage, risque et relecture. */
  script: { language: ScriptLanguage; riskLevel: RiskLevel; reviewed: boolean } | null;
  /** Partage de lab : le lab concerné. */
  lab: { slug: string; title: string } | null;
}
export interface ThreadListDto {
  items: ThreadSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}
export interface PostDto {
  id: string;
  author: CommunityAuthorDto;
  /** Vide pour un message masqué qu'on n'a pas le droit de lire. */
  bodyMd: string;
  score: number;
  accepted: boolean;
  hidden: HiddenInfo | null;
  createdAt: string;
  editedAt: string | null;
  /** Pour l'utilisateur connecté. */
  myVote: -1 | 0 | 1;
  mine: boolean;
}
export interface ThreadDto extends ThreadSummaryDto {
  bodyMd: string;
  acceptedPostId: string | null;
  posts: PostDto[];
  myVote: -1 | 0 | 1;
  mine: boolean;
  /** Ce que l'utilisateur connecté peut faire ; tout à false pour un visiteur. */
  can: { reply: boolean; accept: boolean; moderate: boolean; reviewScript: boolean };
  replyBlocker: string | null;
  /** Script partagé (P-5) : toujours avec son explication et son niveau de risque. */
  scriptDetail: SharedScriptDto | null;
  /**
   * Partage de lab : tant que l'utilisateur n'a pas résolu le lab, la démarche et les réponses
   * sont retirées (bodyMd vide, posts vides) pour ne rien lui gâcher.
   */
  spoilerLocked: boolean;
}
export const SCRIPT_LANGUAGES = ['bash', 'powershell', 'python', 'sql', 'yaml', 'other'] as const;
export type ScriptLanguage = (typeof SCRIPT_LANGUAGES)[number];
export interface SharedScriptDto {
  language: ScriptLanguage;
  code: string;
  explanation: string;
  /** Niveau retenu : celui de l'auteur, relevé si le code contient une commande plus risquée. */
  riskLevel: RiskLevel;
  /** Motifs dangereux reconnus dans le code, en phrases. */
  warnings: string[];
  reviewed: boolean;
  reviewedAt: string | null;
}
export const SharedScriptSchema = z.object({
  language: z.enum(SCRIPT_LANGUAGES),
  code: z.string().min(1).max(20_000),
  explanation: z.string().trim().min(40, 'Expliquez ce que fait le script, quand l’utiliser et ses limites (40 caractères au moins).').max(5000),
  riskLevel: z.enum(RISK_LEVELS),
});
export type SharedScriptInput = z.infer<typeof SharedScriptSchema>;
export const ThreadListQuerySchema = z.object({
  category: z.string().max(60).optional(),
  kind: z.enum(THREAD_KINDS).optional(),
  tag: z.string().max(40).optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['recent', 'top', 'unanswered']).default('recent'),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type ThreadListQuery = z.infer<typeof ThreadListQuerySchema>;
const BodySchema = z.string().trim().min(20, 'Développez un peu : 20 caractères au moins.').max(20_000);
export const CreateThreadSchema = z.object({
  categorySlug: z.string().min(1).max(60),
  kind: z.enum(THREAD_KINDS).default('question'),
  title: z.string().trim().min(10, 'Un titre de 10 caractères au moins, qui résume le problème.').max(160),
  bodyMd: BodySchema,
  tags: z.array(z.string().max(30)).max(5).default([]),
  /** Obligatoire pour un partage de script. */
  script: SharedScriptSchema.optional(),
  /** Obligatoire pour un partage de lab. */
  labSlug: z.string().max(100).optional(),
}).superRefine((t, ctx) => {
  if (t.kind === 'script_share' && !t.script) ctx.addIssue({ code: 'custom', path: ['script'], message: 'Un partage de script contient le script, son explication et son niveau de risque.' });
  if (t.kind !== 'script_share' && t.script) ctx.addIssue({ code: 'custom', path: ['script'], message: 'Seul un partage de script contient un script.' });
  if (t.kind === 'lab_share' && !t.labSlug) ctx.addIssue({ code: 'custom', path: ['labSlug'], message: 'Choisissez le lab dont vous partagez la démarche.' });
});
export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;
export const EditThreadSchema = z.object({
  title: z.string().trim().min(10, 'Un titre de 10 caractères au moins, qui résume le problème.').max(160),
  bodyMd: BodySchema,
  tags: z.array(z.string().max(30)).max(5).default([]),
  /** Modifier le script le renvoie en relecture. */
  script: SharedScriptSchema.optional(),
});
export type EditThreadInput = z.infer<typeof EditThreadSchema>;
export const PostBodySchema = z.object({ bodyMd: BodySchema });
export type PostBodyInput = z.infer<typeof PostBodySchema>;
export const VoteSchema = z.object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });
export type VoteInput = z.infer<typeof VoteSchema>;
export const AcceptSchema = z.object({ postId: z.string().uuid().nullable() });
export type AcceptInput = z.infer<typeof AcceptSchema>;
export const ScriptReviewSchema = z.object({ reviewed: z.boolean() });
export const ReportSchema = z.object({
  targetType: z.enum(VOTE_TARGETS),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(5, 'Dites en quelques mots ce qui pose problème.').max(500),
});
export type ReportInput = z.infer<typeof ReportSchema>;
export interface SimilarThreadDto {
  id: string;
  title: string;
  answered: boolean;
  postCount: number;
}

// Modération
export interface ModerationItemDto {
  targetType: VoteTarget;
  targetId: string;
  threadId: string;
  threadTitle: string;
  author: string;
  bodyMd: string;
  hidden: HiddenInfo | null;
  reports: { reason: string; reporter: string; createdAt: string }[];
  firstReportedAt: string;
}
export const ModerationDecisionSchema = z.object({
  targetType: z.enum(VOTE_TARGETS),
  targetId: z.string().uuid(),
  /** hide : masque et clôt les signalements ; restore : rend visible et les écarte ; dismiss : écarte sans toucher au contenu. */
  action: z.enum(['hide', 'restore', 'dismiss']),
  note: z.string().trim().max(500).optional(),
});
export type ModerationDecisionInput = z.infer<typeof ModerationDecisionSchema>;
export const LockSchema = z.object({ locked: z.boolean() });

// Groupes d'étude et mentorat
export interface CommunityMessageDto {
  id: string;
  author: CommunityAuthorDto;
  mine: boolean;
  /** Vide si le message a été masqué. */
  bodyMd: string;
  hidden: boolean;
  createdAt: string;
}
export const MessageSchema = z.object({ bodyMd: z.string().trim().min(1, 'Message vide.').max(4000) });
export type MessageInput = z.infer<typeof MessageSchema>;

export interface StudyGroupDto {
  id: string;
  name: string;
  description: string;
  goal: string | null;
  isPublic: boolean;
  memberCount: number;
  maxMembers: number;
  owner: string;
  createdAt: string;
  /** Situation de l'utilisateur connecté ; null pour un visiteur. */
  me: { member: boolean; owner: boolean } | null;
}
export interface StudyGroupMemberDto {
  userId: string;
  displayName: string;
  level: number;
  role: 'owner' | 'member';
  joinedAt: string;
}
export interface StudyGroupDetailDto extends StudyGroupDto {
  /** Visibles des seuls membres. */
  members: StudyGroupMemberDto[];
  /** Pour le responsable d'un groupe privé. */
  inviteCode: string | null;
  joinBlocker: string | null;
}
export const CreateGroupSchema = z.object({
  name: z.string().trim().min(3, 'Un nom de 3 caractères au moins.').max(80),
  description: z.string().trim().max(1000).default(''),
  goal: z.string().trim().max(200).optional(),
  isPublic: z.boolean().default(true),
  maxMembers: z.number().int().min(2).max(50).default(20),
});
export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;
export const JoinByCodeSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[2-9A-Z]{8}$/, 'Code d’invitation invalide.') });

export interface MentorDto {
  userId: string;
  displayName: string;
  level: number;
  bio: string;
  topics: string[];
  accepting: boolean;
  activeMentees: number;
  maxMentees: number;
}
export const MentorProfileSchema = z.object({
  bio: z.string().trim().min(20, 'Présentez-vous en 20 caractères au moins.').max(1000),
  topics: z.array(z.string().trim().min(2).max(40)).min(1, 'Indiquez au moins un sujet.').max(8),
  accepting: z.boolean().default(true),
  maxMentees: z.number().int().min(1).max(10).default(3),
});
export type MentorProfileInput = z.infer<typeof MentorProfileSchema>;
export const MENTORSHIP_STATUSES = ['requested', 'active', 'ended', 'declined'] as const;
export type MentorshipStatusDto = (typeof MENTORSHIP_STATUSES)[number];
export interface MentorshipDto {
  id: string;
  /** Rôle de l'utilisateur connecté dans ce mentorat. */
  role: 'mentor' | 'mentee';
  other: { userId: string; displayName: string; level: number };
  topic: string;
  message: string;
  status: MentorshipStatusDto;
  createdAt: string;
  respondedAt: string | null;
  endedAt: string | null;
}
export const MentorshipRequestSchema = z.object({
  mentorUserId: z.string().uuid(),
  topic: z.string().trim().min(5, 'Précisez le sujet.').max(120),
  message: z.string().trim().min(20, 'Dites en quelques phrases où vous en êtes et ce que vous attendez.').max(1000),
});
export type MentorshipRequestInput = z.infer<typeof MentorshipRequestSchema>;
export const MentorshipActionSchema = z.object({ action: z.enum(['accept', 'decline', 'end']) });

export interface CommunityAnswerAcceptedV1 {
  threadId: string;
  postId: string;
  /** Auteur de la réponse acceptée : c'est lui qui reçoit l'XP d'entraide. */
  userId: string;
  acceptedBy: string;
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

// ---------- RGPD : export et effacement des données ----------

/** Délai pendant lequel une demande d'effacement peut être annulée (la loi impose au plus un mois). */
export const ERASURE_GRACE_DAYS = 7;

/**
 * Durées de conservation, en jours, des données qui n'ont plus d'utilité au-delà ; appliquées
 * chaque heure par l'API. Affichées telles quelles dans la politique de confidentialité.
 */
export const RETENTION_DAYS = {
  /** Conversations avec l'assistant sans nouveau message. */
  assistantConversations: 365,
  /** Sessions de diagnostic (descriptions et journaux collés). */
  diagnosticSessions: 730,
  /** Journal d'audit (publications, révocations…). */
  auditLog: 365,
  /** Notifications lues. */
  readNotifications: 180,
  /** Signaux d'intégrité des examens (changements d'onglet, collages). */
  examIntegrity: 365,
  /** Commandes tapées dans les labs, après la fin du lab. */
  labTranscripts: 365,
} as const;

export interface PrivacyStatusDto {
  /** none : aucune demande ; scheduled : suppression prévue à `dueAt`, annulable jusque-là. */
  erasure: { status: 'none' } | { status: 'scheduled'; requestedAt: string; dueAt: string; cancellable: boolean };
  graceDays: number;
  confirmation: string;
  /** Durées de conservation appliquées automatiquement, en jours. */
  retentionDays: Record<string, number>;
}
export const ErasureRequestSchema = z.object({
  confirmation: z.string().max(40),
});
export type ErasureRequestInput = z.infer<typeof ErasureRequestSchema>;

// --- Paiement (docs/03 §2.11) ---------------------------------------------------

/** Offres qu'une personne peut souscrire seule ; les licences (entreprise, écoles) passent par un devis. */
export const SELF_SERVE_PLANS = ['premium', 'pro'] as const;
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

export interface BillingPlanDto {
  code: string;
  name: string;
  /** null : sur devis. */
  priceCents: number | null;
  currency: string;
  interval: 'month' | 'year' | null;
  perSeat: boolean;
  /** Questions à l'IA par jour ; null : illimité (usage raisonnable). */
  aiQuestionsPerDay: number | null;
  certificationDiscountPct: number;
  features: Record<string, unknown>;
  /** Souscriptible en ligne maintenant (paiement ouvert et prix Stripe configuré). */
  purchasable: boolean;
}

export interface BillingCatalogDto {
  /** Faux tant que les clés Stripe ne sont pas configurées : rien ne peut être payé. */
  enabled: boolean;
  plans: BillingPlanDto[];
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';

export interface BillingInvoiceDto {
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string;
  url: string | null;
}

export interface BillingStatusDto {
  enabled: boolean;
  /** Offre qui s'applique aujourd'hui : free sans abonnement en règle. */
  plan: string;
  subscription: {
    plan: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  /** Un compte de paiement existe : le portail Stripe (carte, factures, résiliation) est accessible. */
  canManage: boolean;
  invoices: BillingInvoiceDto[];
}

export const CheckoutSchema = z.object({ plan: z.enum(SELF_SERVE_PLANS) });
export type CheckoutInput = z.infer<typeof CheckoutSchema>;

export interface RedirectDto {
  url: string;
}
