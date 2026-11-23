import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CompleteLessonResult, CourseDetail, EnrollmentDto, LearningPathDetail, LearningPathSummary, LessonDetail,
} from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, OptionalAuth, Public } from '../../iam/interface/auth.decorators';
import { CompleteLessonCommand, EnrollCommand } from '../application/commands';
import { GetCourseQuery, GetLessonQuery, GetPathQuery, ListPathsQuery, MyEnrollmentsQuery } from '../application/queries';

@ApiTags('learning')
@ApiBearerAuth()
@Controller()
export class LearningController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get('learning/paths')
  @Public()
  paths(): Promise<LearningPathSummary[]> {
    return this.queries.execute(new ListPathsQuery());
  }

  @Get('learning/paths/:slug')
  @OptionalAuth()
  @ApiOperation({ summary: 'Parcours, ses cours et, si connecté, la progression' })
  path(@Param('slug') slug: string, @CurrentUser() user: AuthenticatedUser | null): Promise<LearningPathDetail> {
    return this.queries.execute(new GetPathQuery(slug, user?.id ?? null));
  }

  @Post('learning/paths/:slug/enroll')
  @HttpCode(200)
  @ApiOperation({ summary: 'S\'inscrire à un parcours (idempotent)' })
  enroll(@Param('slug') slug: string, @CurrentUser() user: AuthenticatedUser): Promise<EnrollmentDto> {
    return this.commands.execute(new EnrollCommand(slug, user.id));
  }

  @Get('learning/courses/:slug')
  @OptionalAuth()
  @ApiOperation({ summary: 'Plan du cours ; avec un compte, état de chaque leçon (validée, disponible, verrouillée)' })
  course(@Param('slug') slug: string, @CurrentUser() user: AuthenticatedUser | null): Promise<CourseDetail> {
    return this.queries.execute(new GetCourseQuery(slug, user?.id ?? null));
  }

  @Get('learning/courses/:course/lessons/:lesson')
  @OptionalAuth()
  @ApiOperation({ summary: 'Contenu d\'une leçon (lisible par tous)' })
  lesson(
    @Param('course') course: string,
    @Param('lesson') lesson: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<LessonDetail> {
    return this.queries.execute(new GetLessonQuery(course, lesson, user?.id ?? null));
  }

  @Post('learning/lessons/:id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Valider une leçon ; 409 si la leçon précédente n\'est pas validée' })
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<CompleteLessonResult> {
    return this.commands.execute(new CompleteLessonCommand(id, user.id));
  }

  @Get('me/learning')
  @ApiOperation({ summary: 'Parcours suivis par l\'utilisateur connecté' })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<EnrollmentDto[]> {
    return this.queries.execute(new MyEnrollmentsQuery(user.id));
  }
}
