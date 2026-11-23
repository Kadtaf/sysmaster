import type { Pool } from 'pg';

/**
 * Parcours de test contenant le seul cours linux-systemd (3 leçons de démo).
 * Les vrais parcours évoluent avec le contenu : les tests de progression ne doivent pas en dépendre.
 * Un slug par suite, car les suites tournent en parallèle.
 */
export async function createSystemdPath(pool: Pool, slug: string): Promise<string> {
  await pool.query(
    `WITH p AS (
       INSERT INTO learning.learning_paths (slug, title, summary, career_code, difficulty, est_hours, status)
       VALUES ($1, 'Parcours de test systemd', 'Fixture de test', 'sysadmin', 'beginner', 1, 'published')
       ON CONFLICT (slug) DO UPDATE SET status = 'published' RETURNING id)
     INSERT INTO learning.path_courses (path_id, course_id, position)
     SELECT p.id, c.id, 1 FROM p, learning.courses c WHERE c.slug = 'linux-systemd'
     ON CONFLICT DO NOTHING`,
    [slug],
  );
  return slug;
}

export async function dropPath(pool: Pool, slug: string) {
  await pool.query(`DELETE FROM learning.enrollments WHERE path_id IN (SELECT id FROM learning.learning_paths WHERE slug = $1)`, [slug]);
  await pool.query(`DELETE FROM learning.learning_paths WHERE slug = $1`, [slug]);
}
