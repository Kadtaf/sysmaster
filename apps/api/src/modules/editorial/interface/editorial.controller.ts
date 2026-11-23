import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandContentSchema, CreateRevisionSchema, REVISION_STATUSES, ReviewDecisionSchema, type RevisionStatus } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, Roles } from '../../iam/interface/auth.decorators';
import { EditorialService } from '../application/editorial.service';

/** Forme minimale d'un schéma zod (le paquet zod est une dépendance des contrats, pas de l'API). */
interface Schema<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
}

function parse<T>(schema: Schema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Données invalides',
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  return parsed.data;
}

/**
 * Back-office éditorial des fiches commandes : brouillon → relecture → publication.
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
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    if (status && !REVISION_STATUSES.includes(status as RevisionStatus)) throw new BadRequestException('Statut inconnu');
    return this.editorial.list(user, status as RevisionStatus | undefined);
  }

  @Post()
  @ApiOperation({ summary: 'Nouvelle fiche, ou modification d’une fiche publiée (fromSlug)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.editorial.create(user, parse(CreateRevisionSchema, body ?? {}).fromSlug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Révision, écarts à la règle P-1, actions permises, historique' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.editorial.get(id, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Enregistrer le brouillon (auteur ; incomplet accepté)' })
  save(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.editorial.save(id, user, parse(CommandContentSchema, body));
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
