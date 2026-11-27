import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationPreferencesSchema } from '@sysmaster/contracts';
import type { NotificationListDto, NotificationPreferenceDto } from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser } from '../../iam/interface/auth.decorators';
import { PgNotificationRepository } from '../infrastructure/pg-notification.repository';

const PAGE = 50;

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationController {
  constructor(private readonly repo: PgNotificationRepository) {}

  @Get()
  @ApiOperation({ summary: 'Mes 50 dernières notifications et le nombre de non lues' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<NotificationListDto> {
    return this.repo.list(user.id, PAGE);
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
