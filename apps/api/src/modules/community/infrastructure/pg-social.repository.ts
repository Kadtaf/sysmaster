import { Injectable } from '@nestjs/common';
import type { CommunityMentorshipChangedV1, MentorDto, MentorProfileInput, StudyGroupDto, StudyGroupMemberDto } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import type { MentorshipStatus } from '../domain/social';
import { Channel, GroupRow, MentorshipRow, SocialRepository, StoredMessage } from '../application/social-ports';

/** Nom public : le pseudonyme s'il existe, sinon le nom affiché. Jamais l'adresse e-mail. */
const name = (alias: string) => `coalesce(${alias}.username::text, ${alias}.display_name)`;

const GROUP_SELECT = `
  SELECT g.id, g.name, coalesce(g.description, '') AS description, g.goal, g.is_public, g.invite_code, g.max_members, g.created_at,
         ${name('o')} AS owner_name,
         (SELECT count(*)::int FROM community.study_group_members m WHERE m.group_id = g.id) AS member_count
    FROM community.study_groups g JOIN iam.users o ON o.id = g.owner_id`;

function toGroup(r: Record<string, any>): GroupRow {
  return {
    id: r.id, name: r.name, description: r.description, goal: r.goal, isPublic: r.is_public, inviteCode: r.invite_code,
    memberCount: r.member_count, maxMembers: r.max_members, ownerName: r.owner_name, createdAt: r.created_at,
  };
}

/** Un profil de mentor ne compte que si la personne a encore le rôle (ou est administrateur). */
const MENTOR_SELECT = `
  SELECT p.user_id, ${name('u')} AS display_name, coalesce(s.level, 1) AS level, p.bio, p.topics, p.accepting, p.max_mentees,
         (SELECT count(*)::int FROM community.mentorships x WHERE x.mentor_id = p.user_id AND x.status = 'active') AS active_mentees
    FROM community.mentor_profiles p
    JOIN iam.users u ON u.id = p.user_id AND u.status = 'active'
    LEFT JOIN gamification.user_stats s ON s.user_id = p.user_id
   WHERE EXISTS (SELECT 1 FROM iam.user_roles r WHERE r.user_id = p.user_id AND r.role_code IN ('mentor', 'admin', 'super_admin'))`;

function toMentor(r: Record<string, any>): MentorDto {
  return {
    userId: r.user_id, displayName: r.display_name, level: r.level, bio: r.bio, topics: r.topics, accepting: r.accepting,
    activeMentees: r.active_mentees, maxMentees: r.max_mentees,
  };
}

const MENTORSHIP_SELECT = `
  SELECT x.id, x.mentor_id, x.mentee_id, ${name('mu')} AS mentor_name, coalesce(ms.level, 1) AS mentor_level,
         ${name('eu')} AS mentee_name, coalesce(es.level, 1) AS mentee_level,
         x.topic, x.message, x.status, x.created_at, x.responded_at, x.ended_at
    FROM community.mentorships x
    JOIN iam.users mu ON mu.id = x.mentor_id LEFT JOIN gamification.user_stats ms ON ms.user_id = x.mentor_id
    JOIN iam.users eu ON eu.id = x.mentee_id LEFT JOIN gamification.user_stats es ON es.user_id = x.mentee_id`;

function toMentorship(r: Record<string, any>): MentorshipRow {
  return {
    id: r.id, mentorId: r.mentor_id, menteeId: r.mentee_id, mentorName: r.mentor_name, mentorLevel: r.mentor_level,
    menteeName: r.mentee_name, menteeLevel: r.mentee_level, topic: r.topic, message: r.message, status: r.status,
    createdAt: r.created_at, respondedAt: r.responded_at, endedAt: r.ended_at,
  };
}

@Injectable()
export class PgSocialRepository extends SocialRepository {
  constructor(private readonly db: Database) {
    super();
  }

  // ---------- Groupes ----------

