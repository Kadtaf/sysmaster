-- Paiement des abonnements par Stripe (docs/03 §2.11). Le schéma billing existe depuis 001 ;
-- cette migration l'aligne sur ce que Stripe renvoie vraiment et sur le traitement des webhooks.

-- Stripe connaît deux états de plus : « unpaid » (relances épuisées) et « incomplete_expired »
-- (premier paiement jamais abouti).
ALTER TABLE billing.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE billing.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'));

-- Date de l'événement Stripe qui a écrit la ligne : les webhooks peuvent arriver dans le désordre,
-- un événement plus ancien que la ligne est ignoré.
ALTER TABLE billing.subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE billing.subscriptions ADD COLUMN IF NOT EXISTS last_event_at timestamptz;
ALTER TABLE billing.subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON billing.subscriptions (customer_id);

ALTER TABLE billing.invoices ADD COLUMN IF NOT EXISTS hosted_url text;
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON billing.invoices (customer_id, issued_at DESC);

-- Un client Stripe est créé avant de savoir si le paiement aboutira : la date sert au ménage.
ALTER TABLE billing.customers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
