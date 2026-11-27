-- Paiement des examens de certification (docs/03 §2.7 et §2.11). Un achat payé ouvre une
-- tentative : il est consommé quand l'examen démarre. Tant que le paiement en ligne est fermé,
-- les examens restent ouverts sans achat.
CREATE TABLE billing.exam_purchases (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES iam.users(id),
  certification_code         text NOT NULL REFERENCES assessment.certifications(code),
  -- Prix catalogue, remise de l'offre au moment de l'achat et montant payé (TTC, centimes).
  list_price_cents           int NOT NULL CHECK (list_price_cents >= 0),
  discount_pct               int NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  amount_cents               int NOT NULL CHECK (amount_cents >= 0),
  currency                   char(3) NOT NULL DEFAULT 'EUR',
  status                     text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','paid','consumed','expired','refunded')),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id   text UNIQUE,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  paid_at                    timestamptz,
  consumed_at                timestamptz,
  exam_session_id            uuid REFERENCES assessment.exam_sessions(id) ON DELETE SET NULL
);
CREATE INDEX exam_purchases_user_idx ON billing.exam_purchases (user_id, certification_code, status);
