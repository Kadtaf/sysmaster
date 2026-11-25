-- =============================================================================
-- Partage de scripts et de labs dans la communauté (docs/03 §2.9, principe P-5).
-- Pourquoi :
--  - un script partagé porte toujours son explication et son niveau de risque (déjà NOT NULL en 001) ;
--    on ajoute la trace de relecture : seuls les scripts relus sont mis en avant, et modifier le code
--    le renvoie en relecture ;
--  - un partage de lab pointe vers le lab publié : la démarche n'est montrée qu'à ceux qui l'ont
--    résolu, pour ne rien gâcher aux autres.
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE community.threads
  ADD COLUMN lab_slug text REFERENCES labs.lab_templates(slug) ON UPDATE CASCADE,
  ADD CONSTRAINT threads_lab_share_slug CHECK ((kind = 'lab_share') = (lab_slug IS NOT NULL));
CREATE INDEX threads_lab_idx ON community.threads (lab_slug) WHERE lab_slug IS NOT NULL;

ALTER TABLE community.shared_scripts
  ALTER COLUMN thread_id SET NOT NULL,
  ADD COLUMN reviewed_by uuid REFERENCES iam.users(id),
  ADD COLUMN reviewed_at timestamptz,
  ADD CONSTRAINT shared_scripts_one_per_thread UNIQUE (thread_id),
  ADD CONSTRAINT shared_scripts_language CHECK (language IN ('bash', 'powershell', 'python', 'sql', 'yaml', 'other')),
  ADD CONSTRAINT shared_scripts_code_len CHECK (char_length(code) BETWEEN 1 AND 20000),
  ADD CONSTRAINT shared_scripts_explanation_len CHECK (char_length(explanation) >= 40);
