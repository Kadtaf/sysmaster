import { Injectable } from '@nestjs/common';
import type { AssistantAnswer } from '@sysmaster/contracts';
import { Database } from '../../../shared/database.module';
import { AiAskResponse, ConversationRepository, StoredTurn } from '../application/ports';

/**
 * Une question et sa réponse sont deux lignes de ai.messages ; la réponse pointe vers sa question
 * (content.questionId). La trace (modèle, latence, issue) va dans ai.agent_runs, pour le suivi des
 * coûts et de la qualité.
 */
@Injectable()
export class PgConversationRepository extends ConversationRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async ownedBy(conversationId: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(`SELECT 1 FROM ai.conversations WHERE id = $1 AND user_id = $2`, [conversationId, userId]);
    return rowCount === 1;
  }

  async create(userId: string, title: string): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(`INSERT INTO ai.conversations (user_id, title) VALUES ($1, $2) RETURNING id`, [userId, title]);
    return rows[0].id;
  }

  async list(userId: string) {
    const { rows } = await this.db.query<{ id: string; title: string; createdAt: string }>(
      `SELECT id, coalesce(title, 'Conversation') AS title, created_at AS "createdAt" FROM ai.conversations
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
    return rows;
  }

  async turns(conversationId: string): Promise<StoredTurn[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT q.id AS question_id, q.content->>'text' AS question, q.created_at, a.id AS answer_id, a.agent_code, a.content AS answer
         FROM ai.messages q
         LEFT JOIN ai.messages a ON a.conversation_id = q.conversation_id AND a.role = 'assistant'
                                 AND a.content->>'questionId' = q.id::text
        WHERE q.conversation_id = $1 AND q.role = 'user'
        ORDER BY q.created_at`,
      [conversationId],
    );
    return rows.map((r) => ({
      messageId: r.answer_id ?? r.question_id,
      question: r.question,
      reply: (r.answer?.answer as AssistantAnswer | undefined) ?? null,
      agent: r.agent_code ?? null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  saveTurn(userId: string, conversationId: string, question: string, res: AiAskResponse | null, failure?: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const q = await tx.query<{ id: string }>(
        `INSERT INTO ai.messages (conversation_id, role, content) VALUES ($1, 'user', $2) RETURNING id`,
        [conversationId, JSON.stringify({ text: question })],
      );
      const questionId = q.rows[0].id;
      if (!res) {
        await tx.query(
          `INSERT INTO ai.agent_runs (user_id, conversation_id, agent_code, model, outcome, trace_id) VALUES ($1, $2, 'unknown', 'unknown', 'error', $3)`,
          [userId, conversationId, (failure ?? '').slice(0, 200)],
        );
        return questionId;
      }
      const a = await tx.query<{ id: string }>(
        `INSERT INTO ai.messages (conversation_id, role, agent_code, content, citations, tokens_in, tokens_out)
         VALUES ($1, 'assistant', $2, $3, $4, $5, $6) RETURNING id`,
        [
          conversationId, res.agent,
          JSON.stringify({ questionId, answer: res.answer, domain: res.domain, outcome: res.outcome }),
          JSON.stringify(res.answer.sources), res.usage.inputTokens + res.usage.cacheReadTokens + res.usage.cacheWriteTokens, res.usage.outputTokens,
        ],
      );
      await tx.query(
        `INSERT INTO ai.agent_runs (user_id, conversation_id, agent_code, model, latency_ms, outcome, tokens_in, tokens_out, cache_read_tokens, cache_write_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId, conversationId, res.agent, res.model, res.latencyMs, res.outcome === 'refused' ? 'refused' : 'ok',
          res.usage.inputTokens, res.usage.outputTokens, res.usage.cacheReadTokens, res.usage.cacheWriteTokens,
        ],
      );
      return a.rows[0].id;
    });
  }

  async feedback(messageId: string, userId: string, rating: 1 | -1, comment?: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `INSERT INTO ai.feedback (message_id, user_id, rating, comment)
       SELECT m.id, $2, $3, $4 FROM ai.messages m JOIN ai.conversations c ON c.id = m.conversation_id
        WHERE m.id = $1 AND m.role = 'assistant' AND c.user_id = $2
       ON CONFLICT (message_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()`,
      [messageId, userId, rating, comment ?? null],
    );
    return rowCount === 1;
  }
}
