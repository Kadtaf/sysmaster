-- Effacement RGPD : les tentatives d'examen payées mais pas utilisées sont remboursées
-- (docs/08 §8). Comme pour les abonnements (021), ce que Stripe n'a pas pu faire reste ici,
-- et seulement ici, jusqu'à ce que la tâche horaire réussisse.
ALTER TABLE iam.erasure_log ADD COLUMN IF NOT EXISTS stripe_refunds_pending text[] NOT NULL DEFAULT '{}';
DROP INDEX IF EXISTS iam.erasure_log_stripe_pending_idx;
CREATE INDEX erasure_log_stripe_pending_idx ON iam.erasure_log (id)
  WHERE cardinality(stripe_subscriptions_pending) + cardinality(stripe_refunds_pending) > 0;
