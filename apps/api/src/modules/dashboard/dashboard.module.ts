import { Controller, Get, Module } from '@nestjs/common';
import { CqrsModule, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DashboardDto, EnrollmentDto, RecommendationDto } from '@sysmaster/contracts';
import type { GamificationProfile } from '../gamification/application/ports';
import { GetGamificationProfileQuery } from '../gamification/application/queries';
import type { AuthenticatedUser } from '../iam/domain/identity';
import { CurrentUser } from '../iam/interface/auth.decorators';
import type { NextLesson, SkillProgress } from '../learning/application/ports';
import { MyEnrollmentsQuery, NextLessonsQuery, SkillProgressQuery } from '../learning/application/queries';

/**
 * Tableau de bord : composition côté lecture (BFF). Il n'a pas de données propres : il interroge
 * les autres contextes par leurs requêtes publiques (QueryBus), sans toucher à leurs tables.
 * C'est l'emplacement naturel du futur résolveur GraphQL.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('me/dashboard')
export class DashboardController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'Progression, compétences, points forts et faibles, recommandations, XP et badges' })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<DashboardDto> {
    const [gamification, enrollments, skills, nextLessons] = await Promise.all([
      this.queries.execute<GetGamificationProfileQuery, GamificationProfile>(new GetGamificationProfileQuery(user.id)),
      this.queries.execute<MyEnrollmentsQuery, EnrollmentDto[]>(new MyEnrollmentsQuery(user.id)),
      this.queries.execute<SkillProgressQuery, SkillProgress[]>(new SkillProgressQuery(user.id)),
      this.queries.execute<NextLessonsQuery, NextLesson[]>(new NextLessonsQuery(user.id)),
    ]);
    const scored = skills.map((s) => ({ ...s, pct: s.totalLessons ? Math.round((100 * s.completedLessons) / s.totalLessons) : 0 }));
    const started = scored.some((s) => s.completedLessons > 0);
    return {
      gamification,
      enrollments,
      skills: scored,
      // Points forts : compétences bien avancées. Points faibles : les moins avancées, une fois l'apprentissage commencé.
      strengths: scored.filter((s) => s.pct >= 60).sort((a, b) => b.pct - a.pct).slice(0, 3),
      weaknesses: started ? scored.filter((s) => s.pct < 50).sort((a, b) => a.pct - b.pct).slice(0, 3) : [],
      recommendations: buildRecommendations(enrollments, nextLessons),
    };
  }
}

/** Recommandations v1, à base de règles explicables (l'agent Tuteur les enrichira en Phase 3). */
export function buildRecommendations(enrollments: EnrollmentDto[], next: NextLesson[]): RecommendationDto[] {
  if (enrollments.length === 0) {
    return [{ kind: 'start', text: 'Choisissez un parcours adapté à votre objectif métier.', href: '/parcours' }];
  }
  return next.map((n) => ({
    kind: 'continue',
    text: `Continuer « ${n.pathTitle} » : ${n.lessonTitle}`,
    href: `/cours/${n.courseSlug}/${n.lessonSlug}`,
  }));
}

@Module({ imports: [CqrsModule], controllers: [DashboardController] })
export class DashboardModule {}
