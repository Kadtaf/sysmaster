-- =============================================================================
-- Mentorat et groupes d'étude (docs/03 §2.9).
-- Pourquoi :
--  - un mentor se déclare (profil : sujets, disponibilité, nombre d'apprenants suivis) ; seul le rôle
--    `mentor` peut le faire, pour que la mise en relation reste encadrée ;
--  - une demande de mentorat porte un sujet et un message : le mentor décide en connaissance de cause ;
--    une seule demande ouverte par binôme ;
--  - un groupe d'étude est public (on le rejoint librement) ou privé (sur code d'invitation) ;
--  - les échanges d'un groupe ou d'un binôme ne sont lus que par leurs membres : une table de messages
--    commune, masquables par leur auteur, le responsable du groupe ou un modérateur (rien n'est effacé).
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE community.study_groups
  ADD COLUMN invite_code text UNIQUE,
  ADD CONSTRAINT study_groups_name_len CHECK (char_length(name) BETWEEN 3 AND 80),
  ADD CONSTRAINT study_groups_max_members CHECK (max_members BETWEEN 2 AND 50),
  ADD CONSTRAINT study_groups_private_code CHECK (is_public OR invite_code IS NOT NULL);
CREATE INDEX study_groups_public_idx ON community.study_groups (created_at DESC) WHERE is_public;

ALTER TABLE community.study_group_members
  ADD COLUMN role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member'));
CREATE INDEX study_group_members_user_idx ON community.study_group_members (user_id);

CREATE TABLE community.mentor_profiles (
  user_id     uuid PRIMARY KEY REFERENCES iam.users(id) ON DELETE CASCADE,
  bio         text NOT NULL CHECK (char_length(bio) BETWEEN 20 AND 1000),
  topics      text[] NOT NULL CHECK (cardinality(topics) BETWEEN 1 AND 8),
  accepting   boolean NOT NULL DEFAULT true,
  max_mentees int NOT NULL DEFAULT 3 CHECK (max_mentees BETWEEN 1 AND 10),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_profiles_topics_idx ON community.mentor_profiles USING gin (topics);

ALTER TABLE community.mentorships
  ADD COLUMN message      text NOT NULL DEFAULT '',
  ADD COLUMN responded_at timestamptz,
  ADD COLUMN ended_at     timestamptz;
-- Une seule demande ou relation en cours par binôme.
CREATE UNIQUE INDEX mentorships_one_open_idx ON community.mentorships (mentor_id, mentee_id) WHERE status IN ('requested', 'active');
CREATE INDEX mentorships_mentee_idx ON community.mentorships (mentee_id, created_at DESC);

CREATE TABLE community.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     text NOT NULL CHECK (channel IN ('group', 'mentorship')),
  channel_id  uuid NOT NULL,
  author_id   uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  body_md     text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  hidden_at   timestamptz,
  hidden_by   uuid REFERENCES iam.users(id)
);
CREATE INDEX messages_channel_idx ON community.messages (channel, channel_id, created_at);
