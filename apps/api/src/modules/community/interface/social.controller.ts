import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateGroupSchema, JoinByCodeSchema, MentorProfileSchema, MentorshipActionSchema, MentorshipRequestSchema, MessageSchema,
  type MentorDto, type MentorshipDto, type StudyGroupDetailDto, type StudyGroupDto,
} from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, OptionalAuth } from '../../iam/interface/auth.decorators';
import { SocialService } from '../application/social.service';

@ApiTags('communauté')
@Controller('community')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  // ---------- Groupes d'étude ----------

  @OptionalAuth()
  @Get('groups')
  @ApiOperation({ summary: 'Groupes d’étude publics, plus les groupes privés dont on est membre' })
  groups(@CurrentUser() user: AuthenticatedUser | null): Promise<StudyGroupDto[]> {
    return this.social.groups(user);
  }

  @ApiBearerAuth()
  @Post('groups')
  @ApiOperation({ summary: 'Crée un groupe (public, ou privé avec code d’invitation). 409 au-delà de 5 groupes animés' })
  createGroup(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<{ id: string }> {
    return this.social.createGroup(user, parse(CreateGroupSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Post('groups/join')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rejoint un groupe privé avec son code : { code }' })
  joinByCode(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<StudyGroupDetailDto> {
    return this.social.joinByCode(user, parse(JoinByCodeSchema, body ?? {}).code);
  }

  @OptionalAuth()
  @Get('groups/:id')
  @ApiOperation({ summary: 'Un groupe ; les membres ne sont listés que pour les membres. 404 pour un groupe privé dont on n’est pas membre' })
  group(@CurrentUser() user: AuthenticatedUser | null, @Param('id') id: string): Promise<StudyGroupDetailDto> {
    return this.social.group(id, user);
  }

  @ApiBearerAuth()
  @Post('groups/:id/join')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rejoint un groupe public. 409 s’il est complet' })
  join(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<StudyGroupDetailDto> {
    return this.social.join(user, id);
  }

  @ApiBearerAuth()
  @Post('groups/:id/leave')
  @HttpCode(200)
  @ApiOperation({ summary: 'Quitte le groupe. Si le responsable part, le membre le plus ancien reprend ; seul, le groupe est fermé' })
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<{ closed: boolean }> {
    return this.social.leave(user, id);
  }

  @ApiBearerAuth()
  @Get('groups/:id/messages')
  @ApiOperation({ summary: 'Messages du groupe (membres seulement)' })
  groupMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.social.messages(user, 'group', id);
  }

  @ApiBearerAuth()
  @Post('groups/:id/messages')
  @ApiOperation({ summary: 'Écrit dans le groupe : { bodyMd }' })
  postGroup(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.social.post(user, 'group', id, parse(MessageSchema, body ?? {}).bodyMd);
  }

  // ---------- Mentorat ----------

  @OptionalAuth()
  @Get('mentors')
  @ApiOperation({ summary: 'Mentors déclarés, disponibles d’abord ; filtre ?topic=' })
  mentors(@Query('topic') topic?: string): Promise<MentorDto[]> {
    return this.social.mentors(topic ? String(topic).slice(0, 40) : null);
  }

  @ApiBearerAuth()
  @Put('mentors/me')
  @ApiOperation({ summary: 'Crée ou met à jour son profil de mentor (rôle « mentor »)' })
  saveProfile(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<MentorDto> {
    return this.social.saveMentorProfile(user, parse(MentorProfileSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Get('mentorships')
  @ApiOperation({ summary: 'Mes mentorats (comme mentor ou apprenant) et mon profil de mentor' })
  mentorships(@CurrentUser() user: AuthenticatedUser) {
    return this.social.mentorships(user);
  }

  @ApiBearerAuth()
  @Post('mentorships')
  @ApiOperation({ summary: 'Demande un mentorat : { mentorUserId, topic, message }. 409 avec la raison si impossible' })
  request(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<MentorshipDto> {
    return this.social.requestMentorship(user, parse(MentorshipRequestSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Post('mentorships/:id/action')
  @HttpCode(200)
  @ApiOperation({ summary: '{ action: accept | decline | end } : le mentor accepte ou refuse, l’apprenant peut retirer sa demande, l’un ou l’autre met fin' })
  act(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown): Promise<MentorshipDto> {
    return this.social.act(user, id, parse(MentorshipActionSchema, body ?? {}).action);
  }

  @ApiBearerAuth()
  @Get('mentorships/:id/messages')
  @ApiOperation({ summary: 'Échanges du binôme (les deux participants seulement)' })
  mentorshipMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.social.messages(user, 'mentorship', id);
  }

  @ApiBearerAuth()
  @Post('mentorships/:id/messages')
  @ApiOperation({ summary: 'Écrit au binôme pendant un mentorat actif : { bodyMd }' })
  postMentorship(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.social.post(user, 'mentorship', id, parse(MessageSchema, body ?? {}).bodyMd);
  }

  @ApiBearerAuth()
  @Post('messages/:id/hide')
  @HttpCode(200)
  @ApiOperation({ summary: 'Masque un message (son auteur, le responsable du groupe ou un modérateur)' })
  hide(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<{ hidden: true }> {
    return this.social.hide(user, id);
  }
}
