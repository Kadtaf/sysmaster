import type { CommunityMessageDto, MentorDto, MentorProfileInput, StudyGroupDto, StudyGroupMemberDto } from '@sysmaster/contracts';
import type { MentorshipStatus } from '../domain/social';

export type Channel = 'group' | 'mentorship';

export interface GroupRow {
  id: string;
  name: string;
  description: string;
  goal: string | null;
  isPublic: boolean;
  inviteCode: string | null;
  memberCount: number;
  maxMembers: number;
  ownerName: string;
  createdAt: Date;
}

export interface MentorshipRow {
  id: string;
  mentorId: string;
  menteeId: string;
  mentorName: string;
  mentorLevel: number;
  menteeName: string;
  menteeLevel: number;
  topic: string;
  message: string;
  status: MentorshipStatus;
  createdAt: Date;
  respondedAt: Date | null;
  endedAt: Date | null;
}

export interface StoredMessage extends Omit<CommunityMessageDto, 'mine' | 'hidden'> {
  authorId: string;
  hiddenAt: Date | null;
}

export abstract class SocialRepository {
  // Groupes
  /** Groupes publics, plus les groupes privés dont l'utilisateur est membre. */
  abstract groups(userId: string | null): Promise<(StudyGroupDto & { memberOf: boolean; ownerOf: boolean })[]>;
  abstract group(id: string): Promise<GroupRow | null>;
  abstract groupByCode(code: string): Promise<GroupRow | null>;
  abstract members(groupId: string): Promise<StudyGroupMemberDto[]>;
  abstract ownedGroups(userId: string): Promise<number>;
  abstract createGroup(ownerId: string, g: { name: string; description: string; goal: string | null; isPublic: boolean; maxMembers: number; inviteCode: string | null }): Promise<string>;
  /** Ajoute le membre si le groupe n'est pas complet (verrou sur le groupe) ; false sinon. */
  abstract join(groupId: string, userId: string): Promise<boolean>;
  /** Retire le membre ; `newOwner` reprend le groupe ; sans personne, le groupe est supprimé. */
  abstract leave(groupId: string, userId: string, newOwner: string | null): Promise<void>;

  // Mentorat
  abstract mentors(topic: string | null): Promise<MentorDto[]>;
  abstract mentor(userId: string): Promise<MentorDto | null>;
  abstract saveMentorProfile(userId: string, p: MentorProfileInput): Promise<void>;
  abstract openRequests(menteeId: string): Promise<number>;
  abstract hasOpen(mentorId: string, menteeId: string): Promise<boolean>;
  /** null si une demande ouverte existe déjà (course). */
  abstract requestMentorship(mentorId: string, menteeId: string, topic: string, message: string): Promise<string | null>;
  abstract mentorships(userId: string): Promise<MentorshipRow[]>;
  abstract mentorship(id: string): Promise<MentorshipRow | null>;
  /** Change le statut si le statut courant est toujours `from` ; false sinon. */
  abstract setMentorshipStatus(id: string, from: MentorshipStatus, to: MentorshipStatus): Promise<boolean>;

  // Messages
  abstract messages(channel: Channel, channelId: string, limit: number): Promise<StoredMessage[]>;
  abstract recentMessages(userId: string): Promise<number>;
  abstract postMessage(channel: Channel, channelId: string, authorId: string, bodyMd: string): Promise<void>;
  abstract message(id: string): Promise<{ id: string; channel: Channel; channelId: string; authorId: string } | null>;
  abstract hideMessage(id: string, by: string): Promise<void>;
}
