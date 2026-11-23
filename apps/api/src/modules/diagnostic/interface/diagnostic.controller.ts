import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyzeRequestSchema, type AnalyzeResponse, type SymptomDto } from '@sysmaster/contracts';
import { AnalyzeProblemCommand } from '../application/analyze-problem.command';
import { ListSymptomsQuery } from '../application/list-symptoms.query';

@ApiTags('diagnostic')
@Controller('diagnostic')
export class DiagnosticController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get('symptoms')
  @ApiOperation({ summary: 'Symptômes connus pour une plateforme' })
  symptoms(@Query('platform') platform = 'windows'): Promise<SymptomDto[]> {
    return this.queries.execute(new ListSymptomsQuery(platform));
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyse un problème et renvoie les causes probables expliquées' })
  analyze(@Body() body: unknown): Promise<AnalyzeResponse> {
    const parsed = AnalyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    }
    // Phase 2 : userId issu du jeton OIDC.
    return this.commands.execute(new AnalyzeProblemCommand(parsed.data, null));
  }
}
