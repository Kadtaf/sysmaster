-- =============================================================================
-- Examens : niveaux de difficulté tirés (docs/03 §2.7).
-- Pourquoi : deux certifications d'une même plateforme (Windows Technician et Administrator,
-- Linux Administrator et Server Expert) tiraient dans la même banque. Une certification peut
-- désormais limiter le tirage à certains niveaux ; vide = tous les niveaux.
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE assessment.certifications
  ADD COLUMN exam_difficulties platform.difficulty[] NOT NULL DEFAULT '{}';
