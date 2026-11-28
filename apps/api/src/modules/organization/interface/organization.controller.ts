import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AcceptInvitationSchema, ChangeMemberRoleSchema, CreateOrganizationSchema, InviteMembersSchema, UpdateOrganizationSchema,
} from '@sysmaster/contracts';
import type { AdminOrganizationDto, InvitationPreviewDto, OrganizationDetailDto, OrganizationProgressDto, OrganizationSummaryDto } from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, Public, Roles } from '../../iam/interface/auth.decorators';
import { LIMITS, RateLimit } from '../../../shared/security/rate-limit';
import { OrganizationService } from '../application/organization.service';

@ApiTags('organisations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgs: OrganizationService) {}

  @Get('mine')
  @ApiOperation({ summary: 'Mes organisations et mon rôle dans chacune' })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<OrganizationSummaryDto[]> {
    return this.orgs.mine(user);
  }

  // Jeton dans le corps, jamais dans l'adresse : il ne doit pas finir dans les journaux.
  @Public()
  @Post('invitations/preview')
  @HttpCode(200)
  @RateLimit(LIMITS.organizationInvitation)
  @ApiOperation({ summary: 'Ce que propose une invitation (organisation, rôle, adresse masquée)' })
  preview(@Body() body: unknown): Promise<InvitationPreviewDto> {
    return this.orgs.preview(parse(AcceptInvitationSchema, body ?? {}).token);
  }

  @Post('invitations/accept')
  @HttpCode(200)
  @RateLimit(LIMITS.organizationInvitation)
  @ApiOperation({ summary: 'Accepter une invitation (avec le compte de l’adresse invitée)' })
  accept(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<{ organizationId: string }> {
    return this.orgs.accept(parse(AcceptInvitationSchema, body ?? {}).token, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Une organisation : sièges, licence, membres (et invitations pour les gestionnaires)' })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<OrganizationDetailDto> {
    return this.orgs.detail(id, user);
  }

  @Post(':id/invitations')
  @RateLimit(LIMITS.organizationInvite)
  @ApiOperation({ summary: 'Inviter des adresses (gestionnaires) ; une invitation réserve un siège' })
  invite(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.orgs.invite(id, user, parse(InviteMembersSchema, body ?? {}));
  }

  @Delete(':id/invitations/:invitationId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Annuler une invitation en attente (libère le siège)' })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Param('invitationId', ParseUUIDPipe) invitationId: string) {
    return this.orgs.revokeInvitation(id, invitationId, user);
  }

  @Patch(':id/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Changer le rôle d’un membre (gestionnaires)' })
  changeRole(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) memberId: string, @Body() body: unknown) {
    return this.orgs.changeRole(id, memberId, parse(ChangeMemberRoleSchema, body ?? {}).role, user);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Retirer un membre (gestionnaires) ou quitter l’organisation (soi-même)' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) memberId: string) {
    return this.orgs.removeMember(id, memberId, user);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Progression des membres (gestionnaires et formateurs) : jamais les conversations IA' })
  progress(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<OrganizationProgressDto> {
    return this.orgs.progress(id, user);
  }

  @Get(':id/progress.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="progression.csv"')
  @Header('cache-control', 'no-store')
  @ApiOperation({ summary: 'Progression des membres en CSV (séparateur « ; »)' })
  progressCsv(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<string> {
    return this.orgs.progressCsv(id, user);
  }
}

@ApiTags('organisations')
@ApiBearerAuth()
@Controller('admin/organizations')
@Roles('admin')
export class AdminOrganizationController {
  constructor(private readonly orgs: OrganizationService) {}

  @Get()
  @ApiOperation({ summary: 'Toutes les organisations et leurs licences (admin)' })
  list(): Promise<AdminOrganizationDto[]> {
    return this.orgs.adminList();
  }

  @Post()
  @ApiOperation({ summary: 'Ouvrir une licence après devis : organisation, sièges, période, invitation du propriétaire (admin)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.orgs.create(parse(CreateOrganizationSchema, body ?? {}), user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Changer le nom, les sièges ou la fin de licence (admin)' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AdminOrganizationDto> {
    return this.orgs.update(id, parse(UpdateOrganizationSchema, body ?? {}), user);
  }
}
