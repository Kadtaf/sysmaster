import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CommandDetail, CommandSummary } from '@sysmaster/contracts';
import { Public } from '../../iam/interface/auth.decorators';
import { GetCommandQuery, SearchCommandsQuery } from '../application/queries';

@ApiTags('knowledge-base')
@Public()
@Controller('kb/commands')
export class KnowledgeController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'Recherche de fiches commandes' })
  search(@Query('q') q?: string, @Query('platform') platform?: string): Promise<CommandSummary[]> {
    return this.queries.execute(new SearchCommandsQuery(q, platform));
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Fiche complète : pourquoi, comment, quand, risques, alternatives, sources' })
  get(@Param('slug') slug: string): Promise<CommandDetail> {
    return this.queries.execute(new GetCommandQuery(slug));
  }
}
