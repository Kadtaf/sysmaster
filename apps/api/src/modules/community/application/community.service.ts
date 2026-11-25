import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AcceptInput, CommunityCategoryDto, CreateThreadInput, EditThreadInput, ModerationDecisionInput, ModerationItemDto,
  PostDto, ReportInput, SimilarThreadDto, ThreadDto, ThreadListDto, ThreadListQuery, VoteTarget,
} from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import {
  autoHides, canAccept, canSee, excerpt, canVote, isModerator, MAX_POSTS_PER_HOUR, MAX_THREADS_PER_HOUR, normalizeTags, replyBlocker,
  rewardsAcceptance, type ThreadFacts,
} from '../domain/community';
import { CommunityRepository, PostRow, Target, ThreadRow } from './ports';

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const facts = (t: ThreadRow): ThreadFacts => ({
  authorId: t.authorId, kind: t.kind, isLocked: t.isLocked, hidden: !!t.hiddenAt, acceptRewarded: t.acceptRewarded,
});
const hiddenInfo = (at: Date | null, reason: string | null) => (at ? { at: at.toISOString(), reason } : null);

/**
 * Communauté (docs/03 §2.9) : forum par catégorie, questions-réponses avec réponse acceptée,
 * votes, signalements et modération. Le Markdown des membres est rendu sans HTML brut côté web.
 */
@Injectable()
export class CommunityService {
  constructor(private readonly repo: CommunityRepository) {}

  categories(): Promise<CommunityCategoryDto[]> {
    return this.repo.categories();
  }

  async list(q: ThreadListQuery, user: AuthenticatedUser | null): Promise<ThreadListDto> {
    const { items, total } = await this.repo.listThreads(q, PAGE_SIZE, { withHiddenOf: user?.id ?? null, allHidden: isModerator(user) });
    return { items, total, page: q.page, pageSize: PAGE_SIZE };
  }

  /** Questions proches, à lire avant d'en publier une nouvelle. */
  similar(text: string): Promise<SimilarThreadDto[]> {
    return text.trim().length < 8 ? Promise.resolve([]) : this.repo.similar(text, 5);
  }

  async get(id: string, user: AuthenticatedUser | null): Promise<ThreadDto> {
    const t = await this.visibleThread(id, user);
    const posts = await this.repo.posts(t.id);
    const votes = user
      ? await this.repo.myVotes(user.id, [{ type: 'thread', id: t.id }, ...posts.map((p) => ({ type: 'post' as VoteTarget, id: p.id }))])
      : new Map<string, -1 | 1>();
    const f = facts(t);
    const blocker = replyBlocker(f);
    return {
      ...this.summary(t),
      bodyMd: t.bodyMd,
      acceptedPostId: t.acceptedPostId,
      posts: posts.map((p) => this.postDto(p, t, user, votes)),
      myVote: votes.get(`thread:${t.id}`) ?? 0,
      mine: user?.id === t.authorId,
      can: {
        reply: !!user && (blocker === null || (isModerator(user) && !f.hidden)),
        accept: canAccept(f, user),
        moderate: isModerator(user),
      },
      replyBlocker: blocker,
    };
  }

  async create(user: AuthenticatedUser, input: CreateThreadInput): Promise<{ id: string }> {
    const categoryId = await this.repo.categoryId(input.categorySlug);
    if (!categoryId) throw new BadRequestException({ message: 'Données invalides', issues: [{ field: 'categorySlug', message: 'Catégorie inconnue.' }] });
    if ((await this.repo.recentCount(user.id, 'thread')) >= MAX_THREADS_PER_HOUR) {
      throw new HttpException('Vous avez publié beaucoup de sujets en une heure : réessayez un peu plus tard.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const id = await this.repo.createThread({
      categoryId, authorId: user.id, kind: input.kind, title: input.title, bodyMd: input.bodyMd, tags: normalizeTags(input.tags),
    });
    return { id };
  }

  async edit(user: AuthenticatedUser, id: string, input: EditThreadInput): Promise<ThreadDto> {
    const t = await this.visibleThread(id, user);
    if (t.authorId !== user.id && !isModerator(user)) throw new ForbiddenException('Seul l’auteur peut modifier ce sujet.');
    await this.repo.editThread(t.id, { title: input.title, bodyMd: input.bodyMd, tags: normalizeTags(input.tags) });
    return this.get(t.id, user);
  }

