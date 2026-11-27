import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Database } from '../../../shared/database.module';
import { ErasureHooks, PrivacyRepository, RetentionResult } from '../application/ports';
import { ANONYMIZED_NAME, anonymizedEmail, ErasureState, RETENTION_DAYS, retentionCutoff } from '../domain/privacy';

/**
 * Rubriques de l'export (droit d'accès et portabilité). Chaque requête ne lit que des données
 * de la personne elle-même ($1) : jamais le nom ni les messages d'autres membres.
 */
const EXPORT: [string, string][] = [
  ['profil', `SELECT id, email, email_verified, display_name, username, locale, timezone, status, created_at, last_login_at,
                     deletion_requested_at, deletion_due_at FROM iam.users WHERE id = $1`],
  ['roles', `SELECT role_code, source FROM iam.user_roles WHERE user_id = $1`],
  ['identitesExternes', `SELECT provider, created_at FROM iam.external_identities WHERE user_id = $1`],
  ['organisations', `SELECT organization_id, role_code, joined_at FROM iam.memberships WHERE user_id = $1`],
  ['parcours', `SELECT p.slug, e.started_at, e.completed_at, e.progress_pct FROM learning.enrollments e
                  JOIN learning.learning_paths p ON p.id = e.path_id WHERE e.user_id = $1`],
  ['lecons', `SELECT l.slug, c.slug AS course, lp.status, lp.time_spent_s, lp.completed_at FROM learning.lesson_progress lp
                JOIN learning.lessons l ON l.id = lp.lesson_id JOIN learning.modules m ON m.id = l.module_id
                JOIN learning.courses c ON c.id = m.course_id WHERE lp.user_id = $1`],
  ['objectifs', `SELECT title, target, due_date, source, status, created_at FROM learning.user_goals WHERE user_id = $1`],
  ['competences', `SELECT s.code, us.score, us.confidence, us.updated_at FROM skills.user_skill_scores us
                     JOIN skills.skills s ON s.id = us.skill_id WHERE us.user_id = $1`],
  ['diagnostics', `SELECT s.id, s.platform, s.description, s.status, s.resolved, s.resolved_cause_code, s.created_at, s.completed_at,
                          (SELECT coalesce(json_agg(x.symptom_code), '[]') FROM diagnostic.session_symptoms x WHERE x.session_id = s.id) AS symptoms,
                          (SELECT coalesce(json_agg(json_build_object('cause', h.cause_code, 'probability', h.probability) ORDER BY h.rank), '[]')
                             FROM diagnostic.hypotheses h WHERE h.session_id = s.id) AS hypotheses
                     FROM diagnostic.sessions s WHERE s.user_id = $1`],
  ['appareils', `SELECT hostname, platform, os_version, last_seen_at, created_at FROM diagnostic.probe_devices WHERE user_id = $1`],
  ['labs', `SELECT t.slug, i.status, i.score, i.hints_used, i.started_at, i.ended_at, i.command_count, i.transcript
              FROM labs.instances i JOIN labs.lab_templates t ON t.id = i.template_id WHERE i.user_id = $1`],
  ['quiz', `SELECT q.slug, a.started_at, a.submitted_at, a.score, a.passed, a.answers FROM assessment.attempts a
              JOIN assessment.quizzes q ON q.id = a.quiz_id WHERE a.user_id = $1`],
  ['examens', `SELECT certification_code, started_at, deadline_at, submitted_at, score, passed, answers, integrity
                 FROM assessment.exam_sessions WHERE user_id = $1`],
  ['certificats', `SELECT serial, certification_code, holder_name, issued_at, expires_at, revoked_at, revoke_reason, score
                     FROM assessment.certificates WHERE user_id = $1`],
  ['gamification', `SELECT total_xp, level, streak_days, longest_streak, lessons_completed, labs_solved, answers_accepted, show_in_leaderboard
                      FROM gamification.user_stats WHERE user_id = $1`],
  ['badges', `SELECT badge_code, awarded_at FROM gamification.user_badges WHERE user_id = $1`],
  ['historiqueXp', `SELECT amount, reason, created_at FROM gamification.xp_ledger WHERE user_id = $1 ORDER BY created_at`],
  ['sujets', `SELECT id, kind, title, body_md, tags, created_at FROM community.threads WHERE author_id = $1`],
  ['reponses', `SELECT id, thread_id, body_md, created_at FROM community.posts WHERE author_id = $1`],
  ['votes', `SELECT target_type, target_id, value FROM community.votes WHERE user_id = $1`],
  ['signalements', `SELECT target_type, target_id, reason, status, created_at FROM community.reports WHERE reporter_id = $1`],
  ['groupes', `SELECT g.name, m.role, m.joined_at FROM community.study_group_members m JOIN community.study_groups g ON g.id = m.group_id
                WHERE m.user_id = $1`],
  ['profilMentor', `SELECT bio, topics, accepting, max_mentees, updated_at FROM community.mentor_profiles WHERE user_id = $1`],
  ['mentorats', `SELECT id, CASE WHEN mentor_id = $1 THEN 'mentor' ELSE 'apprenant' END AS role, topic, status, message, created_at, ended_at
                   FROM community.mentorships WHERE mentor_id = $1 OR mentee_id = $1`],
  ['messages', `SELECT channel, channel_id, body_md, created_at FROM community.messages WHERE author_id = $1`],
  ['assistant', `SELECT c.id, c.title, c.created_at,
                        (SELECT coalesce(json_agg(json_build_object('role', m.role, 'content', m.content, 'at', m.created_at) ORDER BY m.created_at), '[]')
                           FROM ai.messages m WHERE m.conversation_id = c.id) AS messages
                   FROM ai.conversations c WHERE c.user_id = $1`],
  ['avisAssistant', `SELECT message_id, rating, comment, created_at FROM ai.feedback WHERE user_id = $1`],
  ['notifications', `SELECT channel, type, payload, read_at, created_at FROM notification.notifications WHERE user_id = $1`],
  ['preferencesNotifications', `SELECT type, channel, enabled FROM notification.preferences WHERE user_id = $1`],
  ['contributionsEditoriales', `SELECT id, kind, status, submitted_at, reviewed_at, created_at FROM editorial.revisions WHERE author_id = $1`],
  // Paiement : aucune donnée de carte (Stripe la garde) ; montants, états et dates seulement.
  ['abonnements', `SELECT s.plan_code, s.status, s.current_period_end, s.cancel_at_period_end, s.created_at
                     FROM billing.subscriptions s JOIN billing.customers c ON c.id = s.customer_id WHERE c.user_id = $1 ORDER BY s.created_at`],
  ['factures', `SELECT i.amount_cents, i.currency, i.status, i.issued_at, coalesce(i.hosted_url, i.pdf_url) AS url
                  FROM billing.invoices i JOIN billing.customers c ON c.id = i.customer_id WHERE c.user_id = $1 ORDER BY i.issued_at`],
  ['achatsExamens', `SELECT certification_code, list_price_cents, discount_pct, amount_cents, currency, status, created_at, paid_at, consumed_at
                       FROM billing.exam_purchases WHERE user_id = $1 ORDER BY created_at`],
  ['journalActions', `SELECT action, target_type, target_id, created_at FROM platform.audit_log WHERE actor_id = $1 ORDER BY created_at`],
];

