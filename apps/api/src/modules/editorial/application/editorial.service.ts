import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { CommandContent, RevisionDto, RevisionStatus, RevisionSummaryDto } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { hasAnyRole } from '../../iam/domain/identity';
import { assertCan, canCreate, canRead, contentIssues, EditorialError, permissions } from '../domain/editorial';
import { EditorialRepository, OpenRevisionExistsError, RevisionRecord, SlugTakenError } from './ports';

export const blankContent = (): CommandContent => ({
  slug: '', name: '', platform: 'linux', shell: null, summary: '', history: null, internals: null, syntax: '',
  why: '', whenToUse: '', context: null, riskLevel: 'none', risks: [], difficulty: 'beginner', requiresAdmin: false,
  bestPractices: [], commonErrors: [], parameters: [], examples: [], alternatives: [], sources: [],
});

/**
 * Cas d'utilisation du back-office éditorial. Les règles (qui peut quoi, quand une fiche est
 * publiable) sont dans le domaine ; ce service orchestre et traduit les refus en réponses HTTP.
 */
@Injectable()
export class EditorialService {
  constructor(private readonly repo: EditorialRepository) {}

  async list(user: AuthenticatedUser, status?: RevisionStatus): Promise<RevisionSummaryDto[]> {
    // Un relecteur voit tout ; un auteur ne voit que ses propres révisions.
    const reviewer = hasAnyRole(user, ['reviewer', 'admin']);
    if (!reviewer && !canCreate(user)) throw new ForbiddenException('Réservé aux auteurs, relecteurs et administrateurs.');
    return this.repo.list({ status, authorId: reviewer ? undefined : user.id });
  }

  async get(id: string, user: AuthenticatedUser): Promise<RevisionDto> {
    const r = await this.load(id, user);
    return this.toDto(r, user);
  }

  async create(user: AuthenticatedUser, fromSlug?: string): Promise<RevisionDto> {
    if (!canCreate(user)) throw new ForbiddenException('Seuls les auteurs et les administrateurs rédigent des fiches.');
    let commandId: string | null = null;
    let content = blankContent();
    if (fromSlug) {
      const existing = await this.repo.publishedContent(fromSlug);
      if (!existing) throw new NotFoundException(`Aucune fiche publiée « ${fromSlug} ».`);
      ({ commandId, content } = existing);
    }
    try {
      const id = await this.repo.create(user.id, commandId, content);
      return this.get(id, user);
    } catch (err) {
      if (err instanceof OpenRevisionExistsError) {
        throw new ConflictException('Une révision de cette fiche est déjà en cours : terminez-la ou retirez-la d’abord.');
      }
      throw err;
    }
  }

  async save(id: string, user: AuthenticatedUser, content: CommandContent): Promise<RevisionDto> {
    const r = await this.load(id, user);
    this.guard(() => assertCan(permissions(r, user).edit, r, user, 'edit'));
    if (r.commandId && content.slug !== r.content.slug) {
      throw new BadRequestException('L’identifiant d’URL d’une fiche publiée ne change pas : les liens existants casseraient.');
    }
    await this.repo.saveContent(id, content);
    return this.get(id, user);
  }

  async submit(id: string, user: AuthenticatedUser): Promise<RevisionDto> {
    const r = await this.load(id, user);
    this.guard(() => assertCan(permissions(r, user).submit, r, user, 'submit'));
    const issues = contentIssues(r.content, await this.repo.publishedSlugs());
    if (issues.length) {
      throw new UnprocessableEntityException({ message: 'La fiche n’est pas encore complète.', issues });
    }
    await this.repo.transition(id, 'in_review', user.id, 'submitted', null);
    return this.get(id, user);
  }

  async review(id: string, user: AuthenticatedUser, decision: 'approve' | 'request_changes', comment: string): Promise<RevisionDto> {
    const r = await this.load(id, user);
    this.guard(() => assertCan(permissions(r, user).review, r, user, 'review'));
    if (decision === 'request_changes') {
      await this.repo.transition(id, 'changes_requested', user.id, 'changes_requested', comment);
    } else {
      // Revérifié au moment de publier : une alternative a pu être retirée entre-temps.
      const issues = contentIssues(r.content, await this.repo.publishedSlugs());
      if (issues.length) throw new UnprocessableEntityException({ message: 'La fiche n’est plus publiable en l’état.', issues });
      try {
        await this.repo.publish(r, user.id, comment || null);
      } catch (err) {
        if (err instanceof SlugTakenError) throw new ConflictException(`L’identifiant « ${r.content.slug} » est déjà utilisé par une autre fiche.`);
        throw err;
      }
    }
    return this.get(id, user);
  }

  async withdraw(id: string, user: AuthenticatedUser): Promise<RevisionDto> {
    const r = await this.load(id, user);
    this.guard(() => assertCan(permissions(r, user).withdraw, r, user, 'withdraw'));
    await this.repo.transition(id, 'withdrawn', user.id, 'withdrawn', null);
    return this.get(id, user);
  }

  private async load(id: string, user: AuthenticatedUser): Promise<RevisionRecord> {
    const r = /^[0-9a-f-]{36}$/i.test(id) ? await this.repo.find(id) : null;
    // 404 aussi quand on n'a pas le droit de lire : on ne révèle pas l'existence d'un brouillon.
    if (!r || !canRead(r, user)) throw new NotFoundException('Révision introuvable.');
    return r;
  }

  private guard(fn: () => void) {
    try {
      fn();
    } catch (err) {
      if (err instanceof EditorialError) {
        if (err.code === 'invalid_state') throw new ConflictException(err.message);
        throw new ForbiddenException(err.message);
      }
      throw err;
    }
  }

  private async toDto(r: RevisionRecord, user: AuthenticatedUser): Promise<RevisionDto> {
    return {
      id: r.id,
      commandSlug: r.content.slug,
      name: r.content.name,
      isNew: r.isNew,
      status: r.status,
      author: r.authorName,
      updatedAt: r.updatedAt,
      content: r.content,
      issues: contentIssues(r.content, await this.repo.publishedSlugs()),
      reviewer: r.reviewerName,
      reviewComment: r.reviewComment,
      can: permissions(r, user),
      history: r.history,
    };
  }
}
