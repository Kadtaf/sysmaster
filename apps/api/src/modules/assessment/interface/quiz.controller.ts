import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuizAttemptSchema, type PracticeQuizDto, type QuizAttemptResultDto, type QuizSummaryDto } from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, OptionalAuth, Public } from '../../iam/interface/auth.decorators';
import { PracticeService } from '../application/practice.service';

@ApiTags('assessment')
@Controller('quizzes')
export class QuizController {
  constructor(private readonly practice: PracticeService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Quiz d’entraînement liés à une fiche : ?command=<identifiant de la fiche>' })
  list(@Query('command') command = ''): Promise<QuizSummaryDto[]> {
    return this.practice.forCommand(command);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Un quiz d’entraînement, sans les réponses' })
  get(@Param('slug') slug: string): Promise<PracticeQuizDto> {
    return this.practice.get(slug);
  }

  @OptionalAuth()
  @Post(':slug/attempts')
  @HttpCode(200)
  @ApiOperation({ summary: 'Corrige une tentative : score, bonnes réponses et explications ; enregistrée si l’apprenant est connecté' })
  attempt(@CurrentUser() user: AuthenticatedUser | null, @Param('slug') slug: string, @Body() body: unknown): Promise<QuizAttemptResultDto> {
    return this.practice.attempt(user, slug, parse(QuizAttemptSchema, body ?? {}));
  }
}
