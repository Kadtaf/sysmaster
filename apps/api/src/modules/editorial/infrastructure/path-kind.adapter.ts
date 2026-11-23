import { Injectable } from '@nestjs/common';
import { PathContentSchema, type ContentIssue, type PathContent } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { ContentKindAdapter, KeyTakenError, Schema } from '../application/ports';
import { pathIssues } from '../domain/path-rules';
import { isUniqueViolation } from './pg-revision.repository';

/** Parcours (schéma learning) : présentation et suite ordonnée de cours. */
@Injectable()
export class PathKindAdapter implements ContentKindAdapter<PathContent> {
  readonly kind = 'path' as const;
  readonly schema: Schema<PathContent> = PathContentSchema;
  readonly noun = 'parcours';
  readonly publishedEvent = 'learning.path.published.v1';

  constructor(private readonly db: Database) {}

  blank = (): PathContent => ({ slug: '', title: '', summary: '', career: null, difficulty: 'beginner', estHours: null, courses: [] });
  key = (c: PathContent) => c.slug;
  title = (c: PathContent) => c.title;

  async issues(c: PathContent): Promise<ContentIssue[]> {
    const courses = await this.db.query<{ slug: string }>(`SELECT slug FROM learning.courses WHERE status = 'published'`);
    const careers = await this.db.query<{ code: string }>(`SELECT code FROM learning.careers`);
    return pathIssues(c, { knownCourses: new Set(courses.rows.map((r) => r.slug)), knownCareers: new Set(careers.rows.map((r) => r.code)) });
  }

  async published(slug: string): Promise<{ targetId: string; content: PathContent } | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT p.id, p.slug, p.title, p.summary, p.career_code, p.difficulty::text AS difficulty, p.est_hours,
              coalesce((SELECT json_agg(c.slug ORDER BY pc.position) FROM learning.path_courses pc
                          JOIN learning.courses c ON c.id = pc.course_id WHERE pc.path_id = p.id), '[]') AS courses
         FROM learning.learning_paths p WHERE p.slug = $1 AND p.status = 'published'`,
      [slug],
    );
    const p = rows[0];
    if (!p) return null;
    return {
      targetId: p.id,
      content: {
        slug: p.slug, title: p.title, summary: p.summary, career: p.career_code, difficulty: p.difficulty, estHours: p.est_hours, courses: p.courses,
      },
    };
  }

  async apply(tx: PoolClient, c: PathContent, targetId: string | null): Promise<string> {
    let pathId = targetId;
    const values = [c.slug, c.title, c.summary, c.career, c.difficulty, c.estHours];
    try {
      if (pathId) {
        await tx.query(
          `UPDATE learning.learning_paths SET slug = $1, title = $2, summary = $3, career_code = $4, difficulty = $5::platform.difficulty,
                  est_hours = $6, status = 'published' WHERE id = $7`,
          [...values, pathId],
        );
      } else {
        pathId = (
          await tx.query<{ id: string }>(
            `INSERT INTO learning.learning_paths (slug, title, summary, career_code, difficulty, est_hours, status)
             VALUES ($1, $2, $3, $4, $5::platform.difficulty, $6, 'published') RETURNING id`,
            values,
          )
        ).rows[0].id;
      }
    } catch (err) {
      if (isUniqueViolation(err, 'learning_paths_slug_key')) throw new KeyTakenError();
      throw err;
    }
    await tx.query(`DELETE FROM learning.path_courses WHERE path_id = $1`, [pathId]);
    await tx.query(
      `INSERT INTO learning.path_courses (path_id, course_id, position)
       SELECT $1, c.id, x.ord - 1 FROM unnest($2::text[]) WITH ORDINALITY AS x(slug, ord) JOIN learning.courses c ON c.slug = x.slug`,
      [pathId, c.courses],
    );
    return pathId!;
  }
}
