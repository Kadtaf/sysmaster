import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AcceptSchema, CreateThreadSchema, EditThreadSchema, LockSchema, ModerationDecisionSchema, PostBodySchema, ReportSchema, ScriptReviewSchema,
  ThreadListQuerySchema, VoteSchema,
  type CommunityCategoryDto, type ModerationItemDto, type SimilarThreadDto, type ThreadDto, type ThreadListDto,
} from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, OptionalAuth, Public, Roles } from '../../iam/interface/auth.decorators';
import { CommunityService } from '../application/community.service';

@ApiTags('communauté')
@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Catégories du forum, avec le nombre de sujets visibles' })
  categories(): Promise<CommunityCategoryDto[]> {
    return this.community.categories();
  }

  @OptionalAuth()
  @Get('threads')
  @ApiOperation({ summary: 'Sujets : filtres catégorie, type, étiquette, recherche sans accents ; tri récent, mieux notés, sans réponse acceptée' })
  list(@CurrentUser() user: AuthenticatedUser | null, @Query() query: Record<string, string>): Promise<ThreadListDto> {
    return this.community.list(parse(ThreadListQuerySchema, query), user);
  }

  @Public()
  @Get('similar')
  @ApiOperation({ summary: 'Questions proches d’un texte, à proposer avant d’en publier une nouvelle' })
  similar(@Query('q') q = ''): Promise<SimilarThreadDto[]> {
    return this.community.similar(String(q).slice(0, 500));
  }

  @OptionalAuth()
  @Get('threads/:id')
  @ApiOperation({ summary: 'Un sujet et ses réponses (réponse acceptée en tête), avec ce que l’utilisateur peut faire' })
  get(@CurrentUser() user: AuthenticatedUser | null, @Param('id') id: string): Promise<ThreadDto> {
    return this.community.get(id, user);
  }

  @ApiBearerAuth()
  @Post('threads')
  @ApiOperation({ summary: 'Publie un sujet (question ou discussion). 429 au-delà de 5 sujets par heure' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<{ id: string }> {
    return this.community.create(user, parse(CreateThreadSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Put('threads/:id')
  @ApiOperation({ summary: 'Modifie un sujet (son auteur ou un modérateur)' })
  edit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown): Promise<ThreadDto> {
    return this.community.edit(user, id, parse(EditThreadSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Post('threads/:id/posts')
  @ApiOperation({ summary: 'Répond à un sujet. 403 si verrouillé ; 429 au-delà de 30 messages par heure' })
  reply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown): Promise<ThreadDto> {
    return this.community.reply(user, id, parse(PostBodySchema, body ?? {}).bodyMd);
  }

  @ApiBearerAuth()
  @Put('posts/:id')
  @ApiOperation({ summary: 'Modifie sa réponse' })
  editPost(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown): Promise<ThreadDto> {
    return this.community.editPost(user, id, parse(PostBodySchema, body ?? {}).bodyMd);
  }

  @ApiBearerAuth()
  @Put('threads/:id/vote')
  @ApiOperation({ summary: 'Vote sur un sujet : { value: 1 | 0 | -1 } (0 retire le vote). Pas de vote sur soi' })
  voteThread(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.community.vote(user, 'thread', id, parse(VoteSchema, body ?? {}).value);
  }

  @ApiBearerAuth()
  @Put('posts/:id/vote')
  @ApiOperation({ summary: 'Vote sur une réponse : { value: 1 | 0 | -1 }' })
  votePost(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.community.vote(user, 'post', id, parse(VoteSchema, body ?? {}).value);
  }

  @ApiBearerAuth()
  @Put('threads/:id/accepted')
  @ApiOperation({ summary: 'Choisit la réponse acceptée (auteur de la question) : { postId } ou { postId: null }. L’auteur de la réponse gagne l’XP d’entraide une fois par sujet' })
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown): Promise<ThreadDto> {
    return this.community.accept(user, id, parse(AcceptSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Put('threads/:id/script-review')
  @ApiOperation({ summary: 'Relit un script partagé : { reviewed }. Relecteurs, modérateurs, administrateurs ; jamais son auteur' })
  reviewScript(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown): Promise<ThreadDto> {
    return this.community.reviewScript(user, id, parse(ScriptReviewSchema, body ?? {}).reviewed);
  }

  @ApiBearerAuth()
  @Post('reports')
  @HttpCode(200)
  @ApiOperation({ summary: 'Signale un sujet ou une réponse. Trois personnes différentes : le contenu est masqué en attendant un modérateur' })
  report(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<{ reported: true }> {
    return this.community.report(user, parse(ReportSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Roles('moderator', 'admin')
  @Get('moderation')
  @ApiOperation({ summary: 'File de modération : contenus signalés, les plus signalés d’abord' })
  queue(): Promise<ModerationItemDto[]> {
    return this.community.moderationQueue();
  }

  @ApiBearerAuth()
  @Roles('moderator', 'admin')
  @Post('moderation')
  @HttpCode(200)
  @ApiOperation({ summary: 'Décision : masquer (signalements retenus), rétablir ou écarter les signalements' })
  decide(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<{ resolved: number }> {
    return this.community.decide(user, parse(ModerationDecisionSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Roles('moderator', 'admin')
  @Put('threads/:id/lock')
  @ApiOperation({ summary: 'Verrouille ou rouvre un sujet : { locked }' })
  lock(@Param('id') id: string, @Body() body: unknown): Promise<{ locked: boolean }> {
    return this.community.lock(id, parse(LockSchema, body ?? {}).locked);
  }
}
