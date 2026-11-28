import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailUnsubscribeSchema, NotificationPreferencesSchema } from '@sysmaster/contracts';
import type { NotificationListDto, NotificationPreferenceDto } from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, Public } from '../../iam/interface/auth.decorators';
import { LIMITS, RateLimit } from '../../../shared/security/rate-limit';
import { readUnsubscribeToken } from '../domain/email';
import { Mailer } from '../infrastructure/mailer';
import { PgNotificationRepository } from '../infrastructure/pg-notification.repository';

const PAGE = 50;

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationController {
  constructor(
    private readonly repo: PgNotificationRepository,
    private readonly mailer: Mailer,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mes 50 dernières notifications et le nombre de non lues' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<NotificationListDto> {
    return { ...(await this.repo.list(user.id, PAGE)), emailEnabled: this.mailer.enabled };
  }

  @Get('unread')
  @ApiOperation({ summary: 'Nombre de notifications non lues (pastille de l’en-tête)' })
  async unread(@CurrentUser() user: AuthenticatedUser): Promise<{ unread: number }> {
    return { unread: await this.repo.unread(user.id) };
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tout marquer comme lu' })
  async readAll(@CurrentUser() user: AuthenticatedUser): Promise<{ marked: number }> {
    return { marked: await this.repo.markRead(user.id, null) };
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marquer une notification comme lue (seulement les miennes)' })
  async read(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<{ marked: number }> {
    return { marked: await this.repo.markRead(user.id, id) };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Types de notifications reçus, par canal' })
  preferences(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPreferenceDto[]> {
    return this.repo.preferences(user.id);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Activer ou couper des types de notifications' })
  async setPreferences(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<NotificationPreferenceDto[]> {
    await this.repo.setPreferences(user.id, parse(NotificationPreferencesSchema, body ?? {}).preferences);
    return this.repo.preferences(user.id);
  }
}

/**
 * Désabonnement depuis un e-mail, sans connexion : le jeton signé dit qui et quel type. Accepte
 * aussi le « un clic » des messageries (RFC 8058 : POST avec le jeton dans l'adresse).
 */
@ApiTags('notifications')
@Controller('notifications')
export class EmailUnsubscribeController {
  constructor(
    private readonly repo: PgNotificationRepository,
    private readonly mailer: Mailer,
  ) {}

  @Public()
  @Post('unsubscribe')
  @HttpCode(200)
  @RateLimit(LIMITS.emailUnsubscribe)
  @ApiOperation({ summary: 'Ne plus recevoir un type d’e-mail (jeton du lien de l’e-mail, dans le corps ou l’adresse)' })
  async unsubscribe(@Query('token') queryToken: string | undefined, @Body() body: unknown): Promise<{ type: string }> {
    const raw = typeof (body as { token?: unknown })?.token === 'string' ? body : { token: queryToken ?? '' };
    const { token } = parse(EmailUnsubscribeSchema, raw);
    const who = this.mailer.linkSecret.length >= 32 ? readUnsubscribeToken(token, this.mailer.linkSecret) : null;
    if (!who) throw new BadRequestException('Lien de désabonnement invalide.');
    await this.repo.setPreferences(who.userId, [{ type: who.type, channel: 'email', enabled: false }]);
    return { type: who.type };
  }
}
