import { Injectable } from '@nestjs/common';
import type { PracticeQuizDto, QuizSummaryDto } from '@sysmaster/contracts';
import { Database } from '../../../shared/database.module';
import { QuizRepository } from '../application/ports';
import type { KeyedQuestion } from '../domain/scoring';

@Injectable()
export class PgQuizRepository extends QuizRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async forCommand(commandSlug: string): Promise<QuizSummaryDto[]> {
    const { rows } = await this.db.query<{ slug: string; title: string; questionCount: number }>(
      `SELECT q.slug, q.title, (SELECT count(*)::int FROM assessment.quiz_questions qq WHERE qq.quiz_id = q.id) AS "questionCount"
         FROM assessment.quizzes q
         JOIN kb.command_links l ON l.target_type = 'quiz' AND l.target_id = q.id
         JOIN kb.commands c ON c.id = l.command_id
        WHERE c.slug = $1 AND q.status = 'published' AND q.kind = 'practice'
        ORDER BY q.title`,
      [commandSlug],
    );
    return rows;
  }

  async find(slug: string): Promise<(PracticeQuizDto & { id: string }) | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT q.id, q.slug, q.title, q.platform::text AS platform, q.pass_score,
              (SELECT c.slug FROM kb.command_links l JOIN kb.commands c ON c.id = l.command_id
                WHERE l.target_type = 'quiz' AND l.target_id = q.id LIMIT 1) AS command_slug,
              coalesce((SELECT json_agg(json_build_object('id', x.id, 'type', x.type, 'promptMd', x.prompt_md, 'choices', x.choices,
                                                          'difficulty', x.difficulty::text) ORDER BY qq.position)
                          FROM assessment.quiz_questions qq JOIN assessment.questions x ON x.id = qq.question_id
                         WHERE qq.quiz_id = q.id AND x.reviewed), '[]') AS questions
         FROM assessment.quizzes q WHERE q.slug = $1 AND q.status = 'published' AND q.kind = 'practice'`,
      [slug],
    );
    const q = rows[0];
    if (!q) return null;
    return { id: q.id, slug: q.slug, title: q.title, platform: q.platform, commandSlug: q.command_slug, passScore: q.pass_score, questions: q.questions };
  }

  async key(quizId: string): Promise<KeyedQuestion[]> {
    const { rows } = await this.db.query<{ id: string; answer: string[]; explanation: string }>(
      `SELECT x.id, x.answer, x.explanation FROM assessment.quiz_questions qq JOIN assessment.questions x ON x.id = qq.question_id
        WHERE qq.quiz_id = $1 AND x.reviewed ORDER BY qq.position`,
      [quizId],
    );
    return rows;
  }

  async recordAttempt(quizId: string, userId: string, answers: Record<string, string[]>, score: number, passed: boolean): Promise<void> {
    await this.db.query(
      `INSERT INTO assessment.attempts (quiz_id, user_id, submitted_at, score, passed, answers) VALUES ($1, $2, now(), $3, $4, $5)`,
      [quizId, userId, score, passed, JSON.stringify(answers)],
    );
  }
}
