import { Injectable } from '@nestjs/common';
import type { EnrollmentDto, LearningPathSummary, LessonCompletedV1, PathCompletedV1 } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { AcademyRepository, CourseOutline, NextLesson, PathRecord, SkillProgress } from '../application/ports';
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

  async skillProgress(userId: string): Promise<SkillProgress[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `WITH scope AS (
         SELECT DISTINCT l.id FROM learning.lessons l
           JOIN learning.modules m ON m.id = l.module_id
           JOIN learning.path_courses pc ON pc.course_id = m.course_id
          WHERE NOT EXISTS (SELECT 1 FROM learning.enrollments WHERE user_id = $1)
             OR pc.path_id IN (SELECT path_id FROM learning.enrollments WHERE user_id = $1)
       )
       SELECT s.code, s.name, s.platform::text AS platform,
              count(DISTINCT ls.lesson_id)::int AS total,
              count(DISTINCT lp.lesson_id)::int AS done
         FROM skills.skills s
         JOIN learning.lesson_skills ls ON ls.skill_id = s.id AND ls.lesson_id IN (SELECT id FROM scope)
         LEFT JOIN learning.lesson_progress lp
           ON lp.lesson_id = ls.lesson_id AND lp.user_id = $1 AND lp.status = 'completed'
        GROUP BY s.id ORDER BY s.name`,
      [userId],
    );
    return rows.map((r) => ({ code: r.code, name: r.name, platform: r.platform, totalLessons: r.total, completedLessons: r.done }));
  }

  async nextLessons(userId: string): Promise<NextLesson[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT DISTINCT ON (e.path_id)
              p.slug AS path_slug, p.title AS path_title, co.slug AS course_slug, l.slug AS lesson_slug, l.title AS lesson_title
         FROM learning.enrollments e
         JOIN learning.learning_paths p ON p.id = e.path_id
         JOIN learning.path_courses pc ON pc.path_id = e.path_id
         JOIN learning.courses co ON co.id = pc.course_id
         JOIN learning.modules m ON m.course_id = co.id
         JOIN learning.lessons l ON l.module_id = m.id
         LEFT JOIN learning.lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = e.user_id AND lp.status = 'completed'
        WHERE e.user_id = $1 AND e.completed_at IS NULL AND lp.lesson_id IS NULL
        ORDER BY e.path_id, pc.position, m.position, l.position`,
      [userId],
    );
    return rows.map((r) => ({
      pathSlug: r.path_slug, pathTitle: r.path_title, courseSlug: r.course_slug, lessonSlug: r.lesson_slug, lessonTitle: r.lesson_title,
    }));
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
      const minutes = await tx.query<{ est_minutes: number | null }>('SELECT est_minutes FROM learning.lessons WHERE id = $1', [lessonId]);
      const event: LessonCompletedV1 = {
        userId,
        lessonId,
        courseId,
        completedAt: rows[0].completed_at.toISOString(),
        estMinutes: minutes.rows[0]?.est_minutes ?? null,
      };
      await tx.query(
        `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
         VALUES ('learning.lesson_progress', $1, 'learning.lesson.completed.v1', $2)`,
        [lessonId, JSON.stringify(event)],
      );
      return { alreadyCompleted: false };
    });
  }

  /**
   * Recalcule la progression des inscrits quand le contenu d'un cours ou d'un parcours change
   * (leçon ajoutée ou retirée, cours ajouté au parcours). Appelé par le consommateur d'événements.
   */
  async recomputeEnrolled(tx: PoolClient, target: { courseId: string } | { pathId: string }): Promise<number> {
    const { rows } = await tx.query<{ user_id: string }>(
      'courseId' in target
        ? `SELECT DISTINCT e.user_id FROM learning.enrollments e JOIN learning.path_courses pc ON pc.path_id = e.path_id WHERE pc.course_id = $1`
        : `SELECT DISTINCT user_id FROM learning.enrollments WHERE path_id = $1`,
      ['courseId' in target ? target.courseId : target.pathId],
    );
    for (const r of rows) await this.recomputeProgress(tx, r.user_id);
    return rows.length;
  }

  /**
   * Progression de chaque parcours de l'utilisateur = leçons validées / leçons du parcours.
   * Un parcours qui passe à 100 % publie learning.path.completed.v1 (une seule fois), que ce soit
   * en validant une leçon ou en s'inscrivant à un parcours dont toutes les leçons sont déjà faites.
   */
  private async recomputeProgress(tx: PoolClient, userId: string): Promise<void> {
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
      const updated = await tx.query<{ was_completed: boolean }>(
        `UPDATE learning.enrollments e
            SET progress_pct = $3::numeric,
                completed_at = CASE WHEN $3::numeric >= 100 THEN coalesce(e.completed_at, now()) ELSE NULL END
           FROM (SELECT completed_at IS NOT NULL AS was_completed FROM learning.enrollments
                  WHERE user_id = $1 AND path_id = $2 FOR UPDATE) old
          WHERE e.user_id = $1 AND e.path_id = $2
          RETURNING old.was_completed`,
        [userId, r.path_id, pct],
      );
      if (pct >= 100 && updated.rows[0] && !updated.rows[0].was_completed) {
        const event: PathCompletedV1 = { userId, pathId: r.path_id };
        await tx.query(
          `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
           VALUES ('learning.enrollment', $1, 'learning.path.completed.v1', $2)`,
          [r.path_id, JSON.stringify(event)],
        );
      }
    }
  }
}
