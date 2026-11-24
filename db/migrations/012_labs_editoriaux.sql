-- =============================================================================
-- 012 — Labs simulés rédigés dans le back-office éditorial
-- Même circuit que les fiches et les quiz : brouillon, relecture par une autre personne,
-- publication tracée. La démarche de référence (walkthrough) est rejouée avant publication.
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE editorial.revisions DROP CONSTRAINT revisions_kind_check;
ALTER TABLE editorial.revisions ADD CONSTRAINT revisions_kind_check
  CHECK (kind IN ('command', 'course', 'path', 'diagnostic_cause', 'agent_profile', 'quiz', 'lab'));
ALTER TABLE editorial.revisions
  ADD COLUMN lab_id uuid REFERENCES labs.lab_templates(id) ON DELETE CASCADE;
ALTER TABLE editorial.revisions DROP CONSTRAINT revisions_target_matches_kind;
ALTER TABLE editorial.revisions ADD CONSTRAINT revisions_target_matches_kind CHECK (
  (kind = 'command'          OR command_id IS NULL) AND
  (kind = 'course'           OR course_id  IS NULL) AND
  (kind = 'path'             OR path_id    IS NULL) AND
  (kind = 'diagnostic_cause' OR cause_code IS NULL) AND
  (kind = 'agent_profile'    OR agent_code IS NULL) AND
  (kind = 'quiz'             OR quiz_id    IS NULL) AND
  (kind = 'lab'              OR lab_id     IS NULL)
);
CREATE UNIQUE INDEX revisions_one_open_lab_idx ON editorial.revisions (lab_id)
  WHERE lab_id IS NOT NULL AND status IN ('draft', 'in_review', 'changes_requested');
