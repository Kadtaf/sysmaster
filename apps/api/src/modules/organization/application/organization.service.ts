import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AdminOrganizationDto, BuySeatsInput, CreateOrganizationInput, ExtendLicenceInput, LicenceOfferDto, RedirectDto, InvitationPreviewDto, InviteMembersInput, OrganizationDetailDto, OrganizationInvitationDto,
  OrganizationProgressDto, OrganizationRole, OrganizationSummaryDto, UpdateOrganizationInput,
} from '@sysmaster/contracts';
import { BillingService } from '../../billing/application/billing.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { Mailer } from '../../notification/infrastructure/mailer';
import { webUrl } from '../../../shared/web/web-url';
import { canManage, canViewProgress, hashInvitationToken, toCsv } from '../domain/organization';
import { renderInvitationEmail } from '../domain/invitation-email';
import { CreatedInvitation, PgOrganizationRepository } from '../infrastructure/pg-organization.repository';

export const invitationLink = (token: string) => `${webUrl()}/organisation/invitation?token=${encodeURIComponent(token)}`;

/**
 * Licences par siège (docs/03 §2.11) : un administrateur SysMaster ouvre l'organisation après devis,
 * ses gestionnaires invitent et retirent des membres, formateurs et gestionnaires suivent la progression.
 */
@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    private readonly repo: PgOrganizationRepository,
    private readonly mailer: Mailer,
    private readonly billing: BillingService,
  ) {}

  mine(user: AuthenticatedUser): Promise<OrganizationSummaryDto[]> {
    return this.repo.mine(user.id);
  }

  /** Rôle requis dans l'organisation ; 404 pour qui n'en est pas membre (l'organisation ne se devine pas). */
  private async require(orgId: string, user: AuthenticatedUser, allowed: (r: OrganizationRole) => boolean): Promise<OrganizationRole> {
    const role = await this.repo.role(orgId, user.id);
    if (!role) throw new NotFoundException();
    if (!allowed(role)) throw new ForbiddenException('Réservé aux gestionnaires de l’organisation.');
    return role;
  }

  async detail(orgId: string, user: AuthenticatedUser): Promise<OrganizationDetailDto> {
    const role = await this.require(orgId, user, () => true);
    return this.repo.detail(orgId, role);
  }

  async invite(orgId: string, user: AuthenticatedUser, input: InviteMembersInput): Promise<{ invitations: OrganizationInvitationDto[]; skipped: string[] }> {
    await this.require(orgId, user, canManage);
    const { created, skipped } = await this.repo.invite(orgId, input.emails, input.role, user.id, invitationLink);
    const organization = (await this.repo.organizationName(orgId)) ?? 'votre organisation';
    return { invitations: await this.sendAll(created, organization, user.displayName), skipped };
  }

  /** E-mails envoyés après l'enregistrement ; un envoi raté laisse le lien à transmettre soi-même. */
  private async sendAll(created: CreatedInvitation[], organization: string, inviter: string | null): Promise<OrganizationInvitationDto[]> {
    const out: OrganizationInvitationDto[] = [];
    for (const { token: _token, ...inv } of created) {
      let emailed = false;
      if (this.mailer.enabled) {
        try {
          await this.mailer.send({ to: inv.email, ...renderInvitationEmail({ organization, inviter, role: inv.role, link: inv.link, expiresAt: inv.expiresAt }) });
          emailed = true;
        } catch (err) {
          // Jamais l'adresse dans le journal.
          this.logger.warn(`Invitation ${inv.id} non envoyée : ${(err as Error).message}`);
        }
      }
      out.push({ ...inv, emailed });
    }
    return out;
  }

  async revokeInvitation(orgId: string, invitationId: string, user: AuthenticatedUser): Promise<void> {
    await this.require(orgId, user, canManage);
    await this.repo.revokeInvitation(orgId, invitationId, user.id);
  }

  async changeRole(orgId: string, memberId: string, role: OrganizationRole, user: AuthenticatedUser): Promise<void> {
    await this.require(orgId, user, canManage);
    if (memberId === user.id) throw new ForbiddenException('Vous ne pouvez pas changer votre propre rôle.');
    await this.repo.changeRole(orgId, memberId, role, user.id);
  }

  async removeMember(orgId: string, memberId: string, user: AuthenticatedUser): Promise<void> {
    await this.require(orgId, user, memberId === user.id ? () => true : canManage);
    await this.repo.removeMember(orgId, memberId, user.id);
  }

  // --- Licences achetées en ligne (Stripe) ---------------------------------------------------

  buySeats(user: AuthenticatedUser, input: BuySeatsInput): Promise<RedirectDto> {
    return this.billing.buySeats(user.id, input);
  }

  async licenceOffer(orgId: string, user: AuthenticatedUser): Promise<LicenceOfferDto> {
    await this.require(orgId, user, canManage);
    return this.billing.licenceOffer(orgId);
  }

  async extendLicence(orgId: string, user: AuthenticatedUser, input: ExtendLicenceInput): Promise<RedirectDto> {
    await this.require(orgId, user, canManage);
    return this.billing.extendLicence(user.id, orgId, input);
  }

  setSeatPrice(plan: string, priceCents: number | null, admin: AuthenticatedUser): Promise<void> {
    return this.billing.setSeatPrice(plan, priceCents, admin.id);
  }

  async progress(orgId: string, user: AuthenticatedUser): Promise<OrganizationProgressDto> {
    await this.require(orgId, user, canViewProgress);
    return { organizationId: orgId, generatedAt: new Date().toISOString(), members: await this.repo.progress(orgId) };
  }

  async progressCsv(orgId: string, user: AuthenticatedUser): Promise<string> {
    const { members } = await this.progress(orgId, user);
    return toCsv([
      ['Nom', 'Rôle', 'Niveau', 'XP', 'Leçons terminées', 'Labs résolus', 'Parcours', 'Certifications valides', 'Dernière activité'],
      ...members.map((m) => [
        m.displayName, m.role, m.level, m.totalXp, m.lessonsCompleted, m.labsSolved,
        m.paths.map((p) => `${p.title} (${p.completedAt ? 'terminé' : `${p.progressPct} %`})`).join(', '),
        m.certificates.map((c) => c.title).join(', '),
        m.lastActivity,
      ]),
    ]);
  }

  async preview(token: string): Promise<InvitationPreviewDto> {
    const p = await this.repo.preview(hashInvitationToken(token));
    if (!p) throw new NotFoundException('Invitation introuvable.');
    return p;
  }

  accept(token: string, user: AuthenticatedUser) {
    return this.repo.accept(hashInvitationToken(token), user);
  }

  // --- Administration SysMaster -------------------------------------------------------------

  adminList(): Promise<AdminOrganizationDto[]> {
    return this.repo.adminList();
  }

  async create(input: CreateOrganizationInput, admin: AuthenticatedUser) {
    const { organization, invitation } = await this.repo.create(input, admin.id, invitationLink);
    const [sent] = await this.sendAll([invitation], organization.name, null);
    return { organization, ownerInvitation: sent };
  }

  update(orgId: string, patch: UpdateOrganizationInput, admin: AuthenticatedUser) {
    return this.repo.update(orgId, patch, admin.id);
  }
}
