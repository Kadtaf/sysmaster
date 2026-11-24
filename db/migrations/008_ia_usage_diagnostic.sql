-- =============================================================================
-- Usage de l'IA par utilisateur, et symptômes repérés par l'IA dans le diagnostic.
-- Pourquoi :
--  - un seul quota quotidien couvre toutes les requêtes au modèle (assistant et diagnostic) :
--    il faut savoir à qui appartient chaque appel, y compris hors conversation ;
--  - le suivi des coûts lit les jetons consommés par appel, cache compris ;
--  - un symptôme repéré par le modèle doit rester distinguable de celui que l'utilisateur a coché
--    ou que les synonymes ont trouvé, pour mesurer l'apport de l'extraction.
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE ai.agent_runs
  ADD COLUMN user_id            uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  ADD COLUMN tokens_in          int,
  ADD COLUMN tokens_out         int,
  ADD COLUMN cache_read_tokens  int,
  ADD COLUMN cache_write_tokens int;

-- Les appels déjà enregistrés appartiennent à l'auteur de leur conversation.
UPDATE ai.agent_runs r SET user_id = c.user_id FROM ai.conversations c WHERE c.id = r.conversation_id AND r.user_id IS NULL;

CREATE INDEX ai_agent_runs_user_idx ON ai.agent_runs (user_id, created_at);

ALTER TABLE diagnostic.session_symptoms DROP CONSTRAINT session_symptoms_source_check;
ALTER TABLE diagnostic.session_symptoms ADD CONSTRAINT session_symptoms_source_check
  CHECK (source IN ('user_selected', 'extracted_text', 'extracted_log', 'extracted_ai', 'probe'));