  async groups(userId: string | null): Promise<(StudyGroupDto & { memberOf: boolean; ownerOf: boolean })[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM (${GROUP_SELECT}) g
         LEFT JOIN LATERAL (SELECT m.role FROM community.study_group_members m WHERE m.group_id = g.id AND m.user_id = $1::uuid) me ON true
        WHERE g.is_public OR me.role IS NOT NULL
        ORDER BY (me.role IS NOT NULL) DESC, g.member_count DESC, g.created_at DESC
        LIMIT 200`,
      [userId],
    );
    return rows.map((r) => {
      const g = toGroup(r);
      return {
        id: g.id, name: g.name, description: g.description, goal: g.goal, isPublic: g.isPublic, memberCount: g.memberCount,
        maxMembers: g.maxMembers, owner: g.ownerName, createdAt: g.createdAt.toISOString(), me: null,
        memberOf: r.role !== null, ownerOf: r.role === 'owner',
      };
    });
  }

  async group(id: string): Promise<GroupRow | null> {
    const { rows } = await this.db.query<Record<string, any>>(`${GROUP_SELECT} WHERE g.id = $1`, [id]);
    return rows[0] ? toGroup(rows[0]) : null;
  }

  async groupByCode(code: string): Promise<GroupRow | null> {
    const { rows } = await this.db.query<Record<string, any>>(`${GROUP_SELECT} WHERE g.invite_code = $1`, [code]);
    return rows[0] ? toGroup(rows[0]) : null;
  }

  async members(groupId: string): Promise<StudyGroupMemberDto[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT m.user_id, ${name('u')} AS display_name, coalesce(s.level, 1) AS level, m.role, m.joined_at
         FROM community.study_group_members m JOIN iam.users u ON u.id = m.user_id
         LEFT JOIN gamification.user_stats s ON s.user_id = m.user_id
        WHERE m.group_id = $1 ORDER BY m.role = 'owner' DESC, m.joined_at`,
      [groupId],
    );
    return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, level: r.level, role: r.role, joinedAt: r.joined_at.toISOString() }));
  }

  async ownedGroups(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM community.study_groups WHERE owner_id = $1`, [userId]);
    return rows[0].n;
  }

  createGroup(ownerId: string, g: { name: string; description: string; goal: string | null; isPublic: boolean; maxMembers: number; inviteCode: string | null }): Promise<string> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO community.study_groups (name, description, owner_id, goal, is_public, max_members, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [g.name, g.description, ownerId, g.goal, g.isPublic, g.maxMembers, g.inviteCode],
      );
      await tx.query(`INSERT INTO community.study_group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`, [rows[0].id, ownerId]);
      return rows[0].id;
    });
  }

  join(groupId: string, userId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Verrou sur le groupe : deux arrivées simultanées ne dépassent pas la limite.
      const { rows } = await tx.query<{ max_members: number }>(`SELECT max_members FROM community.study_groups WHERE id = $1 FOR UPDATE`, [groupId]);
      if (!rows[0]) return false;
      const count = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM community.study_group_members WHERE group_id = $1`, [groupId]);
      if (count.rows[0].n >= rows[0].max_members) return false;
      const { rowCount } = await tx.query(
        `INSERT INTO community.study_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [groupId, userId],
      );
      return rowCount === 1;
    });
  }

  leave(groupId: string, userId: string, newOwner: string | null): Promise<void> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ role: string }>(
        `DELETE FROM community.study_group_members WHERE group_id = $1 AND user_id = $2 RETURNING role`,
        [groupId, userId],
      );
      if (rows[0]?.role !== 'owner') return;
      if (newOwner) {
        await tx.query(`UPDATE community.study_group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`, [groupId, newOwner]);
        await tx.query(`UPDATE community.study_groups SET owner_id = $2 WHERE id = $1`, [groupId, newOwner]);
      } else {
        await tx.query(`DELETE FROM community.messages WHERE channel = 'group' AND channel_id = $1`, [groupId]);
        await tx.query(`DELETE FROM community.study_groups WHERE id = $1`, [groupId]);
      }
    });
  }

  // ---------- Mentorat ----------

  async mentors(topic: string | null): Promise<MentorDto[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM (${MENTOR_SELECT}) m
        WHERE $1::text IS NULL OR $1 = ANY(m.topics)
        ORDER BY (m.accepting AND m.active_mentees < m.max_mentees) DESC, m.level DESC, m.display_name`,
      [topic],
    );
    return rows.map(toMentor);
  }

  async mentor(userId: string): Promise<MentorDto | null> {
    const { rows } = await this.db.query<Record<string, any>>(`${MENTOR_SELECT} AND p.user_id = $1`, [userId]);
    return rows[0] ? toMentor(rows[0]) : null;
  }

  async saveMentorProfile(userId: string, p: MentorProfileInput): Promise<void> {
    await this.db.query(
      `INSERT INTO community.mentor_profiles (user_id, bio, topics, accepting, max_mentees) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET bio = EXCLUDED.bio, topics = EXCLUDED.topics, accepting = EXCLUDED.accepting,
         max_mentees = EXCLUDED.max_mentees, updated_at = now()`,
      [userId, p.bio, p.topics, p.accepting, p.maxMentees],
    );
  }

  async openRequests(menteeId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM community.mentorships WHERE mentee_id = $1 AND status = 'requested'`,
      [menteeId],
    );
    return rows[0].n;
  }

  async hasOpen(mentorId: string, menteeId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM community.mentorships WHERE mentor_id = $1 AND mentee_id = $2 AND status IN ('requested', 'active')`,
      [mentorId, menteeId],
    );
    return rows.length > 0;
  }

  async requestMentorship(mentorId: string, menteeId: string, topic: string, message: string): Promise<string | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO community.mentorships (mentor_id, mentee_id, topic, message) VALUES ($1, $2, $3, $4) RETURNING id`,
          [mentorId, menteeId, topic, message],
        );
        await emitMentorship(tx, { mentorshipId: rows[0].id, mentorId, menteeId, status: 'requested', actorId: menteeId, topic });
        return rows[0].id;
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return null;
      throw err;
    }
  }

  async mentorships(userId: string): Promise<MentorshipRow[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `${MENTORSHIP_SELECT} WHERE x.mentor_id = $1 OR x.mentee_id = $1
        ORDER BY array_position(ARRAY['requested','active','ended','declined'], x.status), x.created_at DESC
        LIMIT 100`,
      [userId],
    );
    return rows.map(toMentorship);
  }

  async mentorship(id: string): Promise<MentorshipRow | null> {
    const { rows } = await this.db.query<Record<string, any>>(`${MENTORSHIP_SELECT} WHERE x.id = $1`, [id]);
    return rows[0] ? toMentorship(rows[0]) : null;
  }

  setMentorshipStatus(id: string, from: MentorshipStatus, to: MentorshipStatus, actorId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ mentor_id: string; mentee_id: string; topic: string }>(
        `UPDATE community.mentorships
            SET status = $3,
                responded_at = CASE WHEN $2 = 'requested' THEN now() ELSE responded_at END,
                ended_at = CASE WHEN $3 = 'ended' THEN now() ELSE ended_at END
          WHERE id = $1 AND status = $2
          RETURNING mentor_id, mentee_id, topic`,
        [id, from, to],
      );
      const m = rows[0];
      if (!m) return false;
      await emitMentorship(tx, { mentorshipId: id, mentorId: m.mentor_id, menteeId: m.mentee_id, status: to, actorId, topic: m.topic });
      return true;
    });
  }

  // ---------- Messages ----------

  async messages(channel: Channel, channelId: string, limit: number): Promise<StoredMessage[]> {
    // Les plus récents, remis dans l'ordre chronologique.
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM (
         SELECT x.id, x.author_id, ${name('u')} AS author_name, coalesce(s.level, 1) AS author_level, x.body_md, x.created_at, x.hidden_at
           FROM community.messages x JOIN iam.users u ON u.id = x.author_id LEFT JOIN gamification.user_stats s ON s.user_id = x.author_id
          WHERE x.channel = $1 AND x.channel_id = $2
          ORDER BY x.created_at DESC LIMIT $3) t
        ORDER BY created_at`,
      [channel, channelId, limit],
    );
    return rows.map((r) => ({
      id: r.id, authorId: r.author_id, author: { displayName: r.author_name, level: r.author_level }, bodyMd: r.body_md,
      createdAt: r.created_at.toISOString(), hiddenAt: r.hidden_at,
    }));
  }

  async recentMessages(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM community.messages WHERE author_id = $1 AND created_at > now() - interval '1 hour'`,
      [userId],
    );
    return rows[0].n;
  }

  async postMessage(channel: Channel, channelId: string, authorId: string, bodyMd: string): Promise<void> {
    await this.db.query(`INSERT INTO community.messages (channel, channel_id, author_id, body_md) VALUES ($1, $2, $3, $4)`, [channel, channelId, authorId, bodyMd]);
  }

  async message(id: string) {
    const { rows } = await this.db.query<{ id: string; channel: Channel; channel_id: string; author_id: string }>(
      `SELECT id, channel, channel_id, author_id FROM community.messages WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    return r ? { id: r.id, channel: r.channel, channelId: r.channel_id, authorId: r.author_id } : null;
  }

  async hideMessage(id: string, by: string): Promise<void> {
    await this.db.query(`UPDATE community.messages SET hidden_at = coalesce(hidden_at, now()), hidden_by = coalesce(hidden_by, $2) WHERE id = $1`, [id, by]);
  }
}

function emitMentorship(tx: PoolClient, event: CommunityMentorshipChangedV1) {
  return tx.query(
    `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
     VALUES ('community.mentorship', $1, 'community.mentorship.changed.v1', $2)`,
    [event.mentorshipId, JSON.stringify(event)],
  );
}
