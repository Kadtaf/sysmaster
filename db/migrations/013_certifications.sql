-- =============================================================================
-- Certifications : examens chronométrés tirés d'une banque, certificats signés et vérifiables.
-- Pourquoi :
--  - une certification = examen théorique + labs pratiques réussis + prérequis (docs/03 §2.7) ;
--  - l'examen tire ses questions au sort dans la banque relue (assessment.questions) des
--    plateformes de la certification : deux candidats n'ont pas le même examen, et une question
--    n'est jamais servie sans relecture humaine ;
--  - la session d'examen garde les questions tirées, l'échéance et les signaux d'intégrité :
--    la correction se fait côté serveur, sur ce qui a été servi, et l'heure fait foi ;
--  - un certificat est signé (Ed25519) sur un contenu canonique qui inclut le nom du titulaire :
--    la page publique /verify/<numéro> prouve qu'il a été émis par SysMaster et non modifié.
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE assessment.certifications
  ADD COLUMN exam_platforms      platform.os_platform[] NOT NULL DEFAULT '{}',
  ADD COLUMN exam_question_count int NOT NULL DEFAULT 20 CHECK (exam_question_count BETWEEN 5 AND 100),
  ADD COLUMN exam_time_limit_s   int NOT NULL DEFAULT 1800 CHECK (exam_time_limit_s BETWEEN 300 AND 14400),
  ADD COLUMN pass_score          int NOT NULL DEFAULT 70 CHECK (pass_score BETWEEN 50 AND 100),
  -- Délai avant une nouvelle tentative après un échec : on révise, on ne tente pas sa chance en boucle.
  ADD COLUMN retry_after_hours   int NOT NULL DEFAULT 24 CHECK (retry_after_hours BETWEEN 0 AND 720);

CREATE TABLE assessment.exam_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_code text NOT NULL REFERENCES assessment.certifications(code),
  user_id            uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  question_ids       uuid[] NOT NULL,              -- tirées au sort, dans l'ordre servi
  started_at         timestamptz NOT NULL DEFAULT now(),
  deadline_at        timestamptz NOT NULL,
  submitted_at       timestamptz,
  score              int,
  passed             boolean,
  answers            jsonb NOT NULL DEFAULT '{}',
  -- Surveillance légère, déclarée par le navigateur : changements d'onglet, collages. Conservée
  -- pour la relecture d'un cas litigieux ; n'entraîne aucun échec automatique.
  integrity          jsonb NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX exam_sessions_one_open_idx ON assessment.exam_sessions (user_id, certification_code) WHERE submitted_at IS NULL;
CREATE INDEX exam_sessions_user_idx ON assessment.exam_sessions (user_id, started_at DESC);

ALTER TABLE assessment.certificates
  ADD COLUMN holder_name     text,
  ADD COLUMN exam_session_id uuid REFERENCES assessment.exam_sessions(id),
  ADD COLUMN score           int,
  ADD COLUMN revoked_by      uuid REFERENCES iam.users(id);
UPDATE assessment.certificates c SET holder_name = u.display_name FROM iam.users u WHERE u.id = c.user_id AND c.holder_name IS NULL;
ALTER TABLE assessment.certificates ALTER COLUMN holder_name SET NOT NULL;
CREATE INDEX certificates_user_idx ON assessment.certificates (user_id, issued_at DESC);
