import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  AdminOrganizationDto, CreateOrganizationInput, InvitationPreviewDto, MemberProgressDto, OrganizationDetailDto, OrganizationInvitationDto,
  OrganizationKind, OrganizationRole, OrganizationSummaryDto, UpdateOrganizationInput,
} from '@sysmaster/contracts';
import { Database } from '../../../shared/database.module';
import { acceptBlocker, canManage, invitationExpiry, invitationState, licenceState, maskEmail, newInvitationToken } from '../domain/organization';

type OrgRow = {
  id: string; name: string; slug: string; kind: OrganizationKind; seats: number;
  licence_starts_at: Date | null; licence_ends_at: Date | null; seat_plan: string; created_at: Date;
};

export interface CreatedInvitation extends OrganizationInvitationDto {
  link: string;
  token: string;
}

const ORG_COLUMNS = 'o.id, o.name, o.slug, o.kind, o.seats, o.licence_starts_at, o.licence_ends_at, o.seat_plan, o.created_at';

/** Sièges pris : membres plus invitations en attente non expirées. */
const SEATS_USED = `(SELECT count(*) FROM iam.memberships m WHERE m.organization_id = o.id)
  + (SELECT count(*) FROM iam.organization_invitations i
      WHERE i.organization_id = o.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now())`;

const iso = (d: Date | null) => d?.toISOString() ?? null;

@Injectable()
export class PgOrganizationRepository {
  constructor(private readonly db: Database) {}

  async role(orgId: string, userId: string): Promise<OrganizationRole | null> {
    const { rows } = await this.db.query<{ role_code: OrganizationRole }>(
      'SELECT role_code FROM iam.memberships WHERE organization_id = $1 AND user_id = $2', [orgId, userId],
    );
    return rows[0]?.role_code ?? null;
  }

  async mine(userId: string): Promise<OrganizationSummaryDto[]> {
    const { rows } = await this.db.query<OrgRow & { role_code: OrganizationRole }>(
      `SELECT ${ORG_COLUMNS}, m.role_code FROM iam.memberships m JOIN iam.organizations o ON o.id = m.organization_id
        WHERE m.user_id = $1 ORDER BY o.name`,
      [userId],
    );
    return rows.map((o) => ({
      id: o.id, name: o.name, kind: o.kind, role: o.role_code,
      licence: { state: licenceState(o.licence_starts_at, o.licence_ends_at), endsAt: iso(o.licence_ends_at) },
    }));
  }

  async detail(orgId: string, role: OrganizationRole): Promise<OrganizationDetailDto> {
    const { rows } = await this.db.query<OrgRow & { used: string }>(
      `SELECT ${ORG_COLUMNS}, ${SEATS_USED} AS used FROM iam.organizations o WHERE o.id = $1`, [orgId],
    );
    const o = rows[0];
    if (!o) throw new NotFoundException();
    const manager = canManage(role);
    const [members, invitations] = await Promise.all([
      this.db.query<{ user_id: string; display_name: string; email: string; role_code: OrganizationRole; joined_at: Date }>(
        `SELECT m.user_id, u.display_name, u.email, m.role_code, m.joined_at
           FROM iam.memberships m JOIN iam.users u ON u.id = m.user_id
          WHERE m.organization_id = $1 ORDER BY u.display_name, u.email`,
        [orgId],
      ),
      manager
        ? this.db.query<{ id: string; email: string; role_code: OrganizationRole; created_at: Date; expires_at: Date }>(
          `SELECT id, email, role_code, created_at, expires_at FROM iam.organization_invitations
            WHERE organization_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
            ORDER BY created_at DESC`,
          [orgId],
        )
        : Promise.resolve({ rows: [] }),
    ]);
    return {
      id: o.id, name: o.name, slug: o.slug, kind: o.kind, role,
      seats: o.seats, seatsUsed: Number(o.used),
      licence: { state: licenceState(o.licence_starts_at, o.licence_ends_at), startsAt: iso(o.licence_starts_at), endsAt: iso(o.licence_ends_at), seatPlan: o.seat_plan },
      // Un simple membre ne voit pas les adresses des autres.
      members: members.rows.map((m) => ({
        userId: m.user_id, displayName: m.display_name, email: manager ? m.email : '', role: m.role_code, joinedAt: m.joined_at.toISOString(),
      })),
      invitations: invitations.rows.map((i) => ({
        id: i.id, email: i.email, role: i.role_code, createdAt: i.created_at.toISOString(), expiresAt: i.expires_at.toISOString(),
      })),
      canManage: manager,
    };
  }

