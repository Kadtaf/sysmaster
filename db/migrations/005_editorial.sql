-- =============================================================================
-- 005 — Back-office éditorial : révisions des fiches commandes
-- =============================================================================
-- Une fiche publiée (kb.commands) n'est jamais modifiée directement : l'auteur rédige une
-- révision, un relecteur (autre que l'auteur) l'approuve, et la publication remplace la fiche
-- en une transaction. La version en ligne reste donc intacte pendant la rédaction et la relecture.

CREATE TYPE kb.revision_status AS ENUM ('draft', 'in_review', 'changes_requested', 'published', 'withdrawn');

CREATE TABLE kb.command_revisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id     uuid REFERENCES kb.commands(id) ON DELETE CASCADE,  -- NULL : nouvelle fiche pas encore publiée
  is_new         boolean NOT NULL,                                   -- la révision crée une fiche (sinon : modifie)
  content        jsonb NOT NULL,                                     -- CommandContent (contrats)
  status         kb.revision_status NOT NULL DEFAULT 'draft',
  author_id      uuid NOT NULL REFERENCES iam.users(id),
  reviewer_id    uuid REFERENCES iam.users(id),
  review_comment text,
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (reviewer_id IS NULL OR reviewer_id <> author_id)              -- principe des quatre yeux
);
CREATE INDEX command_revisions_status_idx ON kb.command_revisions (status, updated_at DESC);
CREATE INDEX command_revisions_author_idx ON kb.command_revisions (author_id, updated_at DESC);
-- Une seule révision ouverte par fiche existante : évite deux modifications concurrentes qui s'écraseraient.
CREATE UNIQUE INDEX command_revisions_one_open_idx ON kb.command_revisions (command_id)
  WHERE command_id IS NOT NULL AND status IN ('draft', 'in_review', 'changes_requested');
CREATE TRIGGER command_revisions_touch BEFORE UPDATE ON kb.command_revisions
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Historique lisible par l'auteur et le relecteur (le journal d'audit global reste platform.audit_log).
CREATE TABLE kb.revision_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES kb.command_revisions(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES iam.users(id),
  action      text NOT NULL CHECK (action IN ('created', 'submitted', 'changes_requested', 'approved', 'withdrawn')),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX revision_events_revision_idx ON kb.revision_events (revision_id, created_at);
