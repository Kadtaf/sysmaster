-- Licences par siège pour les entreprises, centres de formation, écoles et universités (docs/03 §2.11).
-- Vendues sur devis : un administrateur SysMaster ouvre l'organisation avec un nombre de sièges et
-- une période ; ses gestionnaires invitent les membres. Un siège donne les droits de seat_plan.
ALTER TABLE iam.organizations ADD COLUMN IF NOT EXISTS licence_starts_at timestamptz;
ALTER TABLE iam.organizations ADD COLUMN IF NOT EXISTS licence_ends_at timestamptz;
-- Offre individuelle donnée par un siège (pas de clé étrangère : billing.plans est rempli par les données, après les migrations).
ALTER TABLE iam.organizations ADD COLUMN IF NOT EXISTS seat_plan text NOT NULL DEFAULT 'pro' CHECK (seat_plan IN ('premium', 'pro'));
ALTER TABLE iam.organizations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES iam.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS memberships_user_idx ON iam.memberships (user_id);

-- Invitation par e-mail : seul le condensé du jeton est gardé, le lien n'existe qu'à l'envoi.
-- Une invitation en attente réserve un siège jusqu'à son expiration.
CREATE TABLE IF NOT EXISTS iam.organization_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES iam.organizations(id) ON DELETE CASCADE,
  email           citext NOT NULL,
  role_code       text NOT NULL REFERENCES iam.roles(code),
  token_hash      bytea NOT NULL UNIQUE,
  invited_by      uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,
  accepted_by     uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  revoked_at      timestamptz
);
-- Une seule invitation en attente par adresse et par organisation.
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_pending_uq
  ON iam.organization_invitations (organization_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS organization_invitations_email_idx ON iam.organization_invitations (email);
