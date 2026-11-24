import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  LabCommandSchema,
  type LabCheckResultDto,
  type LabCommandResultDto,
  type LabDetailDto,
  type LabInstanceDto,
  type LabSummaryDto,
} from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, Public } from '../../iam/interface/auth.decorators';
import { LabsService } from '../application/labs.service';

@ApiTags('labs')
@Controller('labs')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Catalogue des labs publiés' })
  list(): Promise<LabSummaryDto[]> {
    return this.labs.list();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Énoncé d’un lab : objectifs et vérifications, sans indices ni solution' })
  detail(@Param('slug') slug: string): Promise<LabDetailDto> {
    return this.labs.detail(slug);
  }

  @Post(':slug/instances')
  @HttpCode(200)
  @ApiOperation({ summary: 'Démarre le lab ou reprend la session ouverte ; ?fresh=true repart d’une machine neuve' })
  start(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string, @Query('fresh') fresh?: string): Promise<LabInstanceDto> {
    return this.labs.start(user, slug, fresh === 'true');
  }
}

@ApiTags('labs')
@Controller('lab-instances')
export class LabInstancesController {
  constructor(private readonly labs: LabsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Session de lab : historique du terminal, indices déjà révélés, solution si résolu' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<LabInstanceDto> {
    return this.labs.get(user, id);
  }

  @Post(':id/commands')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exécute une commande sur la machine simulée' })
  command(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown): Promise<LabCommandResultDto> {
    return this.labs.command(user, id, parse(LabCommandSchema, body ?? {}).command);
  }

  @Post(':id/hints')
  @HttpCode(200)
  @ApiOperation({ summary: 'Révèle l’indice suivant (chaque indice réduit le score et l’XP)' })
  hint(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<LabInstanceDto> {
    return this.labs.hint(user, id);
  }

  @Post(':id/check')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vérifie la machine ; si tout passe, le lab est résolu et la solution expliquée' })
  check(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<LabCheckResultDto> {
    return this.labs.check(user, id);
  }
}