  // --- Administration SysMaster -------------------------------------------------------------

  async adminList(): Promise<AdminOrganizationDto[]> {
    const { rows } = await this.db.query<OrgRow & { used: string; owners: string[] | null }>(
      `SELECT ${ORG_COLUMNS}, ${SEATS_USED} AS used,
              (SELECT array_agg(u.email::text ORDER BY u.email) FROM iam.memberships m JOIN iam.users u ON u.id = m.user_id
                WHERE m.organization_id = o.id AND m.role_code = 'org_owner') AS owners
         FROM iam.organizations o ORDER BY o.created_at DESC`,
    );
    return rows.map((o) => this.adminDto(o));
  }

  private adminDto(o: OrgRow & { used: string; owners?: string[] | null }): AdminOrganizationDto {
    return {
      id: o.id, name: o.name, slug: o.slug, kind: o.kind, seats: o.seats, seatsUsed: Number(o.used),
      licence: { state: licenceState(o.licence_starts_at, o.licence_ends_at), startsAt: iso(o.licence_starts_at), endsAt: iso(o.licence_ends_at) },
      owners: o.owners ?? [],
      createdAt: o.created_at.toISOString(),
    };
  }

  /** Crée l'organisation et invite son propriétaire (le siège du propriétaire est compté). */
  async create(input: CreateOrganizationInput, adminId: string, linkFor: (token: string) => string): Promise<{ organization: AdminOrganizationDto; invitation: CreatedInvitation }> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<OrgRow>(
        `INSERT INTO iam.organizations (name, slug, kind, country, seats, licence_starts_at, licence_ends_at, seat_plan, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pro', $8) ON CONFLICT (slug) DO NOTHING
         RETURNING id, name, slug, kind, seats, licence_starts_at, licence_ends_at, seat_plan, created_at`,
        [input.name, input.slug, input.kind, input.country ?? null, input.seats, input.licenceStartsAt ?? null, input.licenceEndsAt, adminId],
      );
      const o = rows[0];
      if (!o) throw new ConflictException('Cet identifiant d’organisation est déjà pris.');
      const [invitation] = await this.insertInvitations(tx, o.id, [input.ownerEmail], 'org_owner', adminId, linkFor);
      await this.audit(tx, adminId, 'organization.created', o.id, { seats: input.seats, licenceEndsAt: input.licenceEndsAt, kind: input.kind });
      return { organization: this.adminDto({ ...o, used: '1', owners: [] }), invitation };
    });
  }

  async update(orgId: string, patch: UpdateOrganizationInput, adminId: string): Promise<AdminOrganizationDto> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<OrgRow & { used: string }>(
        `SELECT ${ORG_COLUMNS}, ${SEATS_USED} AS used FROM iam.organizations o WHERE o.id = $1 FOR UPDATE`, [orgId],
      );
      const o = rows[0];
      if (!o) throw new NotFoundException();
      if (patch.seats !== undefined && patch.seats < Number(o.used)) {
        throw new ConflictException(`${o.used} sièges sont pris (membres et invitations en attente) : retirez-en avant de réduire.`);
      }
      const updated = (
        await tx.query<OrgRow>(
          `UPDATE iam.organizations SET name = coalesce($2, name), seats = coalesce($3, seats),
                  licence_ends_at = coalesce($4, licence_ends_at), updated_at = now()
            WHERE id = $1 RETURNING id, name, slug, kind, seats, licence_starts_at, licence_ends_at, seat_plan, created_at`,
          [orgId, patch.name ?? null, patch.seats ?? null, patch.licenceEndsAt ?? null],
        )
      ).rows[0];
      await this.audit(tx, adminId, 'organization.updated', orgId, patch);
      return this.adminDto({ ...updated, used: o.used });
    });
  }

  // --- Invitations ---------------------------------------------------------------------------

  /**
   * Invite des adresses. Les membres déjà présents et les invitations encore valides sont ignorés ;
   * le tout est refusé s'il n'y a pas assez de sièges (verrou sur l'organisation : deux gestionnaires
   * qui invitent en même temps ne dépassent pas le nombre de sièges).
   */
  async invite(orgId: string, emails: string[], role: OrganizationRole, inviterId: string, linkFor: (token: string) => string) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<OrgRow & { used: string }>(
        `SELECT ${ORG_COLUMNS}, ${SEATS_USED} AS used FROM iam.organizations o WHERE o.id = $1 FOR UPDATE`, [orgId],
      );
      const o = rows[0];
      if (!o) throw new NotFoundException();
      if (licenceState(o.licence_starts_at, o.licence_ends_at) !== 'active') {
        throw new ConflictException('La licence n’est pas en cours : impossible d’inviter.');
      }
      const unique = [...new Set(emails.map((e) => e.toLowerCase()))];
      const taken = await tx.query<{ email: string }>(
        `SELECT u.email::text AS email FROM iam.memberships m JOIN iam.users u ON u.id = m.user_id
          WHERE m.organization_id = $1 AND u.email = ANY($2::citext[])
         UNION
         SELECT email::text FROM iam.organization_invitations
          WHERE organization_id = $1 AND email = ANY($2::citext[]) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`,
        [orgId, unique],
      );
      const skipped = new Set(taken.rows.map((r) => r.email.toLowerCase()));
      const fresh = unique.filter((e) => !skipped.has(e));
      const free = o.seats - Number(o.used);
      if (fresh.length > free) {
        throw new ConflictException(`Il reste ${Math.max(free, 0)} siège(s) libre(s) pour ${fresh.length} invitation(s).`);
      }
      const created = await this.insertInvitations(tx, orgId, fresh, role, inviterId, linkFor);
      if (created.length) await this.audit(tx, inviterId, 'organization.invited', orgId, { count: created.length, role });
      return { created, skipped: [...skipped] };
    });
  }

  private async insertInvitations(tx: PoolClient, orgId: string, emails: string[], role: OrganizationRole, inviterId: string, linkFor: (token: string) => string) {
    const out: CreatedInvitation[] = [];
    for (const email of emails) {
      // Une invitation expirée bloquerait l'index d'unicité : on la clôt avant d'en créer une nouvelle.
      await tx.query(
        `UPDATE iam.organization_invitations SET revoked_at = now()
          WHERE organization_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= now()`,
        [orgId, email],
      );
      const { token, hash } = newInvitationToken();
      const { rows } = await tx.query<{ id: string; created_at: Date; expires_at: Date }>(
        `INSERT INTO iam.organization_invitations (organization_id, email, role_code, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at, expires_at`,
        [orgId, email, role, hash, inviterId, invitationExpiry()],
      );
      out.push({
        id: rows[0].id, email, role, createdAt: rows[0].created_at.toISOString(), expiresAt: rows[0].expires_at.toISOString(),
        token, link: linkFor(token),
      });
    }
    return out;
  }

  async revokeInvitation(orgId: string, invitationId: string, actorId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE iam.organization_invitations SET revoked_at = now()
          WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [invitationId, orgId],
      );
      if (!rowCount) throw new NotFoundException();
      await this.audit(tx, actorId, 'organization.invitation_revoked', orgId, { invitationId });
    });
  }

  async preview(hash: Buffer): Promise<InvitationPreviewDto | null> {
    const { rows } = await this.db.query<{
      name: string; kind: OrganizationKind; role_code: OrganizationRole; email: string; expires_at: Date; accepted_at: Date | null; revoked_at: Date | null;
    }>(
      `SELECT o.name, o.kind, i.role_code, i.email, i.expires_at, i.accepted_at, i.revoked_at
         FROM iam.organization_invitations i JOIN iam.organizations o ON o.id = i.organization_id
        WHERE i.token_hash = $1`,
      [hash],
    );
    const i = rows[0];
    if (!i) return null;
    return {
      organization: i.name, kind: i.kind, role: i.role_code, emailHint: maskEmail(i.email), expiresAt: i.expires_at.toISOString(),
      state: invitationState({ acceptedAt: i.accepted_at, revokedAt: i.revoked_at, expiresAt: i.expires_at }),
    };
  }

  /** Accepte une invitation : verrous sur l'invitation puis l'organisation, un seul usage. */
  async accept(hash: Buffer, user: { id: string; email: string }): Promise<{ organizationId: string }> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{
        id: string; organization_id: string; email: string; role_code: OrganizationRole; expires_at: Date; accepted_at: Date | null; revoked_at: Date | null;
      }>(
        `SELECT id, organization_id, email, role_code, expires_at, accepted_at, revoked_at
           FROM iam.organization_invitations WHERE token_hash = $1 FOR UPDATE`,
        [hash],
      );
      const inv = rows[0];
      if (!inv) throw new NotFoundException('Invitation introuvable.');
      const org = (
        await tx.query<{ licence_starts_at: Date | null; licence_ends_at: Date | null }>(
          'SELECT licence_starts_at, licence_ends_at FROM iam.organizations WHERE id = $1 FOR UPDATE', [inv.organization_id],
        )
      ).rows[0];
      const me = (await tx.query<{ email: string; email_verified: boolean }>('SELECT email, email_verified FROM iam.users WHERE id = $1', [user.id])).rows[0];
      const member = await tx.query('SELECT 1 FROM iam.memberships WHERE organization_id = $1 AND user_id = $2', [inv.organization_id, user.id]);
      const blocker = acceptBlocker({
        state: invitationState({ acceptedAt: inv.accepted_at, revokedAt: inv.revoked_at, expiresAt: inv.expires_at }),
        licence: licenceState(org.licence_starts_at, org.licence_ends_at),
        invitedEmail: inv.email, userEmail: me?.email ?? '', emailVerified: me?.email_verified ?? false,
        alreadyMember: (member.rowCount ?? 0) > 0,
      });
      if (blocker) throw new ConflictException(blocker);
      await tx.query(
        'INSERT INTO iam.memberships (organization_id, user_id, role_code) VALUES ($1, $2, $3)', [inv.organization_id, user.id, inv.role_code],
      );
      await tx.query('UPDATE iam.organization_invitations SET accepted_at = now(), accepted_by = $2 WHERE id = $1', [inv.id, user.id]);
      await this.audit(tx, user.id, 'organization.joined', inv.organization_id, { role: inv.role_code });
      return { organizationId: inv.organization_id };
    });
  }

  // --- Membres ---------------------------------------------------------------------------------

  async changeRole(orgId: string, userId: string, role: OrganizationRole, actorId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = await this.lockMember(tx, orgId, userId);
      if (current === 'org_owner') throw new ForbiddenException('Le rôle d’un propriétaire se change par le support SysMaster.');
      await tx.query('UPDATE iam.memberships SET role_code = $3 WHERE organization_id = $1 AND user_id = $2', [orgId, userId, role]);
      await this.audit(tx, actorId, 'organization.role_changed', orgId, { userId, from: current, to: role });
    });
  }

  /** Retirer un membre (par un gestionnaire) ou partir (soi-même) : le siège est libéré. */
  async removeMember(orgId: string, userId: string, actorId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = await this.lockMember(tx, orgId, userId);
      if (current === 'org_owner') {
        const owners = await tx.query(`SELECT 1 FROM iam.memberships WHERE organization_id = $1 AND role_code = 'org_owner' FOR UPDATE`, [orgId]);
        if (actorId !== userId) throw new ForbiddenException('Un propriétaire ne peut pas être retiré par un autre gestionnaire.');
        if ((owners.rowCount ?? 0) < 2) throw new ConflictException('Vous êtes le seul propriétaire : le support SysMaster doit d’abord en nommer un autre.');
      }
      await tx.query('DELETE FROM iam.memberships WHERE organization_id = $1 AND user_id = $2', [orgId, userId]);
      await this.audit(tx, actorId, actorId === userId ? 'organization.left' : 'organization.member_removed', orgId, { userId });
    });
  }

  private async lockMember(tx: PoolClient, orgId: string, userId: string): Promise<OrganizationRole> {
    const { rows } = await tx.query<{ role_code: OrganizationRole }>(
      'SELECT role_code FROM iam.memberships WHERE organization_id = $1 AND user_id = $2 FOR UPDATE', [orgId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Ce compte n’est pas membre de l’organisation.');
    return rows[0].role_code;
  }

  // --- Progression -----------------------------------------------------------------------------

  /** Ce que voit l'organisation : progression d'apprentissage seulement (docs/08, « Licences »). */
  async progress(orgId: string): Promise<MemberProgressDto[]> {
    const [members, paths, certificates] = await Promise.all([
      this.db.query<{
        user_id: string; display_name: string; role_code: OrganizationRole; level: number | null; total_xp: string | null;
        lessons_completed: number | null; labs_solved: number | null; last_activity: string | null;
      }>(
        `SELECT m.user_id, u.display_name, m.role_code, s.level, s.total_xp, s.lessons_completed, s.labs_solved, s.last_activity_date::text AS last_activity
           FROM iam.memberships m JOIN iam.users u ON u.id = m.user_id
           LEFT JOIN gamification.user_stats s ON s.user_id = m.user_id
          WHERE m.organization_id = $1 ORDER BY u.display_name`,
        [orgId],
      ),
      this.db.query<{ user_id: string; slug: string; title: string; progress_pct: string | null; completed_at: Date | null }>(
        `SELECT e.user_id, p.slug, p.title, e.progress_pct, e.completed_at
           FROM learning.enrollments e JOIN learning.learning_paths p ON p.id = e.path_id
          WHERE e.user_id IN (SELECT user_id FROM iam.memberships WHERE organization_id = $1)
          ORDER BY e.started_at`,
        [orgId],
      ),
      this.db.query<{ user_id: string; certification_code: string; title: string; issued_at: Date; expires_at: Date | null }>(
        `SELECT c.user_id, c.certification_code, ce.title, c.issued_at, c.expires_at
           FROM assessment.certificates c JOIN assessment.certifications ce ON ce.code = c.certification_code
          WHERE c.user_id IN (SELECT user_id FROM iam.memberships WHERE organization_id = $1)
            AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > now())
          ORDER BY c.issued_at`,
        [orgId],
      ),
    ]);
    const byUser = <T extends { user_id: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const r of rows) map.set(r.user_id, [...(map.get(r.user_id) ?? []), r]);
      return map;
    };
    const pathsBy = byUser(paths.rows);
    const certsBy = byUser(certificates.rows);
    return members.rows.map((m) => ({
      userId: m.user_id, displayName: m.display_name, role: m.role_code,
      level: m.level ?? 1, totalXp: Number(m.total_xp ?? 0), lessonsCompleted: m.lessons_completed ?? 0, labsSolved: m.labs_solved ?? 0,
      paths: (pathsBy.get(m.user_id) ?? []).map((p) => ({
        slug: p.slug, title: p.title, progressPct: Math.round(Number(p.progress_pct ?? 0)), completedAt: iso(p.completed_at),
      })),
      certificates: (certsBy.get(m.user_id) ?? []).map((c) => ({
        code: c.certification_code, title: c.title, issuedAt: c.issued_at.toISOString(), expiresAt: iso(c.expires_at),
      })),
      lastActivity: m.last_activity,
    }));
  }

  async organizationName(orgId: string): Promise<string | null> {
    const { rows } = await this.db.query<{ name: string }>('SELECT name FROM iam.organizations WHERE id = $1', [orgId]);
    return rows[0]?.name ?? null;
  }

  private audit(tx: PoolClient, actorId: string, action: string, orgId: string, metadata: unknown) {
    return tx.query(
      `INSERT INTO platform.audit_log (actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, 'organization', $3, $4)`,
      [actorId, action, orgId, JSON.stringify(metadata)],
    );
  }
}
