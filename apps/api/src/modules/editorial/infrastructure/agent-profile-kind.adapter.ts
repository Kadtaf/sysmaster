import { Injectable } from '@nestjs/common';
import { AgentProfileContentSchema, type AgentProfileContent, type ContentIssue } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { ContentKindAdapter, KeyTakenError, Schema } from '../application/ports';
import { agentProfileIssues } from '../domain/agent-profile-rules';
import { isUniqueViolation } from './pg-revision.repository';

/**
 * Profil d'agent IA (schéma ai). Réservé aux administrateurs, à la rédaction comme à la relecture :
 * ce texte guide le modèle pour tous les apprenants. Chaque publication incrémente la version.
 */
@Injectable()
export class AgentProfileKindAdapter implements ContentKindAdapter<AgentProfileContent> {
  readonly kind = 'agent_profile' as const;
  readonly schema: Schema<AgentProfileContent> = AgentProfileContentSchema;
  readonly noun = 'profil d’agent';
  readonly publishedEvent = 'ai.agent_profile.published.v1';
  readonly restrictedTo = ['admin' as const];

  constructor(private readonly db: Database) {}

  blank = (): AgentProfileContent => ({ code: '', name: '', mission: '', systemPrompt: '', enabled: true });
  key = (c: AgentProfileContent) => c.code;
  title = (c: AgentProfileContent) => c.name;

  async issues(c: AgentProfileContent, targetId: string | null): Promise<ContentIssue[]> {
    return agentProfileIssues(c, targetId === null);
  }

  async published(code: string): Promise<{ targetId: string; content: AgentProfileContent } | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT code, name, mission, system_prompt, enabled FROM ai.agent_profiles WHERE code = $1`,
      [code],
    );
    const p = rows[0];
    if (!p) return null;
    return { targetId: p.code, content: { code: p.code, name: p.name, mission: p.mission, systemPrompt: p.system_prompt, enabled: p.enabled } };
  }

  async apply(tx: PoolClient, c: AgentProfileContent, targetId: string | null): Promise<string> {
    if (targetId) {
      await tx.query(
        `UPDATE ai.agent_profiles SET name = $1, mission = $2, system_prompt = $3, enabled = $4, version = version + 1, updated_at = now()
          WHERE code = $5`,
        [c.name, c.mission, c.systemPrompt, c.enabled, targetId],
      );
      return targetId;
    }
    try {
      await tx.query(
        `INSERT INTO ai.agent_profiles (code, name, mission, system_prompt, enabled) VALUES ($1, $2, $3, $4, $5)`,
        [c.code, c.name, c.mission, c.systemPrompt, c.enabled],
      );
    } catch (err) {
      if (isUniqueViolation(err, 'agent_profiles_pkey')) throw new KeyTakenError();
      throw err;
    }
    return c.code;
  }
}
