import { Injectable } from '@nestjs/common';
import type { EnrollmentDto, LearningPathSummary, LessonCompletedV1 } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { AcademyRepository, CourseOutline, PathRecord } from '../application/ports';
import { progressPct } from '../domain/progression';

const DIFFICULTY_ORDER = `array_position(ARRAY['beginner','intermediate','advanced','expert'], p.difficulty::text)`;

@Injectable()
export class PgAcademyRepository extends AcademyRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async listPaths(): Promise<LearningPathSummary[]> {
    const { rows } = await this.db.query<LearningPathSummary & Record<string, unknown>>(
      `SELECT p.slug, p.title, p.summary, c.name AS career, p.difficulty::text AS difficulty,
              p.est_hours AS "estHours", count(pc.course_id)::int AS "courseCount"
         FROM learning.learning_paths p
         LEFT JOIN learning.careers c ON c.code = p.career_code
         LEFT JOIN learning.path_courses pc ON pc.path_id = p.id
        WHERE p.status = 'published'
        GROUP BY p.id, c.name
        ORDER BY ${DIFFICULTY_ORDER}, p.title`,
    );
    return rows;
  }

  async findPath(slug: string): Promise<PathRecord | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT p.id, p.slug, p.title, p.summary, c.name AS career, p.difficulty::text AS difficulty, p.est_hours
         FROM learning.learning_paths p LEFT JOIN learning.careers c ON c.code = p.career_code
        WHERE p.slug = $1 AND p.status = 'published'`,
      [slug],
    );
    const p = rows[0];
    if (!p) return null;
    const courses = await this.db.query<Record<string, any>>(
      `SELECT co.id, co.slug, co.title, co.summary, co.platform::text AS platform, co.difficulty::text AS difficulty,
              co.is_premium,
              coalesce(array_agg(l.id ORDER BY m.position, l.position) FILTER (WHERE l.id IS NOT NULL), '{}') AS lesson_ids
         FROM learning.path_courses pc
         JOIN learning.courses co ON co.id = pc.course_id AND co.status = 'published'
         LEFT JOIN learning.modules m ON m.course_id = co.id
         LEFT JOIN learning.lessons l ON l.module_id = m.id
        WHERE pc.path_id = $1
        GROUP BY co.id, pc.position ORDER BY pc.position`,
      [p.id],
    );
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      career: p.career,
      difficulty: p.difficulty,
      estHours: p.est_hours,
      courseCount: courses.rowCount ?? 0,
      courses: courses.rows.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        platform: c.platform,
        difficulty: c.difficulty,
        isPremium: c.is_premium,
        lessonIds: c.lesson_ids,
      })),
    };
  }

  async findCourseOutline(by: { slug: string } | { lessonId: string }): Promise<CourseOutline | null> {
    const where = 'slug' in by
      ? `co.slug = $1`
      : `co.id = (SELECT m.course_id FROM learning.lessons l JOIN learning.modules m ON m.id = l.module_id WHERE l.id = $1::uuid)`;
    const value = 'slug' in by ? by.slug : by.lessonId;
    if (!('slug' in by) && !/^[0-9a-f-]{36}$/i.test(value)) return null;

    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT co.id, co.slug, co.title, co.summary, co.platform::text AS platform, co.difficulty::text AS difficulty,
              co.is_premium, m.title AS module_title, m.position AS module_position,
              l.id AS lesson_id, l.slug AS lesson_slug, l.title AS lesson_title, l.type AS lesson_type, l.est_minutes
         FROM learning.courses co
         LEFT JOIN learning.modules m ON m.course_id = co.id
         LEFT JOIN learning.lessons l ON l.module_id = m.id
        WHERE ${where} AND co.status = 'published'
        ORDER BY m.position, l.position`,
      [value],
    );
    if (!rows.length) return null;
    const first = rows[0];
    const modules: CourseOutline['modules'] = [];
    for (const r of rows) {
      if (r.module_title == null) continue;
      let mod = modules[modules.length - 1];
      if (!mod || mod.title !== r.module_title) {
        mod = { title: r.module_title, lessons: [] };
        modules.push(mod);
      }
      if (r.lesson_id) {
        mod.lessons.push({ id: r.lesson_id, slug: r.lesson_slug, title: r.lesson_title, type: r.lesson_type, estMinutes: r.est_minutes });
      }
    }
    return {
      id: first.id,
      slug: first.slug,
      title: first.title,
      summary: first.summary,
      platform: first.platform,
      difficulty: first.difficulty,
      isPremium: first.is_premium,
      modules,
    };
  }

  async findLessonContent(lessonId: string) {
    const { rows } = await this.db.query<{ content_md: string | null; objectives: string[] }>(
      'SELECT content_md, objectives FROM learning.lessons WHERE id = $1',
      [lessonId],
    );
    return rows[0] ? { contentMd: rows[0].content_md ?? '', objectives: rows[0].objectives } : null;
  }

  async completedLessonIds(userId: string, lessonIds: string[]): Promise<Set<string>> {
    if (!lessonIds.length) return new Set();
    const { rows } = await this.db.query<{ lesson_id: string }>(
      `SELECT lesson_id FROM learning.lesson_progress
        WHERE user_id = $1 AND status = 'completed' AND lesson_id = ANY($2::uuid[])`,
      [userId, lessonIds],
    );
    return new Set(rows.map((r) => r.lesson_id));
  }

  async enrollmentsOf(userId: string): Promise<EnrollmentDto[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT p.slug, p.title, e.progress_pct, e.started_at, e.completed_at
         FROM learning.enrollments e JOIN learning.learning_paths p ON p.id = e.path_id
        WHERE e.user_id = $1 ORDER BY e.started_at`,
      [userId],
    );
    return rows.map((r) => ({
      pathSlug: r.slug,
      pathTitle: r.title,
      progressPct: Number(r.progress_pct),
      startedAt: r.started_at.toISOString(),
      completedAt: r.completed_at?.toISOString() ?? null,
    }));
  }

  enroll(userId: string, pathId: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO learning.enrollments (user_id, path_id) VALUES ($1, $2) ON CONFLICT (user_id, path_id) DO NOTHING`,
        [userId, pathId],
      );
      await this.recomputeProgress(tx, userId);
    });
  }

  recordCompletion(userId: string, lessonId: string, courseId: string) {
    return this.db.transaction(async (tx) => {
      // Atomique : la clause WHERE n'écrit (et ne renvoie une ligne) que si la leçon n'était pas
      // déjà validée. Deux clics simultanés ne produisent donc qu'un seul événement.
      const { rows } = await tx.query<{ completed_at: Date }>(
        `INSERT INTO learning.lesson_progress (user_id, lesson_id, status, completed_at)
         VALUES ($1, $2, 'completed', now())
         ON CONFLICT (user_id, lesson_id) DO UPDATE
           SET status = 'completed', completed_at = now()
           WHERE learning.lesson_progress.status <> 'completed'
         RETURNING completed_at`,
        [userId, lessonId],
      );
      if (!rows.length) return { alreadyCompleted: true };

      await this.recomputeProgress(tx, userId);
      const event: LessonCompletedV1 = { userId, lessonId, courseId, completedAt: rows[0].completed_at.toISOString() };
      await tx.query(
        `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
         VALUES ('learning.lesson_progress', $1, 'learning.lesson.completed.v1', $2)`,
        [lessonId, JSON.stringify(event)],
      );
      return { alreadyCompleted: false };
    });
  }

  /** Progression de chaque parcours de l'utilisateur = leçons validées / leçons du parcours. */
  private async recomputeProgress(tx: PoolClient, userId: string) {
    const { rows } = await tx.query<{ path_id: string; total: number; done: number }>(
      `SELECT e.path_id, count(l.id)::int AS total,
              count(lp.lesson_id) FILTER (WHERE lp.status = 'completed')::int AS done
         FROM learning.enrollments e
         JOIN learning.path_courses pc ON pc.path_id = e.path_id
         JOIN learning.modules m ON m.course_id = pc.course_id
         JOIN learning.lessons l ON l.module_id = m.id
         LEFT JOIN learning.lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = e.user_id
        WHERE e.user_id = $1
        GROUP BY e.path_id`,
      [userId],
    );
    for (const r of rows) {
      const pct = progressPct(r.total, r.done);
      await tx.query(
        `UPDATE learning.enrollments
            SET progress_pct = $3::numeric,
                completed_at = CASE WHEN $3::numeric >= 100 THEN coalesce(completed_at, now()) ELSE NULL END
          WHERE user_id = $1 AND path_id = $2`,
        [userId, r.path_id, pct],
      );
    }
  }
}
