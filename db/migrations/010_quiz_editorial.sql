-- =============================================================================
-- Quiz d'entraînement dans le back-office éditorial, avec brouillon rédigé par l'IA.
-- Pourquoi :
--  - une question de quiz enseigne autant qu'une fiche : même circuit (brouillon, relecture par une
--    autre personne, publication tracée) ; l'IA propose, une personne décide (docs/03 §2.7) ;
--  - un quiz est relié à la fiche dont il vérifie la compréhension (kb.command_links).
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE editorial.revisions DROP CONSTRAINT revisions_kind_check;
ALTER TABLE editorial.revisions ADD CONSTRAINT revisions_kind_check
  CHECK (kind IN ('command', 'course', 'path', 'diagnostic_cause', 'agent_profile', 'quiz'));
ALTER TABLE editorial.revisions
  ADD COLUMN quiz_id uuid REFERENCES assessment.quizzes(id) ON DELETE CASCADE;
ALTER TABLE editorial.revisions DROP CONSTRAINT revisions_target_matches_kind;
ALTER TABLE editorial.revisions ADD CONSTRAINT revisions_target_matches_kind CHECK (
  (kind = 'command'          OR command_id IS NULL) AND
  (kind = 'course'           OR course_id  IS NULL) AND
  (kind = 'path'             OR path_id    IS NULL) AND
  (kind = 'diagnostic_cause' OR cause_code IS NULL) AND
  (kind = 'agent_profile'    OR agent_code IS NULL) AND
  (kind = 'quiz'             OR quiz_id    IS NULL)
);
CREATE UNIQUE INDEX revisions_one_open_quiz_idx ON editorial.revisions (quiz_id)
  WHERE quiz_id IS NOT NULL AND status IN ('draft', 'in_review', 'changes_requested');

-- Un quiz est publié ou non ; les questions gardent leur ordre et leur poids dans quiz_questions.
ALTER TABLE assessment.quizzes
  ADD COLUMN platform platform.os_platform,
  ADD COLUMN status platform.publish_status NOT NULL DEFAULT 'published',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
