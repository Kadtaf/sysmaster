import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CommunityMessageDto, CreateGroupInput, MentorDto, MentorProfileInput, MentorshipDto, MentorshipRequestInput, StudyGroupDetailDto, StudyGroupDto,
} from '@sysmaster/contracts';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { isModerator } from '../domain/community';
import {
  canMentor, inviteCode, joinBlocker, MAX_MESSAGES_PER_HOUR, MAX_OWNED_GROUPS, mentorshipAccess, MentorshipAction, nextOwner, requestBlocker, transition,
} from '../domain/social';
import { Channel, GroupRow, MentorshipRow, SocialRepository } from './social-ports';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_PAGE = 200;

/**
 * Groupes d'étude et mentorat (docs/03 §2.9). Les échanges d'un groupe ou d'un binôme ne sont lus
 * que par ses membres : un non-membre reçoit 404, comme si l'espace n'existait pas.
 */
@Injectable()
export class SocialService {
  constructor(private readonly repo: SocialRepository) {}

  // ---------- Groupes ----------

  async groups(user: AuthenticatedUser | null): Promise<StudyGroupDto[]> {
    return (await this.repo.groups(user?.id ?? null)).map(({ memberOf, ownerOf, ...g }) => ({ ...g, me: user ? { member: memberOf, owner: ownerOf } : null }));
  }

  async group(id: string, user: AuthenticatedUser | null): Promise<StudyGroupDetailDto> {
    const g = await this.findGroup(id);
    const members = await this.repo.members(g.id);
    const me = user ? members.find((m) => m.userId === user.id) : undefined;
    if (!g.isPublic && !me && !isModerator(user)) throw new NotFoundException('Groupe introuvable');
    return {
      ...this.groupDto(g, user ? { member: !!me, owner: me?.role === 'owner' } : null),
      members: me || isModerator(user) ? members : [],
      inviteCode: me?.role === 'owner' ? g.inviteCode : null,
      joinBlocker: user ? joinBlocker({ isPublic: g.isPublic, memberCount: g.memberCount, maxMembers: g.maxMembers, isMember: !!me }, false) : null,
    };
  }

  async createGroup(user: AuthenticatedUser, input: CreateGroupInput): Promise<{ id: string }> {
    if ((await this.repo.ownedGroups(user.id)) >= MAX_OWNED_GROUPS) {
      throw new ConflictException(`Vous animez déjà ${MAX_OWNED_GROUPS} groupes : confiez-en un ou fermez-le avant d’en créer un autre.`);
    }
    const id = await this.repo.createGroup(user.id, {
      name: input.name, description: input.description, goal: input.goal || null, isPublic: input.isPublic, maxMembers: input.maxMembers,
      inviteCode: input.isPublic ? null : inviteCode(randomBytes(8)),
    });
    return { id };
  }

  async join(user: AuthenticatedUser, id: string): Promise<StudyGroupDetailDto> {
    const g = await this.findGroup(id);
    if (!g.isPublic) throw new NotFoundException('Groupe introuvable');
    return this.doJoin(user, g, false);
  }

  async joinByCode(user: AuthenticatedUser, code: string): Promise<StudyGroupDetailDto> {
    const g = await this.repo.groupByCode(code);
    if (!g) throw new NotFoundException('Aucun groupe ne correspond à ce code.');
    return this.doJoin(user, g, true);
  }

  async leave(user: AuthenticatedUser, id: string): Promise<{ closed: boolean }> {
    const g = await this.findGroup(id);
    const members = await this.repo.members(g.id);
    const me = members.find((m) => m.userId === user.id);
    if (!me) throw new NotFoundException('Vous ne faites pas partie de ce groupe.');
    const heir = me.role === 'owner' ? nextOwner(members.map((m) => ({ ...m, joinedAt: new Date(m.joinedAt) })), user.id) : null;
    await this.repo.leave(g.id, user.id, heir);
    return { closed: me.role === 'owner' && heir === null };
  }

  // ---------- Mentorat ----------

  mentors(topic: string | null): Promise<MentorDto[]> {
    return this.repo.mentors(topic?.trim().toLowerCase() || null);
  }

  async saveMentorProfile(user: AuthenticatedUser, input: MentorProfileInput): Promise<MentorDto> {
    if (!canMentor(user)) throw new ForbiddenException('Le profil de mentor est réservé aux personnes qui ont le rôle « mentor ».');
    const topics = [...new Set(input.topics.map((t) => t.trim().toLowerCase()))];
    await this.repo.saveMentorProfile(user.id, { ...input, topics });
    return (await this.repo.mentor(user.id))!;
  }

  async requestMentorship(user: AuthenticatedUser, input: MentorshipRequestInput): Promise<MentorshipDto> {
    const [mentor, openRequests, alreadyOpen] = await Promise.all([
      this.repo.mentor(input.mentorUserId),
      this.repo.openRequests(user.id),
      this.repo.hasOpen(input.mentorUserId, user.id),
    ]);
    const blocker = requestBlocker({ self: input.mentorUserId === user.id, mentor, openRequests, alreadyOpen });
    if (blocker) throw new ConflictException(blocker);
    const id = await this.repo.requestMentorship(input.mentorUserId, user.id, input.topic, input.message);
    if (!id) throw new ConflictException('Une demande ou un mentorat est déjà en cours avec cette personne.');
    return this.mentorshipDto((await this.repo.mentorship(id))!, user.id);
  }

  async mentorships(user: AuthenticatedUser): Promise<{ mentor: MentorDto | null; items: MentorshipDto[] }> {
    const [mentor, rows] = await Promise.all([this.repo.mentor(user.id), this.repo.mentorships(user.id)]);
    return { mentor, items: rows.map((r) => this.mentorshipDto(r, user.id)) };
  }

