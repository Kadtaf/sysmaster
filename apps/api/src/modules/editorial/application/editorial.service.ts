import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import type { ContentKind, RevisionDto, RevisionStatus, RevisionSummaryDto, SimulationDto } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { hasAnyRole } from '../../iam/domain/identity';
import { assertCan, canCreate, canRead, EditorialError, permissions } from '../domain/workflow';
import {
  CONTENT_KIND_ADAPTERS, ContentKindAdapter, KeyTakenError, OpenRevisionExistsError, RevisionRecord, RevisionRepository, Schema,
} from './ports';

export function parse<T>(schema: Schema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Données invalides',
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  return parsed.data;
}

/**
 * Cas d'utilisation du back-office éditorial, communs à tous les types de contenu. Les règles
 * (qui peut quoi, quand un contenu est publiable) sont dans le domaine et dans les adaptateurs ;
 * ce service orchestre et traduit les refus en réponses HTTP.
 */
@Injectable()
export class EditorialService {
  private readonly kinds: Map<ContentKind, ContentKindAdapter>;

  constructor(
    private readonly repo: RevisionRepository,
    @Inject(CONTENT_KIND_ADAPTERS) adapters: ContentKindAdapter[],
  ) {
    this.kinds = new Map(adapters.map((a) => [a.kind, a]));
  }

  async list(user: AuthenticatedUser, filter: { status?: RevisionStatus; kind?: ContentKind }): Promise<RevisionSummaryDto[]> {
    // Un relecteur voit tout ; un auteur ne voit que ses propres révisions.
    const reviewer = hasAnyRole(user, ['reviewer', 'admin']);
    if (!reviewer && !canCreate(user)) throw new ForbiddenException('Réservé aux auteurs, relecteurs et administrateurs.');
    return this.repo.list({ ...filter, authorId: reviewer ? undefined : user.id });
  }

  async get(id: string, user: AuthenticatedUser): Promise<RevisionDto> {
    return this.toDto(await this.load(id, user), user);
  }

  async create(user: AuthenticatedUser, kind: ContentKind, from?: string): Promise<RevisionDto> {
    if (!canCreate(user)) throw new ForbiddenException('Seuls les auteurs et les administrateurs rédigent des contenus.');
    const adapter = this.adapter(kind);
    if (!this.allowed(adapter, user)) throw new ForbiddenException(`Réservé aux rôles : ${adapter.restrictedTo!.join(', ')}.`);
    let targetId: string | null = null;
    let content = adapter.blank();
    if (from) {
      const existing = await adapter.published(from);
      if (!existing) throw new NotFoundException(`Aucun(e) ${adapter.noun} publié(e) « ${from} ».`);
      ({ targetId, content } = existing);
    }
    try {
      const id = await this.repo.create(kind, user.id, targetId, content);
      return this.get(id, user);
    } catch (err) {
      if (err instanceof OpenRevisionExistsError) {
        throw new ConflictException(`Une révision de ce contenu est déjà en cours : terminez-la ou retirez-la d’abord.`);
      }
      throw err;
    }
  }

  async save(id: string, user: AuthenticatedUser, body: unknown): Promise<RevisionDto> {
    const r = await this.load(id, user);
    this.restrict(r, user);
    this.guard(() => assertCan(this.perms(r, user).edit, r, user, 'edit'));
    const adapter = this.adapter(r.kind);
    const content = parse(adapter.schema, body);
    if (r.targetId && adapter.key(content) !== adapter.key(r.content)) {
      throw new BadRequestException('L’identifiant d’un contenu publié ne change pas : les liens et l’historique existants casseraient.');
    }
    await this.repo.saveContent(id, content);
    return this.get(id, user);
  }

  async submit(id: string, user: AuthenticatedUser): Promise<RevisionDto> {
    const r = await this.load(id, user);
    this.restrict(r, user);
    this.guard(() => assertCan(this.perms(r, user).submit, r, user, 'submit'));
    const issues = await this.adapter(r.kind).issues(r.content, r.targetId);
    if (issues.length) throw new UnprocessableEntityException({ message: 'Le contenu n’est pas encore publiable.', issues });
    await this.repo.transition(id, 'in_review', user.id, 'submitted', null);
    return this.get(id, user);
  }