  async reply(user: AuthenticatedUser, threadId: string, bodyMd: string): Promise<ThreadDto> {
    const t = await this.visibleThread(threadId, user);
    const blocker = replyBlocker(facts(t));
    // Un modérateur peut encore conclure un sujet verrouillé (ex. : expliquer pourquoi).
    if (blocker && !(isModerator(user) && !t.hiddenAt)) throw new ForbiddenException(blocker);
    if ((await this.repo.recentCount(user.id, 'post')) >= MAX_POSTS_PER_HOUR) {
      throw new HttpException('Vous avez beaucoup répondu en une heure : réessayez un peu plus tard.', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.repo.createPost(t.id, user.id, bodyMd);
    return this.get(t.id, user);
  }

  async editPost(user: AuthenticatedUser, postId: string, bodyMd: string): Promise<ThreadDto> {
    const p = UUID.test(postId) ? await this.repo.post(postId) : null;
    if (!p || !canSee(!!p.hiddenAt, p.authorId, user)) throw new NotFoundException('Message introuvable');
    if (p.authorId !== user.id) throw new ForbiddenException('Seul l’auteur peut modifier ce message.');
    await this.repo.editPost(p.id, bodyMd);
    return this.get(p.threadId, user);
  }

  async vote(user: AuthenticatedUser, type: VoteTarget, id: string, value: -1 | 0 | 1): Promise<{ score: number; myVote: -1 | 0 | 1 }> {
    const target = await this.visibleTarget(type, id, user);
    if (!canVote(target.authorId, user)) throw new ForbiddenException('On ne vote pas pour ses propres messages.');
    if (target.hidden) throw new ForbiddenException('Ce contenu est masqué par la modération.');
    return { score: await this.repo.vote(user.id, target, value), myVote: value };
  }

  async accept(user: AuthenticatedUser, threadId: string, input: AcceptInput): Promise<ThreadDto> {
    const t = await this.visibleThread(threadId, user);
    const f = facts(t);
    if (!canAccept(f, user)) throw new ForbiddenException('Seul l’auteur de la question choisit la réponse acceptée.');
    let reward: { userId: string; acceptedBy: string } | null = null;
    if (input.postId) {
      const p = await this.repo.post(input.postId);
      if (!p || p.threadId !== t.id || p.hiddenAt) throw new BadRequestException('Cette réponse n’appartient pas au sujet ou est masquée.');
      if (rewardsAcceptance(f, p.authorId)) reward = { userId: p.authorId, acceptedBy: user.id };
    }
    await this.repo.accept(t.id, input.postId, reward);
    return this.get(t.id, user);
  }

  async report(user: AuthenticatedUser, input: ReportInput): Promise<{ reported: true }> {
    const target = await this.visibleTarget(input.targetType, input.targetId, user);
    if (target.authorId === user.id) throw new BadRequestException('Vous ne pouvez pas signaler votre propre message.');
    const reporters = await this.repo.report(user.id, target, input.reason);
    if (!target.hidden && autoHides(reporters)) {
      await this.repo.setHidden(target, { by: user.id, reason: 'Masqué automatiquement après plusieurs signalements, en attente d’un modérateur.' });
    }
    return { reported: true };
  }

  // ---------- Modération ----------

  moderationQueue(): Promise<ModerationItemDto[]> {
    return this.repo.moderationQueue();
  }

  async decide(moderator: AuthenticatedUser, input: ModerationDecisionInput): Promise<{ resolved: number }> {
    const target = await this.repo.target(input.targetType, input.targetId);
    if (!target) throw new NotFoundException('Contenu introuvable');
    const note = input.note ?? null;
    if (input.action === 'hide') {
      await this.repo.setHidden(target, { by: moderator.id, reason: note ?? 'Masqué par la modération.' });
      return { resolved: await this.repo.resolveReports(target, moderator.id, 'actioned', note) };
    }
    if (input.action === 'restore') await this.repo.setHidden(target, null);
    return { resolved: await this.repo.resolveReports(target, moderator.id, 'dismissed', note) };
  }

  async lock(threadId: string, locked: boolean): Promise<{ locked: boolean }> {
    if (!UUID.test(threadId) || !(await this.repo.lock(threadId, locked))) throw new NotFoundException('Sujet introuvable');
    return { locked };
  }

  // ---------- Interne ----------

  private async visibleThread(id: string, user: AuthenticatedUser | null): Promise<ThreadRow> {
    const t = UUID.test(id) ? await this.repo.thread(id) : null;
    if (!t || !canSee(!!t.hiddenAt, t.authorId, user)) throw new NotFoundException('Sujet introuvable');
    return t;
  }

  private async visibleTarget(type: VoteTarget, id: string, user: AuthenticatedUser): Promise<Target> {
    const target = UUID.test(id) ? await this.repo.target(type, id) : null;
    if (!target || !canSee(target.hidden, target.authorId, user)) throw new NotFoundException('Contenu introuvable');
    if (type === 'post') await this.visibleThread(target.threadId, user);
    return target;
  }

  private summary(t: ThreadRow) {
    return {
      id: t.id, category: { slug: t.categorySlug, name: t.categoryName }, kind: t.kind, title: t.title,
      excerpt: excerpt(t.bodyMd), tags: t.tags, author: { displayName: t.authorName, level: t.authorLevel },
      score: t.score, postCount: t.postCount, answered: !!t.acceptedPostId, isLocked: t.isLocked,
      hidden: hiddenInfo(t.hiddenAt, t.hiddenReason), createdAt: t.createdAt.toISOString(), lastActivityAt: t.lastActivityAt.toISOString(),
    };
  }

  private postDto(p: PostRow, t: ThreadRow, user: AuthenticatedUser | null, votes: Map<string, -1 | 1>): PostDto {
    const readable = canSee(!!p.hiddenAt, p.authorId, user);
    return {
      id: p.id, author: { displayName: p.authorName, level: p.authorLevel }, bodyMd: readable ? p.bodyMd : '',
      score: p.score, accepted: t.acceptedPostId === p.id, hidden: hiddenInfo(p.hiddenAt, readable ? p.hiddenReason : null),
      createdAt: p.createdAt.toISOString(), editedAt: p.editedAt?.toISOString() ?? null,
      myVote: votes.get(`post:${p.id}`) ?? 0, mine: user?.id === p.authorId,
    };
  }
}
