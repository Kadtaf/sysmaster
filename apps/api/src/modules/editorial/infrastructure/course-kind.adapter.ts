import { Injectable } from '@nestjs/common';
import { CourseContentSchema, type ContentIssue, type CourseContent } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { ContentKindAdapter, KeyTakenError, Schema } from '../application/ports';
import { courseIssues } from '../domain/course-rules';
import { isUniqueViolation } from './pg-revision.repository';

/**
 * Cours (schéma learning). Les leçons sont reconnues par leur identifiant d'URL : une leçon
 * modifiée ou déplacée garde son identifiant interne, et donc la progression des apprenants.
 */
@Injectable()
export class CourseKindAdapter implements ContentKindAdapter<CourseContent> {
  readonly kind = 'course' as const;
  readonly schema: Schema<CourseContent> = CourseContentSchema;
  readonly noun = 'cours';
  readonly publishedEvent = 'learning.course.published.v1';

  constructor(private readonly db: Database) {}

  blank = (): CourseContent => ({ slug: '', title: '', summary: '', platform: 'linux', difficulty: 'beginner', isPremium: false, modules: [] });
  key = (c: CourseContent) => c.slug;
  title = (c: CourseContent) => c.title;

  async issues(c: CourseContent, targetId: string | null): Promise<ContentIssue[]> {
    const skills = await this.db.query<{ code: string }>('SELECT code FROM skills.skills');
    const progress = targetId
      ? await this.db.query<{ slug: string; learners: number }>(
          `SELECT l.slug, count(DISTINCT lp.user_id)::int AS learners
             FROM learning.lessons l JOIN learning.modules m ON m.id = l.module_id
             JOIN learning.lesson_progress lp ON lp.lesson_id = l.id AND lp.status = 'completed'
            WHERE m.course_id = $1 GROUP BY l.slug`,
          [targetId],
        )
      : { rows: [] };
    return courseIssues(c, {
      knownSkills: new Set(skills.rows.map((r) => r.code)),
      lessonsWithProgress: new Map(progress.rows.map((r) => [r.slug, r.learners])),
    });
  }

