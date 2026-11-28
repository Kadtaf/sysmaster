-- Licences d'organisation achetées en ligne (docs/03 §2.11), en plus des licences sur devis.
-- Une commande paie N sièges pour 12 mois (nouvelle organisation ou renouvellement), ou des sièges
-- ajoutés au prorata jusqu'à la fin de la licence en cours. Le prix d'un siège vient de
-- billing.plans.price_cents (offre par siège du type d'organisation) : tant qu'il est vide, l'achat
-- en ligne est fermé pour ce type et le devis reste la seule voie.
-- Une commande payée est une pièce comptable : gardée dix ans, même après l'effacement de l'acheteur.
CREATE TABLE IF NOT EXISTS billing.seat_purchases (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id                   uuid NOT NULL REFERENCES iam.users(id),
  -- Vide pour une nouvelle organisation tant que le paiement n'est pas confirmé.
  organization_id            uuid REFERENCES iam.organizations(id) ON DELETE SET NULL,
  action                     text NOT NULL CHECK (action IN ('new', 'renew', 'add_seats')),
  organization_kind          text NOT NULL CHECK (organization_kind IN ('company', 'training_center', 'school', 'university')),
  organization_name          text NOT NULL,
  plan_code                  text NOT NULL,
  seats                      int NOT NULL CHECK (seats BETWEEN 1 AND 1000),
  unit_price_cents           int NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents               int NOT NULL CHECK (amount_cents >= 0),
  currency                   char(3) NOT NULL DEFAULT 'EUR',
  status                     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'refunded')),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id   text UNIQUE,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  paid_at                    timestamptz
);
CREATE INDEX IF NOT EXISTS seat_purchases_buyer_idx ON billing.seat_purchases (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seat_purchases_org_idx ON billing.seat_purchases (organization_id);