  async act(user: AuthenticatedUser, id: string, action: MentorshipAction): Promise<MentorshipDto> {
    const m = await this.findMentorship(id, user);
    const actor = m.mentorId === user.id ? 'mentor' : 'mentee';
    const profile = await this.repo.mentor(m.mentorId);
    const t = transition(m.status, action, actor, { activeMentees: profile?.activeMentees ?? 0, maxMentees: profile?.maxMentees ?? 0 });
    if ('error' in t) throw new ConflictException(t.error);
    if (!(await this.repo.setMentorshipStatus(m.id, m.status, t.next))) throw new ConflictException('Ce mentorat vient de changer : rechargez la page.');
    return this.mentorshipDto((await this.repo.mentorship(m.id))!, user.id);
  }

  // ---------- Messages ----------

  async messages(user: AuthenticatedUser, channel: Channel, id: string): Promise<{ items: CommunityMessageDto[]; canWrite: boolean }> {
    const canWrite = await this.access(user, channel, id);
    const rows = await this.repo.messages(channel, id, MESSAGE_PAGE);
    return {
      canWrite,
      items: rows.map((r) => ({
        id: r.id, author: r.author, mine: r.authorId === user.id, bodyMd: r.hiddenAt ? '' : r.bodyMd, hidden: !!r.hiddenAt, createdAt: r.createdAt,
      })),
    };
  }

  async post(user: AuthenticatedUser, channel: Channel, id: string, bodyMd: string) {
    if (!(await this.access(user, channel, id))) throw new ForbiddenException('Ce mentorat n’est plus actif : les messages restent lisibles, mais on ne peut plus écrire.');
    if ((await this.repo.recentMessages(user.id)) >= MAX_MESSAGES_PER_HOUR) {
      throw new HttpException('Beaucoup de messages en une heure : réessayez un peu plus tard.', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.repo.postMessage(channel, id, user.id, bodyMd);
    return this.messages(user, channel, id);
  }

  /** Masquer : l'auteur, le responsable du groupe ou un modérateur. */
  async hide(user: AuthenticatedUser, messageId: string): Promise<{ hidden: true }> {
    const msg = UUID.test(messageId) ? await this.repo.message(messageId) : null;
    if (!msg) throw new NotFoundException('Message introuvable');
    await this.access(user, msg.channel, msg.channelId);
    let allowed = msg.authorId === user.id || isModerator(user);
    if (!allowed && msg.channel === 'group') allowed = (await this.repo.members(msg.channelId)).some((m) => m.userId === user.id && m.role === 'owner');
    if (!allowed) throw new ForbiddenException('Seuls l’auteur, le responsable du groupe ou un modérateur peuvent masquer ce message.');
    await this.repo.hideMessage(msg.id, user.id);
    return { hidden: true };
  }

  // ---------- Interne ----------

  /** Vérifie la lecture (404 sinon) et renvoie le droit d'écrire. */
  private async access(user: AuthenticatedUser, channel: Channel, id: string): Promise<boolean> {
    if (channel === 'group') {
      const g = await this.findGroup(id);
      const member = (await this.repo.members(g.id)).some((m) => m.userId === user.id);
      if (!member) throw new NotFoundException('Groupe introuvable');
      return true;
    }
    const m = await this.findMentorship(id, user);
    const a = mentorshipAccess(m.status);
    if (!a.read) throw new NotFoundException('Mentorat introuvable');
    return a.write;
  }

  private async doJoin(user: AuthenticatedUser, g: GroupRow, withCode: boolean): Promise<StudyGroupDetailDto> {
    const isMember = (await this.repo.members(g.id)).some((m) => m.userId === user.id);
    const blocker = joinBlocker({ isPublic: g.isPublic, memberCount: g.memberCount, maxMembers: g.maxMembers, isMember }, withCode);
    if (blocker) throw new ConflictException(blocker);
    if (!(await this.repo.join(g.id, user.id))) throw new ConflictException('Ce groupe est complet.');
    return this.group(g.id, user);
  }

  private async findGroup(id: string): Promise<GroupRow> {
    const g = UUID.test(id) ? await this.repo.group(id) : null;
    if (!g) throw new NotFoundException('Groupe introuvable');
    return g;
  }

  /** Un mentorat n'existe que pour ses deux participants. */
  private async findMentorship(id: string, user: AuthenticatedUser): Promise<MentorshipRow> {
    const m = UUID.test(id) ? await this.repo.mentorship(id) : null;
    if (!m || (m.mentorId !== user.id && m.menteeId !== user.id)) throw new NotFoundException('Mentorat introuvable');
    return m;
  }

  private groupDto(g: GroupRow, me: StudyGroupDto['me']): StudyGroupDto {
    return {
      id: g.id, name: g.name, description: g.description, goal: g.goal, isPublic: g.isPublic, memberCount: g.memberCount,
      maxMembers: g.maxMembers, owner: g.ownerName, createdAt: g.createdAt.toISOString(), me,
    };
  }

  private mentorshipDto(m: MentorshipRow, userId: string): MentorshipDto {
    const role = m.mentorId === userId ? 'mentor' : 'mentee';
    if (role === 'mentee' && m.menteeId !== userId) throw new BadRequestException();
    return {
      id: m.id, role,
      other: role === 'mentor'
        ? { userId: m.menteeId, displayName: m.menteeName, level: m.menteeLevel }
        : { userId: m.mentorId, displayName: m.mentorName, level: m.mentorLevel },
      topic: m.topic, message: m.message, status: m.status, createdAt: m.createdAt.toISOString(),
      respondedAt: m.respondedAt?.toISOString() ?? null, endedAt: m.endedAt?.toISOString() ?? null,
    };
  }
}
