import type {
  CommunityCategoryDto, ModerationItemDto, RiskLevel, ScriptLanguage, SimilarThreadDto, ThreadKind, ThreadListQuery, ThreadSummaryDto, VoteTarget,
} from '@sysmaster/contracts';
import { excerpt } from '../domain/community';

export interface StoredScript {
  language: ScriptLanguage;
  code: string;
  explanation: string;
  riskLevel: RiskLevel;
  reviewed: boolean;
  reviewedAt: Date | null;
}

export interface ThreadRow {
  id: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  authorId: string;
  authorName: string;
  authorLevel: number;
  kind: ThreadKind;
  title: string;
  bodyMd: string;
  tags: string[];
  acceptedPostId: string | null;
  isLocked: boolean;
  score: number;
  postCount: number;
  acceptRewarded: boolean;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  labSlug: string | null;
  labTitle: string | null;
  script: StoredScript | null;
}

/** Résumé d'un sujet. Un partage de lab ne montre jamais sa démarche dans un aperçu. */
export function toSummary(t: ThreadRow): ThreadSummaryDto {
  return {
    id: t.id, category: { slug: t.categorySlug, name: t.categoryName }, kind: t.kind, title: t.title,
    excerpt: t.kind === 'lab_share' ? `Démarche pour le lab « ${t.labTitle ?? t.labSlug} », visible une fois le lab résolu.` : excerpt(t.bodyMd),
    tags: t.tags, author: { displayName: t.authorName, level: t.authorLevel },
    score: t.score, postCount: t.postCount, answered: !!t.acceptedPostId, isLocked: t.isLocked,
    hidden: t.hiddenAt ? { at: t.hiddenAt.toISOString(), reason: t.hiddenReason } : null,
    createdAt: t.createdAt.toISOString(), lastActivityAt: t.lastActivityAt.toISOString(),
    script: t.script ? { language: t.script.language, riskLevel: t.script.riskLevel, reviewed: t.script.reviewed } : null,
    lab: t.labSlug ? { slug: t.labSlug, title: t.labTitle ?? t.labSlug } : null,
  };
}

export interface NewScript {
  language: ScriptLanguage;
  code: string;
  explanation: string;
  riskLevel: RiskLevel;
}

export interface PostRow {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  authorLevel: number;
  bodyMd: string;
  score: number;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  createdAt: Date;
  editedAt: Date | null;
}

/** Contenu visé par un vote ou un signalement. */
export interface Target {
  type: VoteTarget;
  id: string;
  threadId: string;
  authorId: string;
  hidden: boolean;
}

export abstract class CommunityRepository {
  abstract categories(): Promise<CommunityCategoryDto[]>;
  abstract categoryId(slug: string): Promise<string | null>;
  /** `withHiddenOf` : montre aussi les sujets masqués de cet utilisateur ; `allHidden` : tous (modérateurs). */
  abstract listThreads(q: ThreadListQuery, pageSize: number, visibility: { withHiddenOf: string | null; allHidden: boolean }): Promise<{ items: ThreadSummaryDto[]; total: number }>;
  abstract similar(text: string, limit: number): Promise<SimilarThreadDto[]>;
  abstract thread(id: string): Promise<ThreadRow | null>;
  abstract posts(threadId: string): Promise<PostRow[]>;
  abstract post(id: string): Promise<PostRow | null>;
  abstract myVotes(userId: string, targets: { type: VoteTarget; id: string }[]): Promise<Map<string, -1 | 1>>;
  abstract target(type: VoteTarget, id: string): Promise<Target | null>;
  /** Sujets ou messages publiés par l'utilisateur dans la dernière heure. */
  abstract recentCount(userId: string, what: 'thread' | 'post'): Promise<number>;
  abstract createThread(t: {
    categoryId: string; authorId: string; kind: ThreadKind; title: string; bodyMd: string; tags: string[]; labSlug: string | null; script: NewScript | null;
  }): Promise<string>;
  /** `script` : remplace le script ; s'il change, il repart en relecture. */
  abstract editThread(id: string, t: { title: string; bodyMd: string; tags: string[]; script: NewScript | null }): Promise<void>;
  abstract reviewScript(threadId: string, by: string, reviewed: boolean): Promise<void>;
  /** Titre d'un lab publié, ou null. */
  abstract publishedLab(slug: string): Promise<{ slug: string; title: string } | null>;
  abstract hasSolvedLab(userId: string, slug: string): Promise<boolean>;
  abstract createPost(threadId: string, authorId: string, bodyMd: string): Promise<string>;
  abstract editPost(id: string, bodyMd: string): Promise<void>;
  /** Enregistre le vote (0 = retrait) et met le score à jour dans la même transaction ; renvoie le nouveau score. */
  abstract vote(userId: string, target: Target, value: -1 | 0 | 1): Promise<number>;
  /**
   * Change la réponse acceptée. `reward` : émet community.answer.accepted.v1 pour l'auteur de la réponse
   * et marque le sujet comme récompensé, dans la même transaction.
   */
  abstract accept(threadId: string, postId: string | null, reward: { userId: string; acceptedBy: string } | null): Promise<void>;
  abstract lock(threadId: string, locked: boolean): Promise<boolean>;
  /** Signalement (un seul ouvert par personne et par contenu) ; renvoie le nombre de personnes qui l'ont signalé. */
  abstract report(reporterId: string, target: Target, reason: string): Promise<number>;
  abstract setHidden(target: Target, hidden: { by: string; reason: string } | null): Promise<void>;
  abstract moderationQueue(): Promise<ModerationItemDto[]>;
  /** Clôt les signalements ouverts d'un contenu ; renvoie leur nombre. */
  abstract resolveReports(target: Target, by: string, status: 'actioned' | 'dismissed', note: string | null): Promise<number>;
}
