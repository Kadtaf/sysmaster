import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database.module';
import { AiRun, AiUsageRepository } from '../application/ports';

@Injectable()
export class PgAiUsageRepository extends AiUsageRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async requestsSince(userId: string, since: Date): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ai.agent_runs WHERE user_id = $1 AND created_at >= $2`,
      [userId, since],
    );
    return rows[0].n;
  }

  async record(run: AiRun): Promise<void> {
    await this.db.query(
      `INSERT INTO ai.agent_runs (user_id, agent_code, model, latency_ms, outcome, trace_id, tokens_in, tokens_out, cache_read_tokens, cache_write_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        run.userId, run.agentCode, run.model, run.latencyMs, run.outcome, run.failure?.slice(0, 200) ?? null,
        run.usage?.inputTokens ?? null, run.usage?.outputTokens ?? null, run.usage?.cacheReadTokens ?? null, run.usage?.cacheWriteTokens ?? null,
      ],
    );
  }
}
