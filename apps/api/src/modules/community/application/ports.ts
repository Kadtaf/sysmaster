import type {
  CommunityCategoryDto, ModerationItemDto, SimilarThreadDto, ThreadKind, ThreadListQuery, ThreadSummaryDto, VoteTarget,
} from '@sysmaster/contracts';

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
  abstract createThread(t: { categoryId: string; authorId: string; kind: ThreadKind; title: string; bodyMd: string; tags: string[] }): Promise<string>;
  abstract editThread(id: string, t: { title: string; bodyMd: string; tags: string[] }): Promise<void>;
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
