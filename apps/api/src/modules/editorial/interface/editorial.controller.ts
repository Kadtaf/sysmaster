import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CONTENT_KINDS, CreateRevisionSchema, REVISION_STATUSES, ReviewDecisionSchema, type ContentKind, type RevisionStatus } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, Roles } from '../../iam/interface/auth.decorators';
import { EditorialService, parse } from '../application/editorial.service';

/**
 * Back-office éditorial (fiches, cours, parcours, causes de diagnostic) : brouillon → relecture → publication.
 * Les rôles ouvrent la porte ; les règles fines (auteur, quatre yeux, état) sont dans le domaine.
 */
@ApiTags('editorial')
@ApiBearerAuth()
@Roles('author', 'reviewer', 'admin')
@Controller('editorial/revisions')
export class EditorialController {
  constructor(private readonly editorial: EditorialService) {}

  @Get()
  @ApiOperation({ summary: 'Révisions : toutes pour un relecteur, les siennes pour un auteur' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string, @Query('kind') kind?: string) {
    if (status && !REVISION_STATUSES.includes(status as RevisionStatus)) throw new BadRequestException('Statut inconnu');
    if (kind && !CONTENT_KINDS.includes(kind as ContentKind)) throw new BadRequestException('Type de contenu inconnu');
    return this.editorial.list(user, { status: status as RevisionStatus | undefined, kind: kind as ContentKind | undefined });
  }

  @Post()
  @ApiOperation({ summary: 'Nouveau contenu, ou modification d’un contenu publié : { kind, from? }' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { kind, from, fromSlug } = parse(CreateRevisionSchema, body ?? {});
    return this.editorial.create(user, kind, from ?? fromSlug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Révision, écarts à la règle P-1, actions permises, historique' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.editorial.get(id, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Enregistrer le brouillon (auteur ; incomplet accepté)' })
  save(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.editorial.save(id, user, body);
  }

  @Get(':id/simulation')
  @ApiOperation({ summary: 'Causes de diagnostic : rejoue les cas de référence avec et sans la modification' })
  simulation(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.editorial.simulate(id, user);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soumettre à la relecture ; 422 avec la liste des manques si la fiche est incomplète' })
  submit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.editorial.submit(id, user);
  }

  @Post(':id/review')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approuver (publie) ou demander des changements (commentaire obligatoire) ; jamais sa propre révision' })
  review(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { decision, comment } = parse(ReviewDecisionSchema, body);
    return this.editorial.review(id, user, decision, comment);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retirer une révision non publiée (auteur ou administrateur)' })
  withdraw(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.editorial.withdraw(id, user);
  }
}