  async simulate(id: string, user: AuthenticatedUser): Promise<SimulationDto> {
    const r = await this.load(id, user);
    const adapter = this.adapter(r.kind);
    if (!adapter.simulate) throw new NotFoundException('Pas de simulation pour ce type de contenu.');
    return adapter.simulate(r.content);
  }

  async review(id: string, user: AuthenticatedUser, decision: 'approve' | 'request_changes', comment: string): Promise<RevisionDto> {
    const r = await this.load(id, user);
    this.restrict(r, user);
    this.guard(() => assertCan(this.perms(r, user).review, r, user, 'review'));
    if (decision === 'request_changes') {
      await this.repo.transition(id, 'changes_requested', user.id, 'changes_requested', comment);
      return this.get(id, user);
    }
    const adapter = this.adapter(r.kind);
    // Revérifié au moment de publier : une dépendance (fiche, cours, symptôme) a pu changer entre-temps.
    const issues = await adapter.issues(r.content, r.targetId);
    if (issues.length) throw new UnprocessableEntityException({ message: 'Le contenu n’est plus publiable en l’état.', issues });
    if (adapter.simulate && !comment) {
      const sim = await adapter.simulate(r.content);
      if (sim.regressions > 0) {
        throw new UnprocessableEntityException({
          message: `Cette modification fait perdre la première place à la bonne cause dans ${sim.regressions} cas de référence. Approuver reste possible, mais expliquez pourquoi dans le commentaire.`,
          issues: sim.cases.filter((c) => c.regression).map((c) => ({ field: 'simulation', message: c.name })),
        });
      }
    }
    try {
      await this.repo.publish(r, user.id, comment || null, adapter);
    } catch (err) {
      if (err instanceof KeyTakenError) throw new ConflictException(`« ${adapter.key(r.content)} » est déjà utilisé par un autre contenu.`);
      throw err;
    }
    return this.get(id, user);
  }

  async withdraw(id: string, user: AuthenticatedUser): Promise<RevisionDto> {
    const r = await this.load(id, user);
    this.guard(() => assertCan(this.perms(r, user).withdraw, r, user, 'withdraw'));
    await this.repo.transition(id, 'withdrawn', user.id, 'withdrawn', null);
    return this.get(id, user);
  }

  private allowed(adapter: ContentKindAdapter, user: AuthenticatedUser): boolean {
    return !adapter.restrictedTo || hasAnyRole(user, adapter.restrictedTo);
  }

  private restrict(r: RevisionRecord, user: AuthenticatedUser): void {
    const adapter = this.adapter(r.kind);
    if (!this.allowed(adapter, user)) throw new ForbiddenException(`Réservé aux rôles : ${adapter.restrictedTo!.join(', ')}.`);
  }

  /** Droits du workflow, restreints pour les types réservés (seul le retrait reste possible). */
  private perms(r: RevisionRecord, user: AuthenticatedUser) {
    const p = permissions(r, user);
    if (this.allowed(this.adapter(r.kind), user)) return p;
    return { edit: false, submit: false, review: false, withdraw: p.withdraw };
  }

  private adapter(kind: ContentKind): ContentKindAdapter {
    const a = this.kinds.get(kind);
    if (!a) throw new BadRequestException(`Type de contenu inconnu : ${kind}`);
    return a;
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
    const adapter = this.adapter(r.kind);
    return {
      id: r.id,
      kind: r.kind,
      key: adapter.key(r.content),
      title: adapter.title(r.content),
      isNew: r.isNew,
      status: r.status,
      author: r.authorName,
      updatedAt: r.updatedAt,
      content: r.content,
      issues: await adapter.issues(r.content, r.targetId),
      reviewer: r.reviewerName,
      reviewComment: r.reviewComment,
      can: this.perms(r, user),
      history: r.history,
    } as RevisionDto;
  }
}
