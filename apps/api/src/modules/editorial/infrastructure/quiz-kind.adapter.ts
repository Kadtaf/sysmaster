import { Injectable } from '@nestjs/common';
import { QuizContentSchema, type ContentIssue, type QuizContent } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { ContentKindAdapter, KeyTakenError, Schema } from '../application/ports';
import { quizIssues } from '../domain/quiz-rules';
import { isUniqueViolation } from './pg-revision.repository';

/** Quiz d'entraînement (schéma assessment) : questions, réponses, explications, lien vers la fiche. */
@Injectable()
export class QuizKindAdapter implements ContentKindAdapter<QuizContent> {
  readonly kind = 'quiz' as const;
  readonly schema: Schema<QuizContent> = QuizContentSchema;
  readonly noun = 'quiz';
  readonly publishedEvent = 'assessment.quiz.published.v1';

  constructor(private readonly db: Database) {}

  blank = (): QuizContent => ({ slug: '', title: '', platform: 'linux', commandSlug: null, questions: [] });
  key = (c: QuizContent) => c.slug;
  title = (c: QuizContent) => c.title;

  async issues(c: QuizContent): Promise<ContentIssue[]> {
    const { rows } = c.commandSlug
      ? await this.db.query<{ slug: string }>(`SELECT slug FROM kb.commands WHERE slug = $1 AND status = 'published'`, [c.commandSlug])
      : { rows: [] };
    return quizIssues(c, { knownCommands: new Set(rows.map((r) => r.slug)) });
  }

  async published(slug: string): Promise<{ targetId: string; content: QuizContent } | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT q.id, q.slug, q.title, q.platform::text AS platform,
              (SELECT c.slug FROM kb.command_links l JOIN kb.commands c ON c.id = l.command_id
                WHERE l.target_type = 'quiz' AND l.target_id = q.id LIMIT 1) AS command_slug,
              coalesce((SELECT json_agg(json_build_object(
                  'type', x.type, 'promptMd', x.prompt_md, 'choices', x.choices, 'answer', x.answer, 'explanation', x.explanation,
                  'difficulty', x.difficulty::text, 'generatedByAi', x.generated_by_ai) ORDER BY qq.position)
                 FROM assessment.quiz_questions qq JOIN assessment.questions x ON x.id = qq.question_id WHERE qq.quiz_id = q.id), '[]') AS questions
         FROM assessment.quizzes q WHERE q.slug = $1 AND q.status = 'published'`,
      [slug],
    );
    const q = rows[0];
    if (!q) return null;
    return {
      targetId: q.id,
      content: { slug: q.slug, title: q.title, platform: q.platform ?? 'cross_platform', commandSlug: q.command_slug, questions: q.questions },
    };
  }

  async apply(tx: PoolClient, c: QuizContent, targetId: string | null): Promise<string> {
    let quizId = targetId;
    try {
      if (quizId) {
        await tx.query(
          `UPDATE assessment.quizzes SET slug = $1, title = $2, platform = $3::platform.os_platform, status = 'published', updated_at = now() WHERE id = $4`,
          [c.slug, c.title, c.platform, quizId],
        );
      } else {
        quizId = (
          await tx.query<{ id: string }>(
            `INSERT INTO assessment.quizzes (slug, title, kind, platform, status) VALUES ($1, $2, 'practice', $3::platform.os_platform, 'published') RETURNING id`,
            [c.slug, c.title, c.platform],
          )
        ).rows[0].id;
      }
    } catch (err) {
      if (isUniqueViolation(err, 'quizzes_slug_key')) throw new KeyTakenError();
      throw err;
    }
    // Les questions appartiennent à ce quiz : on les remplace en bloc (les tentatives gardent leurs réponses).
    await tx.query(
      `DELETE FROM assessment.questions WHERE id IN (SELECT question_id FROM assessment.quiz_questions WHERE quiz_id = $1)`,
      [quizId],
    );
    for (const [position, q] of c.questions.entries()) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO assessment.questions (type, prompt_md, choices, answer, explanation, difficulty, platform, generated_by_ai, reviewed)
         VALUES ($1, $2, $3, $4, $5, $6::platform.difficulty, $7::platform.os_platform, $8, true) RETURNING id`,
        [q.type, q.promptMd, JSON.stringify(q.choices), JSON.stringify(q.answer), q.explanation, q.difficulty, c.platform, q.generatedByAi],
      );
      await tx.query(`INSERT INTO assessment.quiz_questions (quiz_id, question_id, position) VALUES ($1, $2, $3)`, [quizId, rows[0].id, position]);
    }
    await tx.query(`DELETE FROM kb.command_links WHERE target_type = 'quiz' AND target_id = $1`, [quizId]);
    if (c.commandSlug) {
      await tx.query(
        `INSERT INTO kb.command_links (command_id, target_type, target_id) SELECT id, 'quiz', $2 FROM kb.commands WHERE slug = $1`,
        [c.commandSlug, quizId],
      );
    }
    return quizId!;
  }
}
