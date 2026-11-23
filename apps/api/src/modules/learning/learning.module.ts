import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { LearningPathSummary } from '@sysmaster/contracts';
import { Database } from '../../shared/database.module';
import { Public } from '../iam/interface/auth.decorators';

/**
 * Module Learning, Phase 1 : lecture seule du catalogue, en architecture en couches simple.
 * Il passera en hexagonal (comme Diagnostic) en Phase 2, quand la progression arrivera.
 */
@Injectable()
export class LearningCatalog {
  constructor(private readonly db: Database) {}

  async listPaths(): Promise<LearningPathSummary[]> {
    const { rows } = await this.db.query<LearningPathSummary & Record<string, unknown>>(
      `SELECT p.slug, p.title, p.summary, c.name AS career, p.difficulty::text AS difficulty,
              p.est_hours AS "estHours", count(pc.course_id)::int AS "courseCount"
         FROM learning.learning_paths p
         LEFT JOIN learning.careers c ON c.code = p.career_code
         LEFT JOIN learning.path_courses pc ON pc.path_id = p.id
        WHERE p.status = 'published'
        GROUP BY p.id, c.name
        ORDER BY array_position(ARRAY['beginner','intermediate','advanced','expert'], p.difficulty::text), p.title`,
    );
    return rows;
  }
}

@ApiTags('learning')
@Public()
@Controller('learning')
export class LearningController {
  constructor(private readonly catalog: LearningCatalog) {}

  @Get('paths')
  paths() {
    return this.catalog.listPaths();
  }
}

@Module({ controllers: [LearningController], providers: [LearningCatalog] })
export class LearningModule {}
