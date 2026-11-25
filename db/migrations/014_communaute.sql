-- =============================================================================
-- Communauté : forum par catégorie, questions-réponses avec réponse acceptée, votes, modération.
-- Pourquoi :
--  - le schéma community (001) existait sans règles : on ajoute ce qui rend le forum sûr et utile ;
--  - une réponse acceptée est une vraie réponse du sujet (clé étrangère composite), jamais celle
--    d'un autre sujet ;
--  - la modération masque sans supprimer : le contenu reste consultable par les modérateurs et
--    son auteur, et la décision est tracée (qui, quand, pourquoi) ;
--  - trois signalements ouverts de personnes différentes masquent un message en attendant un
--    modérateur : un contenu abusif ne reste pas visible la nuit ;
--  - la recherche insensible aux accents réutilise la configuration kb.fr (migration 007) et sert
--    aussi à proposer des questions similaires avant publication.
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE community.categories
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN position    int  NOT NULL DEFAULT 0;

ALTER TABLE community.threads
  ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN post_count       int NOT NULL DEFAULT 0,
  ADD COLUMN hidden_at        timestamptz,
  ADD COLUMN hidden_by        uuid REFERENCES iam.users(id),
  ADD COLUMN hidden_reason    text,
  -- L'XP « aide en communauté » n'est donnée qu'une fois par sujet, même si la réponse acceptée change.
  ADD COLUMN accept_rewarded  boolean NOT NULL DEFAULT false,
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('kb.fr', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('kb.fr', coalesce(body_md, '')), 'C')) STORED,
  ADD CONSTRAINT threads_title_len CHECK (char_length(title) BETWEEN 10 AND 160),
  ADD CONSTRAINT threads_tags_max CHECK (cardinality(tags) <= 5);
CREATE INDEX threads_search_idx ON community.threads USING gin (search_vector);
CREATE INDEX threads_activity_idx ON community.threads (last_activity_at DESC);
CREATE INDEX threads_tags_idx ON community.threads USING gin (tags);

ALTER TABLE community.posts
  ADD COLUMN hidden_at     timestamptz,
  ADD COLUMN hidden_by     uuid REFERENCES iam.users(id),
  ADD COLUMN hidden_reason text,
  ADD CONSTRAINT posts_thread_id_key UNIQUE (thread_id, id);
CREATE INDEX posts_thread_idx ON community.posts (thread_id, created_at);

ALTER TABLE community.threads
  ADD CONSTRAINT threads_accepted_fk FOREIGN KEY (id, accepted_post_id)
    REFERENCES community.posts (thread_id, id);

ALTER TABLE community.reports
  ADD COLUMN resolved_by     uuid REFERENCES iam.users(id),
  ADD COLUMN resolved_at     timestamptz,
  ADD COLUMN resolution_note text,
  ADD CONSTRAINT reports_target_type CHECK (target_type IN ('thread', 'post'));
-- Un même signalement ouvert par personne et par contenu : signaler deux fois ne compte qu'une.
CREATE UNIQUE INDEX reports_one_open_idx ON community.reports (reporter_id, target_type, target_id) WHERE status = 'open';
CREATE INDEX reports_open_idx ON community.reports (created_at) WHERE status = 'open';

-- Compteur de gamification pour le badge d'entraide.
ALTER TABLE gamification.user_stats ADD COLUMN answers_accepted int NOT NULL DEFAULT 0;
