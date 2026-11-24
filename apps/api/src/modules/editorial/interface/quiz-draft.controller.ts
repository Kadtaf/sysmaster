import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenerateQuizDraftSchema, type QuizDraftDto } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, Roles } from '../../iam/interface/auth.decorators';
import { parse } from '../application/editorial.service';
import { QuizDraftService } from '../application/quiz-draft.service';

@ApiTags('editorial')
@ApiBearerAuth()
@Roles('author', 'admin')
@Controller('editorial/quiz-drafts')
export class QuizDraftController {
  constructor(private readonly drafts: QuizDraftService) {}

  @Post()
  @ApiOperation({
    summary: 'Brouillon de quiz rédigé par l’IA à partir d’une fiche publiée : { commandSlug, count?, level? } → révision à relire (compte dans le quota IA)',
  })
  draft(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<QuizDraftDto> {
    return this.drafts.draft(user, parse(GenerateQuizDraftSchema, body ?? {}));
  }
}
