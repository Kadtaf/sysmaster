-- Effacement RGPD et paiement (docs/08 §8). À l'effacement d'un compte, ses abonnements Stripe
-- sont résiliés tout de suite. Si Stripe ne répond pas (ou si la clé a été retirée), les
-- identifiants des abonnements restent ici, et seulement ici, jusqu'à ce que la tâche horaire
-- réussisse à les résilier.
ALTER TABLE iam.erasure_log ADD COLUMN IF NOT EXISTS stripe_subscriptions_pending text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS erasure_log_stripe_pending_idx ON iam.erasure_log (id) WHERE cardinality(stripe_subscriptions_pending) > 0;