@Injectable()
export class PgPrivacyRepository extends PrivacyRepository {
  private readonly logger = new Logger(PgPrivacyRepository.name);

  constructor(private readonly db: Database) {
    super();
  }

  async state(userId: string): Promise<ErasureState> {
    const { rows } = await this.db.query<{ status: string; deletion_requested_at: Date | null; deletion_due_at: Date | null }>(
      `SELECT status, deletion_requested_at, deletion_due_at FROM iam.users WHERE id = $1`,
      [userId],
    );
    const r = rows[0];
    if (!r || r.status === 'deleted') return { status: 'erased' };
    if (r.deletion_requested_at && r.deletion_due_at) return { status: 'scheduled', requestedAt: r.deletion_requested_at, dueAt: r.deletion_due_at };
    return { status: 'none' };
  }

  async exportData(userId: string): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [name, sql] of EXPORT) {
      const { rows } = await this.db.query(sql, [userId]);
      out[name] = name === 'profil' || name === 'gamification' || name === 'profilMentor' ? (rows[0] ?? null) : rows;
    }
    return out;
  }

  async scheduleErasure(userId: string, requestedAt: Date, dueAt: Date): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE iam.users SET deletion_requested_at = $2, deletion_due_at = $3
        WHERE id = $1 AND status <> 'deleted' AND deletion_requested_at IS NULL`,
      [userId, requestedAt, dueAt],
    );
    return rowCount === 1;
  }

  async cancelErasure(userId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE iam.users SET deletion_requested_at = NULL, deletion_due_at = NULL
        WHERE id = $1 AND status <> 'deleted' AND deletion_due_at > now()`,
      [userId],
    );
    return rowCount === 1;
  }

  async erase(now: Date, limit: number, hooks: ErasureHooks): Promise<number> {
    let done = 0;
    for (; done < limit; done++) {
      const erased = await this.db.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string; idp_subject: string | null; deletion_requested_at: Date }>(
          `SELECT id, idp_subject, deletion_requested_at FROM iam.users
            WHERE deletion_due_at <= $1 AND status <> 'deleted'
            ORDER BY deletion_due_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [now],
        );
        const u = rows[0];
        if (!u) return false;
        // Avant tout : plus aucun prélèvement. Si la transaction échoue ensuite, la résiliation sera
        // simplement refaite au passage suivant (sans effet sur un abonnement déjà résilié).
        const stripePending = await hooks.closeBilling(u.id);
        const counts = await this.eraseOne(tx, u.id);
        let idpDeleted = !u.idp_subject;
        if (u.idp_subject) {
          try {
            idpDeleted = await hooks.idpDelete(u.idp_subject);
          } catch (err) {
            this.logger.error(`Suppression chez le fournisseur d'identité impossible pour ${u.id} : ${(err as Error).message}`);
          }
        }
        await tx.query(
          `INSERT INTO iam.erasure_log (user_id, requested_at, idp_deleted, idp_subject, counts, stripe_subscriptions_pending)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [u.id, u.deletion_requested_at, idpDeleted, idpDeleted ? null : u.idp_subject, JSON.stringify(counts), stripePending],
        );
        return true;
      });
      if (!erased) break;
    }
    return done;
  }

  async retryIdentityDeletion(idpDelete: (subject: string) => Promise<boolean>): Promise<number> {
    const { rows } = await this.db.query<{ id: string; idp_subject: string }>(
      `SELECT id, idp_subject FROM iam.erasure_log WHERE idp_subject IS NOT NULL ORDER BY id LIMIT 100`,
    );
    let done = 0;
    for (const r of rows) {
      let ok = false;
      try {
        ok = await idpDelete(r.idp_subject);
      } catch (err) {
        this.logger.error(`Suppression chez le fournisseur d'identité impossible (registre ${r.id}) : ${(err as Error).message}`);
      }
      if (!ok) break; // pas de client d'administration, ou fournisseur en panne : inutile d'insister sur les suivants
      await this.db.query(`UPDATE iam.erasure_log SET idp_deleted = true, idp_subject = NULL WHERE id = $1`, [r.id]);
      done++;
    }
    return done;
  }

  async retryBillingClosure(cancel: (subscriptionIds: string[]) => Promise<string[]>): Promise<number> {
    const { rows } = await this.db.query<{ id: string; pending: string[] }>(
      `SELECT id, stripe_subscriptions_pending AS pending FROM iam.erasure_log
        WHERE cardinality(stripe_subscriptions_pending) > 0 ORDER BY id LIMIT 100`,
    );
    let done = 0;
    for (const r of rows) {
      const left = await cancel(r.pending);
      if (left.length === r.pending.length) break; // paiement fermé ou Stripe en panne : inutile d'insister
      await this.db.query(`UPDATE iam.erasure_log SET stripe_subscriptions_pending = $2 WHERE id = $1`, [r.id, left]);
      done++;
    }
    return done;
  }

  /** Efface tout ce qui se rapporte à la personne ; anonymise ce qui doit rester (contributions publiques). */
  private async eraseOne(tx: PoolClient, id: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    const run = async (label: string, sql: string, params: unknown[] = [id]) => {
      const { rowCount } = await tx.query(sql, params);
      if (rowCount) counts[label] = (counts[label] ?? 0) + rowCount;
    };

    // Groupes dont la personne est responsable : le membre le plus ancien reprend, sinon le groupe est fermé.
    const owned = await tx.query<{ group_id: string }>(
      `SELECT group_id FROM community.study_group_members WHERE user_id = $1 AND role = 'owner'`,
      [id],
    );
    for (const { group_id } of owned.rows) {
      const next = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM community.study_group_members WHERE group_id = $1 AND user_id <> $2 ORDER BY joined_at LIMIT 1`,
        [group_id, id],
      );
      if (next.rows[0]) {
        await tx.query(`UPDATE community.study_group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`, [group_id, next.rows[0].user_id]);
        await tx.query(`UPDATE community.study_groups SET owner_id = $2 WHERE id = $1`, [group_id, next.rows[0].user_id]);
      } else {
        await run('community.messages', `DELETE FROM community.messages WHERE channel = 'group' AND channel_id = $1`, [group_id]);
        await tx.query(`DELETE FROM community.study_group_members WHERE group_id = $1`, [group_id]);
        await run('community.study_groups', `DELETE FROM community.study_groups WHERE id = $1`, [group_id]);
      }
    }
    await run('community.mentorships', `UPDATE community.mentorships SET status = CASE status WHEN 'active' THEN 'ended' ELSE 'declined' END,
                                               ended_at = CASE status WHEN 'active' THEN now() ELSE ended_at END, responded_at = coalesce(responded_at, now())
                                          WHERE (mentor_id = $1 OR mentee_id = $1) AND status IN ('requested', 'active')`);
    await run('community.messages', `DELETE FROM community.messages WHERE author_id = $1`);
    await run('community.study_group_members', `DELETE FROM community.study_group_members WHERE user_id = $1`);
    await run('community.mentor_profiles', `DELETE FROM community.mentor_profiles WHERE user_id = $1`);
    await run('community.votes', `DELETE FROM community.votes WHERE user_id = $1`);

    await run('learning.lesson_progress', `DELETE FROM learning.lesson_progress WHERE user_id = $1`);
    await run('learning.enrollments', `DELETE FROM learning.enrollments WHERE user_id = $1`);
    await run('learning.user_goals', `DELETE FROM learning.user_goals WHERE user_id = $1`);
    await run('skills.user_skill_scores', `DELETE FROM skills.user_skill_scores WHERE user_id = $1`);

    await run('diagnostic.sessions', `DELETE FROM diagnostic.sessions WHERE user_id = $1`);
    await run('diagnostic.probe_devices', `DELETE FROM diagnostic.probe_devices WHERE user_id = $1`);
    await run('labs.instances', `DELETE FROM labs.instances WHERE user_id = $1`);

    await run('assessment.certificates', `DELETE FROM assessment.certificates WHERE user_id = $1`);
    await run('assessment.exam_sessions', `DELETE FROM assessment.exam_sessions WHERE user_id = $1`);
    await run('assessment.attempts', `DELETE FROM assessment.attempts WHERE user_id = $1`);

    await run('gamification.user_stats', `DELETE FROM gamification.user_stats WHERE user_id = $1`);
    await run('gamification.user_badges', `DELETE FROM gamification.user_badges WHERE user_id = $1`);
    await run('gamification.xp_ledger', `DELETE FROM gamification.xp_ledger WHERE user_id = $1`);
    await run('gamification.challenge_participants', `DELETE FROM gamification.challenge_participants WHERE user_id = $1`);

    await run('ai.feedback', `DELETE FROM ai.feedback WHERE user_id = $1`);
    await run('ai.messages', `DELETE FROM ai.messages WHERE conversation_id IN (SELECT id FROM ai.conversations WHERE user_id = $1)`);
    // Les mesures de coût restent (budget IA), sans lien avec la personne.
    await run('ai.agent_runs', `UPDATE ai.agent_runs SET user_id = NULL, conversation_id = NULL WHERE user_id = $1`);
    await run('ai.conversations', `DELETE FROM ai.conversations WHERE user_id = $1`);

    await run('notification.notifications', `DELETE FROM notification.notifications WHERE user_id = $1`);
    await run('notification.preferences', `DELETE FROM notification.preferences WHERE user_id = $1`);

    for (const t of ['external_identities', 'mfa_factors', 'passkeys', 'sessions', 'user_roles', 'memberships', 'entitlements']) {
      await run(`iam.${t}`, `DELETE FROM iam.${t} WHERE user_id = $1`);
    }

    // La ligne reste (sujets, réponses et contributions éditoriales s'y rattachent), vidée de toute donnée personnelle.
    await run('iam.users', `UPDATE iam.users SET email = $2, email_verified = false, display_name = $3, username = NULL, avatar_url = NULL,
                                   password_hash = NULL, idp_subject = NULL, last_login_at = NULL, status = 'deleted', deleted_at = now(),
                                   deletion_requested_at = NULL, deletion_due_at = NULL, updated_at = now()
                             WHERE id = $1`, [id, anonymizedEmail(id), ANONYMIZED_NAME]);
    return counts;
  }

  async applyRetention(now: Date): Promise<RetentionResult> {
    const at = (days: number) => retentionCutoff(now, days);
    const result: RetentionResult = {};
    const run = async (label: string, sql: string, cutoff: Date) => {
      const { rowCount } = await this.db.query(sql, [cutoff]);
      result[label] = rowCount ?? 0;
    };
    // Conversations sans message récent : messages puis conversations.
    const stale = `SELECT c.id FROM ai.conversations c
                    WHERE c.created_at < $1 AND NOT EXISTS (SELECT 1 FROM ai.messages m WHERE m.conversation_id = c.id AND m.created_at >= $1)`;
    await run('ai.messages', `DELETE FROM ai.messages WHERE conversation_id IN (${stale})`, at(RETENTION_DAYS.assistantConversations));
    await run('ai.conversations', `DELETE FROM ai.conversations c WHERE c.created_at < $1
                                    AND NOT EXISTS (SELECT 1 FROM ai.messages m WHERE m.conversation_id = c.id)`, at(RETENTION_DAYS.assistantConversations));
    await run('diagnostic.sessions', `DELETE FROM diagnostic.sessions WHERE created_at < $1`, at(RETENTION_DAYS.diagnosticSessions));
    await run('platform.audit_log', `DELETE FROM platform.audit_log WHERE created_at < $1`, at(RETENTION_DAYS.auditLog));
    await run('notification.notifications', `DELETE FROM notification.notifications WHERE read_at IS NOT NULL AND read_at < $1`, at(RETENTION_DAYS.readNotifications));
    await run('assessment.exam_sessions.integrity', `UPDATE assessment.exam_sessions SET integrity = '{}'
                                                      WHERE started_at < $1 AND integrity <> '{}'`, at(RETENTION_DAYS.examIntegrity));
    await run('labs.instances.transcript', `UPDATE labs.instances SET transcript = '[]'
                                             WHERE ended_at < $1 AND transcript <> '[]'`, at(RETENTION_DAYS.labTranscripts));
    // Pièces comptables : dix ans, puis plus rien (Stripe garde son propre exemplaire des factures).
    await run('billing.invoices', `DELETE FROM billing.invoices WHERE issued_at < $1`, at(RETENTION_DAYS.billingRecords));
    await run('billing.exam_purchases', `DELETE FROM billing.exam_purchases WHERE created_at < $1`, at(RETENTION_DAYS.billingRecords));
    return result;
  }
}
