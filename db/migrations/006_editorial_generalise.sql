-- =============================================================================
-- 006 — Back-office éditorial généralisé : fiches, cours, parcours, causes de diagnostic
-- =============================================================================
-- Le même workflow (brouillon → relecture par une autre personne → publication) s'applique
-- désormais à quatre types de contenu. Les révisions quittent le schéma kb pour un contexte
-- dédié, « editorial ». Chaque type garde une vraie clé étrangère vers sa cible.

CREATE SCHEMA IF NOT EXISTS editorial;
ALTER TYPE kb.revision_status SET SCHEMA editorial;
ALTER TABLE kb.command_revisions SET SCHEMA editorial;
ALTER TABLE editorial.command_revisions RENAME TO revisions;
ALTER TABLE kb.revision_events SET SCHEMA editorial;

ALTER TABLE editorial.revisions
  ADD COLUMN kind text NOT NULL DEFAULT 'command'
    CHECK (kind IN ('command', 'course', 'path', 'diagnostic_cause')),
  ADD COLUMN course_id uuid REFERENCES learning.courses(id) ON DELETE CASCADE,
  ADD COLUMN path_id uuid REFERENCES learning.learning_paths(id) ON DELETE CASCADE,
  ADD COLUMN cause_code text REFERENCES diagnostic.causes(code) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE editorial.revisions ALTER COLUMN kind DROP DEFAULT;

-- Une révision ne vise qu'une cible, du bon type (NULL tant qu'une nouvelle fiche n'est pas publiée).
ALTER TABLE editorial.revisions ADD CONSTRAINT revisions_target_matches_kind CHECK (
  (kind = 'command'          OR command_id IS NULL) AND
  (kind = 'course'           OR course_id  IS NULL) AND
  (kind = 'path'             OR path_id    IS NULL) AND
  (kind = 'diagnostic_cause' OR cause_code IS NULL)
);

-- Une seule révision ouverte par cible.
DROP INDEX editorial.command_revisions_one_open_idx;
CREATE UNIQUE INDEX revisions_one_open_command_idx ON editorial.revisions (command_id)
  WHERE command_id IS NOT NULL AND status IN ('draft', 'in_review', 'changes_requested');
CREATE UNIQUE INDEX revisions_one_open_course_idx ON editorial.revisions (course_id)
  WHERE course_id IS NOT NULL AND status IN ('draft', 'in_review', 'changes_requested');
CREATE UNIQUE INDEX revisions_one_open_path_idx ON editorial.revisions (path_id)
  WHERE path_id IS NOT NULL AND status IN ('draft', 'in_review', 'changes_requested');
CREATE UNIQUE INDEX revisions_one_open_cause_idx ON editorial.revisions (cause_code)
  WHERE cause_code IS NOT NULL AND status IN ('draft', 'in_review', 'changes_requested');
ALTER INDEX editorial.command_revisions_status_idx RENAME TO revisions_status_idx;
ALTER INDEX editorial.command_revisions_author_idx RENAME TO revisions_author_idx;
CREATE INDEX revisions_kind_idx ON editorial.revisions (kind, status, updated_at DESC);

-- -----------------------------------------------------------------------------
-- Diagnostic : cas de référence pour simuler une modification de règles avant publication
-- -----------------------------------------------------------------------------
-- Chaque cas décrit une panne réelle et la cause attendue. Une modification qui fait perdre
-- la première place à la bonne cause est une régression : le relecteur la voit avant d'approuver.
CREATE TABLE diagnostic.reference_cases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text UNIQUE NOT NULL,
  platform       platform.os_platform NOT NULL,
  description    text NOT NULL DEFAULT '',
  symptoms       text[] NOT NULL DEFAULT '{}',
  evidence       text NOT NULL DEFAULT '',
  expected_cause text NOT NULL REFERENCES diagnostic.causes(code) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);
