import { Body, Controller, Delete, Get, Header, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErasureRequestSchema } from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser } from '../../iam/interface/auth.decorators';
import { PrivacyService } from '../application/privacy.service';

@ApiTags('privacy')
@ApiBearerAuth()
@Controller('me/privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  @ApiOperation({ summary: 'Demande de suppression en cours et durées de conservation' })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.privacy.status(user.id);
  }

  @Get('export')
  @Header('content-disposition', 'attachment; filename="sysmaster-mes-donnees.json"')
  @Header('cache-control', 'no-store')
  @ApiOperation({ summary: 'Export de toutes mes données (droit d’accès et portabilité)' })
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.privacy.exportData(user.id);
  }

  @Post('erasure')
  @HttpCode(200)
  @ApiOperation({ summary: 'Demander la suppression du compte (exécutée après le délai de grâce)' })
  request(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.privacy.requestErasure(user.id, parse(ErasureRequestSchema, body).confirmation);
  }

  @Delete('erasure')
  @ApiOperation({ summary: 'Annuler la demande de suppression pendant le délai de grâce' })
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.privacy.cancelErasure(user.id);
  }
}
