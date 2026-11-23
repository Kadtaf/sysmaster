import { Injectable } from '@nestjs/common';
import type { DiagnosticSessionCompletedV1, Platform } from '@sysmaster/contracts';
import { Database } from '../../../shared/database.module';
import { DiagnosticSessionRepository, NewDiagnosticSession } from '../application/ports';

@Injectable()
export class PgDiagnosticSessionRepository extends DiagnosticSessionRepository {
  constructor(private readonly db: Database) {
    super();
  }

  saveCompleted(s: NewDiagnosticSession): Promise<string> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO diagnostic.sessions (user_id, platform, description, status, completed_at)
         VALUES ($1, $2, $3, 'completed', now()) RETURNING id`,
        [s.userId, s.platform, s.description],
      );
      const id = rows[0].id;

      for (const sym of s.symptoms) {
        await tx.query(
          `INSERT INTO diagnostic.session_symptoms (session_id, symptom_code, source) VALUES ($1, $2, $3)`,
          [id, sym.code, sym.source],
        );
      }
      for (const [i, h] of s.result.hypotheses.entries()) {
        await tx.query(
          `INSERT INTO diagnostic.hypotheses (session_id, cause_code, probability, rank, explanation)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, h.cause.code, h.probability.toFixed(4), i + 1, h.reasoning.join('\n') || h.cause.explanation],
        );
      }

      // Outbox : l'événement est écrit dans la MÊME transaction que l'état.
      const event: DiagnosticSessionCompletedV1 = {
        sessionId: id,
        userId: s.userId,
        platform: s.platform as Platform,
        topCause: s.result.hypotheses[0]?.cause.code ?? null,
        confidence: s.result.confidence,
      };
      await tx.query(
        `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
         VALUES ('diagnostic.session', $1, 'diagnostic.session.completed.v1', $2)`,
        [id, JSON.stringify(event)],
      );
      return id;
    });
  }
}
