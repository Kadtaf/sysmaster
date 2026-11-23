import { Body, Controller, DefaultValuePipe, Get, HttpCode, ParseIntPipe, Put, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, OptionalAuth } from '../../iam/interface/auth.decorators';
import { GamificationReadRepository } from '../application/ports';
import { GetLeaderboardQuery } from '../application/queries';

@ApiTags('gamification')
@ApiBearerAuth()
@Controller()
export class GamificationController {
  constructor(
    private readonly queries: QueryBus,
    private readonly repo: GamificationReadRepository,
  ) {}

  @Get('gamification/leaderboard')
  @OptionalAuth()
  @ApiOperation({ summary: 'Classement par XP (noms abrégés) ; avec un compte, inclut votre rang' })
  leaderboard(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number, @CurrentUser() user: AuthenticatedUser | null) {
    return this.queries.execute(new GetLeaderboardQuery(Math.min(Math.max(limit, 1), 100), user?.id ?? null));
  }

  @Put('me/leaderboard-visibility')
  @HttpCode(204)
  @ApiOperation({ summary: 'Apparaître ou non dans le classement' })
  async visibility(@Body() body: { visible?: unknown }, @CurrentUser() user: AuthenticatedUser) {
    await this.repo.setLeaderboardVisibility(user.id, body?.visible !== false);
  }
}