  async published(slug: string): Promise<{ targetId: string; content: CourseContent } | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT c.id, c.slug, c.title, c.summary, c.platform::text AS platform, c.difficulty::text AS difficulty, c.is_premium,
              coalesce((
                SELECT json_agg(json_build_object(
                         'title', m.title,
                         'lessons', coalesce((
                           SELECT json_agg(json_build_object(
                                    'slug', l.slug, 'title', l.title, 'type', l.type, 'estMinutes', l.est_minutes,
                                    'objectives', l.objectives, 'contentMd', coalesce(l.content_md, ''),
                                    'skills', coalesce((SELECT json_agg(s.code ORDER BY s.code) FROM learning.lesson_skills ls
                                                          JOIN skills.skills s ON s.id = ls.skill_id WHERE ls.lesson_id = l.id), '[]'))
                                  ORDER BY l.position)
                             FROM learning.lessons l WHERE l.module_id = m.id), '[]'))
                       ORDER BY m.position)
                  FROM learning.modules m WHERE m.course_id = c.id), '[]') AS modules
         FROM learning.courses c WHERE c.slug = $1 AND c.status = 'published'`,
      [slug],
    );
    const c = rows[0];
    if (!c) return null;
    return {
      targetId: c.id,
      content: {
        slug: c.slug, title: c.title, summary: c.summary, platform: c.platform, difficulty: c.difficulty, isPremium: c.is_premium,
        modules: c.modules,
      },
    };
  }

  async apply(tx: PoolClient, c: CourseContent, targetId: string | null): Promise<string> {
    let courseId = targetId;
    try {
      const values = [c.slug, c.title, c.summary, c.platform, c.difficulty, c.isPremium];
      if (courseId) {
        await tx.query(
          `UPDATE learning.courses SET slug = $1, title = $2, summary = $3, platform = $4::platform.os_platform,
                  difficulty = $5::platform.difficulty, is_premium = $6, status = 'published' WHERE id = $7`,
          [...values, courseId],
        );
      } else {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO learning.courses (slug, title, summary, platform, difficulty, is_premium, status)
           VALUES ($1, $2, $3, $4::platform.os_platform, $5::platform.difficulty, $6, 'published') RETURNING id`,
          values,
        );
        courseId = rows[0].id;
      }
    } catch (err) {
      if (isUniqueViolation(err, 'courses_slug_key')) throw new KeyTakenError();
      throw err;
    }

    // Positions temporaires négatives : la réorganisation ne heurte pas les contraintes UNIQUE (…, position).
    await tx.query(`UPDATE learning.modules SET position = -position - 1 WHERE course_id = $1`, [courseId]);
    await tx.query(
      `UPDATE learning.lessons SET position = -position - 1 WHERE module_id IN (SELECT id FROM learning.modules WHERE course_id = $1)`,
      [courseId],
    );
    const existingModules = (
      await tx.query<{ id: string }>(`SELECT id FROM learning.modules WHERE course_id = $1 ORDER BY position DESC`, [courseId])
    ).rows.map((r) => r.id); // positions négatives : DESC redonne l'ordre d'origine
    const existingLessons = new Map(
      (
        await tx.query<{ id: string; slug: string }>(
          `SELECT l.id, l.slug FROM learning.lessons l JOIN learning.modules m ON m.id = l.module_id WHERE m.course_id = $1`,
          [courseId],
        )
      ).rows.map((r) => [r.slug, r.id]),
    );

    const keptModules: string[] = [];
    const keptLessons = new Set<string>();
    for (const [mi, m] of c.modules.entries()) {
      let moduleId = existingModules[mi];
      if (moduleId) {
        await tx.query(`UPDATE learning.modules SET title = $2, position = $3 WHERE id = $1`, [moduleId, m.title, mi]);
      } else {
        moduleId = (
          await tx.query<{ id: string }>(`INSERT INTO learning.modules (course_id, title, position) VALUES ($1, $2, $3) RETURNING id`, [
            courseId, m.title, mi,
          ])
        ).rows[0].id;
      }
      keptModules.push(moduleId);

      for (const [li, l] of m.lessons.entries()) {
        const fields = [moduleId, l.slug, l.title, l.type, l.contentMd, l.objectives, l.estMinutes, li];
        let lessonId = existingLessons.get(l.slug);
        if (lessonId) {
          await tx.query(
            `UPDATE learning.lessons SET module_id = $1, slug = $2, title = $3, type = $4, content_md = $5, objectives = $6,
                    est_minutes = $7, position = $8 WHERE id = $9`,
            [...fields, lessonId],
          );
        } else {
          lessonId = (
            await tx.query<{ id: string }>(
              `INSERT INTO learning.lessons (module_id, slug, title, type, content_md, objectives, est_minutes, position)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
              fields,
            )
          ).rows[0].id;
        }
        keptLessons.add(lessonId);
        await tx.query(`DELETE FROM learning.lesson_skills WHERE lesson_id = $1`, [lessonId]);
        await tx.query(
          `INSERT INTO learning.lesson_skills (lesson_id, skill_id) SELECT $1, id FROM skills.skills WHERE code = ANY($2::text[])`,
          [lessonId, l.skills],
        );
      }
    }

    // Leçons retirées du plan : les règles ont déjà refusé celles qu'un apprenant a validées.
    const removed = [...existingLessons.values()].filter((id) => !keptLessons.has(id));
    if (removed.length) await tx.query(`DELETE FROM learning.lessons WHERE id = ANY($1::uuid[])`, [removed]);
    await tx.query(`DELETE FROM learning.modules WHERE course_id = $1 AND NOT (id = ANY($2::uuid[]))`, [courseId, keptModules]);
    return courseId!;
  }
}
