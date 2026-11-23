-- =============================================================================
-- 004 — Relais d'événements (outbox) et gamification
-- =============================================================================

-- Relais : nombre d'essais et dernière erreur. Au-delà de 10 essais, l'événement est mis
-- de côté (« lettre morte ») et n'est plus retenté automatiquement : il faut l'examiner.
ALTER TABLE platform.outbox_events
  ADD COLUMN attempts int NOT NULL DEFAULT 0,
  ADD COLUMN last_error text,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();  -- attente exponentielle entre essais
DROP INDEX IF EXISTS platform.outbox_unpublished_idx;
CREATE INDEX outbox_pending_idx ON platform.outbox_events (next_attempt_at, occurred_at)
  WHERE published_at IS NULL AND attempts < 10;

-- Le registre d'XP est idempotent par (consommateur, événement) via platform.processed_events ;
-- la contrainte d'origine incluait created_at (partitionnement) et ne garantissait rien.
ALTER TABLE gamification.xp_ledger DROP CONSTRAINT IF EXISTS xp_ledger_source_event_id_created_at_key;
CREATE INDEX xp_ledger_user_idx ON gamification.xp_ledger (user_id, created_at DESC);

-- Compteurs utiles aux badges, tenus à jour par le consommateur (read model).
ALTER TABLE gamification.user_stats
  ADD COLUMN lessons_completed int NOT NULL DEFAULT 0,
  ADD COLUMN diagnostics_completed int NOT NULL DEFAULT 0,
  ADD COLUMN paths_completed int NOT NULL DEFAULT 0,
  ADD COLUMN longest_streak int NOT NULL DEFAULT 0;

-- Le classement affiche un nom abrégé ; on peut s'en retirer.
ALTER TABLE gamification.user_stats ADD COLUMN show_in_leaderboard boolean NOT NULL DEFAULT true;

CREATE OR REPLACE VIEW gamification.leaderboard AS
SELECT us.user_id, u.display_name, us.total_xp, us.level,
       rank() OVER (ORDER BY us.total_xp DESC) AS position
FROM gamification.user_stats us
JOIN iam.users u ON u.id = us.user_id
WHERE u.status = 'active' AND us.show_in_leaderboard;
