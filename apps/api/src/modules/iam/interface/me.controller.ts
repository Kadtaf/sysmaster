import { Controller, DefaultValuePipe, Get, NotFoundException, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRepository } from '../application/ports';
import type { AuthenticatedUser } from '../domain/identity';
import { CurrentUser, Roles } from './auth.decorators';

@ApiTags('iam')
@ApiBearerAuth()
@Controller()
export class MeController {
  constructor(private readonly users: UserRepository) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil, rôles et droits de l\'utilisateur connecté' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.users.getProfile(user.id);
    if (!profile) throw new NotFoundException();
    return profile;
  }

  @Get('admin/users')
  @Roles('admin', 'support')
  @ApiOperation({ summary: 'Liste des utilisateurs (admin, support)' })
  list(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.users.list(Math.min(Math.max(limit, 1), 200));
  }
}
