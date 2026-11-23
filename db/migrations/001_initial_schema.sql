-- =============================================================================
-- SysMaster AI Platform — schéma initial PostgreSQL 16
-- Un schéma par bounded context (ADR-004). Pas de clé étrangère inter-schémas
-- sauf vers iam.users (identité partagée, référence stable).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- e-mails insensibles à la casse
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- recherche approximative

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS skills;
CREATE SCHEMA IF NOT EXISTS learning;
CREATE SCHEMA IF NOT EXISTS kb;
CREATE SCHEMA IF NOT EXISTS diagnostic;
CREATE SCHEMA IF NOT EXISTS labs;
CREATE SCHEMA IF NOT EXISTS assessment;
CREATE SCHEMA IF NOT EXISTS gamification;
CREATE SCHEMA IF NOT EXISTS community;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS notification;

-- -----------------------------------------------------------------------------
-- Types partagés
-- -----------------------------------------------------------------------------
CREATE TYPE platform.os_platform AS ENUM (
  'windows','linux','macos','ios','ipados','android','network','cloud',
  'security','devops','docker','kubernetes','postgresql','mysql','software','cross_platform'
);
CREATE TYPE platform.difficulty AS ENUM ('beginner','intermediate','advanced','expert');
CREATE TYPE platform.risk_level AS ENUM ('none','low','medium','high','critical');
CREATE TYPE platform.publish_status AS ENUM ('draft','in_review','published','archived');

CREATE OR REPLACE FUNCTION platform.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- PLATFORM : outbox, idempotence, audit
-- -----------------------------------------------------------------------------
CREATE TABLE platform.outbox_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate     text        NOT NULL,           -- ex. 'diagnostic.session'
  aggregate_id  uuid        NOT NULL,
  type          text        NOT NULL,           -- ex. 'diagnostic.session.completed.v1'
  payload       jsonb       NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
CREATE INDEX outbox_unpublished_idx ON platform.outbox_events (occurred_at) WHERE published_at IS NULL;

CREATE TABLE platform.processed_events (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

CREATE TABLE platform.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  actor_id    uuid,
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE platform.audit_log_default PARTITION OF platform.audit_log DEFAULT;

-- -----------------------------------------------------------------------------
-- IAM : utilisateurs, identités, 2FA, passkeys, organisations, rôles
-- -----------------------------------------------------------------------------
CREATE TABLE iam.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  email_verified  boolean NOT NULL DEFAULT false,
  display_name    text NOT NULL,
  username        citext UNIQUE,
  avatar_url      text,
  locale          text NOT NULL DEFAULT 'fr',
  timezone        text NOT NULL DEFAULT 'Europe/Paris',
  password_hash   text,                         -- NULL si connexion uniquement sociale/passkey
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE TRIGGER users_touch BEFORE UPDATE ON iam.users FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE iam.external_identities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('google','microsoft','github','apple','saml','oidc')),
  provider_uid text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

CREATE TABLE iam.mfa_factors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('totp','sms','email','recovery_codes')),
  secret_enc  bytea,                            -- chiffré applicativement (KMS)
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam.passkeys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  credential_id   bytea UNIQUE NOT NULL,
  public_key      bytea NOT NULL,
  sign_count      bigint NOT NULL DEFAULT 0,
  transports      text[] NOT NULL DEFAULT '{}',
  name            text,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam.sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  user_agent   text,
  ip           inet,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON iam.sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE iam.roles (
  code        text PRIMARY KEY,                 -- learner, mentor, author, reviewer, moderator, support, admin, super_admin
  scope       text NOT NULL CHECK (scope IN ('global','organization')),
  description text NOT NULL
);
CREATE TABLE iam.permissions (
  code        text PRIMARY KEY,                 -- ex. 'course:publish'
  description text NOT NULL
);
CREATE TABLE iam.role_permissions (
  role_code       text REFERENCES iam.roles(code) ON DELETE CASCADE,
  permission_code text REFERENCES iam.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);
CREATE TABLE iam.user_roles (
  user_id   uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  role_code text REFERENCES iam.roles(code),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_code)
);

CREATE TABLE iam.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        citext UNIQUE NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('company','training_center','school','university')),
  country     char(2),
  sso_config  jsonb,
  seats       int NOT NULL DEFAULT 0 CHECK (seats >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE iam.memberships (
  organization_id uuid REFERENCES iam.organizations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  role_code       text NOT NULL REFERENCES iam.roles(code),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE iam.entitlements (
  user_id    uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  feature    text NOT NULL,                     -- ex. 'labs.windows', 'ai.diagnostics_per_month'
  value      jsonb NOT NULL,                    -- true / 50 / "unlimited"
  source     text NOT NULL,                     -- 'plan:pro', 'org:<id>', 'grant'
  expires_at timestamptz,
  PRIMARY KEY (user_id, feature, source)
);

-- -----------------------------------------------------------------------------
-- SKILLS : référentiel de compétences partagé
-- -----------------------------------------------------------------------------
CREATE TABLE skills.skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,             -- ex. 'linux.systemd.units'
  name        text NOT NULL,
  platform    platform.os_platform NOT NULL,
  description text
);
CREATE TABLE skills.prerequisites (
  skill_id        uuid REFERENCES skills.skills(id) ON DELETE CASCADE,
  requires_skill  uuid REFERENCES skills.skills(id) ON DELETE CASCADE,
  PRIMARY KEY (skill_id, requires_skill),
  CHECK (skill_id <> requires_skill)
);
CREATE TABLE skills.user_skill_scores (
  user_id    uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  skill_id   uuid REFERENCES skills.skills(id) ON DELETE CASCADE,
  score      numeric(5,2) NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  confidence numeric(4,3) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_id)
);

-- -----------------------------------------------------------------------------
-- LEARNING : parcours, cours, modules, leçons, inscriptions, progression
-- -----------------------------------------------------------------------------
CREATE TABLE learning.careers (
  code  text PRIMARY KEY,                       -- it_technician, sysadmin, systems_engineer, cloud, cybersecurity, devops
  name  text NOT NULL,
  description text
);
CREATE TABLE learning.learning_paths (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL,
  title        text NOT NULL,
  summary      text NOT NULL,
  career_code  text REFERENCES learning.careers(code),
  difficulty   platform.difficulty NOT NULL,
  est_hours    int CHECK (est_hours > 0),
  status       platform.publish_status NOT NULL DEFAULT 'draft',
  locale       text NOT NULL DEFAULT 'fr',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE learning.courses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL,
  title        text NOT NULL,
  summary      text NOT NULL,
  platform     platform.os_platform NOT NULL,
  difficulty   platform.difficulty NOT NULL,
  author_id    uuid REFERENCES iam.users(id),
  status       platform.publish_status NOT NULL DEFAULT 'draft',
  is_premium   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE learning.path_courses (
  path_id   uuid REFERENCES learning.learning_paths(id) ON DELETE CASCADE,
  course_id uuid REFERENCES learning.courses(id) ON DELETE CASCADE,
  position  int NOT NULL,
  PRIMARY KEY (path_id, course_id),
  UNIQUE (path_id, position)
);
CREATE TABLE learning.modules (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES learning.courses(id) ON DELETE CASCADE,
  title     text NOT NULL,
  position  int NOT NULL,
  UNIQUE (course_id, position)
);
CREATE TABLE learning.lessons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid NOT NULL REFERENCES learning.modules(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  title       text NOT NULL,
  type        text NOT NULL CHECK (type IN ('reading','video','interactive','lab','quiz','case_study')),
  content_md  text,
  objectives  text[] NOT NULL DEFAULT '{}',
  est_minutes int CHECK (est_minutes > 0),
  position    int NOT NULL,
  lab_template_id uuid,                         -- référence logique vers labs.lab_templates
  quiz_id         uuid,                         -- référence logique vers assessment.quizzes
  UNIQUE (module_id, position),
  UNIQUE (module_id, slug)
);
CREATE TABLE learning.lesson_skills (
  lesson_id uuid REFERENCES learning.lessons(id) ON DELETE CASCADE,
  skill_id  uuid REFERENCES skills.skills(id) ON DELETE CASCADE,
  weight    numeric(3,2) NOT NULL DEFAULT 1,
  PRIMARY KEY (lesson_id, skill_id)
);
CREATE TABLE learning.enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  path_id     uuid NOT NULL REFERENCES learning.learning_paths(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  progress_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  UNIQUE (user_id, path_id)
);
CREATE TABLE learning.lesson_progress (
  user_id      uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  lesson_id    uuid REFERENCES learning.lessons(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('not_started','in_progress','completed')),
  time_spent_s int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  PRIMARY KEY (user_id, lesson_id)
);
CREATE TABLE learning.user_goals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  target     jsonb NOT NULL,                    -- ex. {"type":"certification","code":"LINUX-ADMIN"}
  due_date   date,
  source     text NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai_recommendation')),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','abandoned')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- KB : base de connaissances (fiches commandes et concepts)
-- -----------------------------------------------------------------------------
CREATE TABLE kb.commands (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text UNIQUE NOT NULL,     -- ex. 'linux-systemctl'
  name               text NOT NULL,            -- ex. 'systemctl'
  platform           platform.os_platform NOT NULL,
  shell              text,                     -- cmd, powershell, bash, zsh…
  summary            text NOT NULL,            -- utilité
  history            text,                     -- historique
  internals          text,                     -- fonctionnement interne
  architecture       text,                     -- architecture interne
  syntax             text NOT NULL,
  why                text NOT NULL,            -- pourquoi l'utiliser
  when_to_use        text NOT NULL,            -- quand
  context            text,                     -- dans quel contexte
  best_practices     text[] NOT NULL DEFAULT '{}',
  common_errors      jsonb NOT NULL DEFAULT '[]', -- [{error, cause, fix}]
  risk_level         platform.risk_level NOT NULL DEFAULT 'none',
  risks              jsonb NOT NULL DEFAULT '[]', -- [{level, text}]
  difficulty         platform.difficulty NOT NULL,
  requires_admin     boolean NOT NULL DEFAULT false,
  status             platform.publish_status NOT NULL DEFAULT 'draft',
  locale             text NOT NULL DEFAULT 'fr',
  search_vector      tsvector GENERATED ALWAYS AS (
                       setweight(to_tsvector('simple', coalesce(name,'')), 'A') ||
                       setweight(to_tsvector('french', coalesce(summary,'')), 'B') ||
                       setweight(to_tsvector('french', coalesce(why,'')), 'C')) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commands_search_idx ON kb.commands USING gin (search_vector);
CREATE INDEX commands_name_trgm ON kb.commands USING gin (name gin_trgm_ops);
CREATE TRIGGER commands_touch BEFORE UPDATE ON kb.commands FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE kb.command_parameters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id  uuid NOT NULL REFERENCES kb.commands(id) ON DELETE CASCADE,
  flag        text NOT NULL,                   -- ex. '/f', '--now'
  description text NOT NULL,
  risk_level  platform.risk_level NOT NULL DEFAULT 'none',
  position    int NOT NULL DEFAULT 0,
  UNIQUE (command_id, flag)
);
CREATE TABLE kb.command_examples (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id  uuid NOT NULL REFERENCES kb.commands(id) ON DELETE CASCADE,
  title       text NOT NULL,
  code        text NOT NULL,
  explanation text NOT NULL,                   -- obligatoire : pas d'exemple sans explication
  expected_output text,
  is_real_case boolean NOT NULL DEFAULT false, -- cas réel
  position    int NOT NULL DEFAULT 0,
  UNIQUE (command_id, title)
);
CREATE TABLE kb.command_alternatives (
  command_id     uuid REFERENCES kb.commands(id) ON DELETE CASCADE,
  alternative_id uuid REFERENCES kb.commands(id) ON DELETE CASCADE,
  note           text NOT NULL,                -- quand préférer l'alternative
  PRIMARY KEY (command_id, alternative_id),
  CHECK (command_id <> alternative_id)
);
CREATE TABLE kb.concepts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  title      text NOT NULL,
  platform   platform.os_platform NOT NULL,
  body_md    text NOT NULL,
  difficulty platform.difficulty NOT NULL,
  status     platform.publish_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kb.sources (                      -- références documentaires citées
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  url        text UNIQUE NOT NULL,
  publisher  text NOT NULL,                    -- Microsoft, Apple, Docker…
  retrieved_at date
);
CREATE TABLE kb.command_sources (
  command_id uuid REFERENCES kb.commands(id) ON DELETE CASCADE,
  source_id  uuid REFERENCES kb.sources(id) ON DELETE CASCADE,
  PRIMARY KEY (command_id, source_id)
);
CREATE TABLE kb.command_links (               -- liens vers quiz, TP, leçons
  command_id  uuid REFERENCES kb.commands(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('quiz','lab','lesson','concept')),
  target_id   uuid NOT NULL,
  PRIMARY KEY (command_id, target_type, target_id)
);

-- -----------------------------------------------------------------------------
-- DIAGNOSTIC : sessions, symptômes, causes, règles, preuves, hypothèses
-- -----------------------------------------------------------------------------
CREATE TABLE diagnostic.symptoms (
  code        text PRIMARY KEY,                -- ex. 'unexpected_reboot'
  label       text NOT NULL,
  platform    platform.os_platform NOT NULL,
  synonyms    text[] NOT NULL DEFAULT '{}'      -- aide l'extraction depuis le texte libre
);
CREATE TABLE diagnostic.causes (
  code         text PRIMARY KEY,               -- ex. 'overheating'
  label        text NOT NULL,
  platform     platform.os_platform NOT NULL,
  prior        numeric(6,5) NOT NULL CHECK (prior > 0 AND prior <= 1),
  explanation  text NOT NULL,
  action_plan  jsonb NOT NULL DEFAULT '[]',    -- [{step, why, risk, command_slug?}]
  related_lesson_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE TABLE diagnostic.rules (                -- P(symptôme | cause)
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symptom_code text NOT NULL REFERENCES diagnostic.symptoms(code) ON DELETE CASCADE,
  cause_code   text NOT NULL REFERENCES diagnostic.causes(code) ON DELETE CASCADE,
  likelihood   numeric(4,3) NOT NULL CHECK (likelihood > 0 AND likelihood < 1),
  rationale    text NOT NULL,
  reviewed_by  uuid REFERENCES iam.users(id),
  version      int NOT NULL DEFAULT 1,
  UNIQUE (symptom_code, cause_code)
);
CREATE TABLE diagnostic.evidence_patterns (    -- ex. Event ID 41 → alimentation
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  source     text NOT NULL CHECK (source IN ('windows_event','syslog','journald','docker','postgresql','nginx','apache','macos_log','screenshot_ocr')),
  pattern    text NOT NULL,                    -- regex
  cause_code text NOT NULL REFERENCES diagnostic.causes(code) ON DELETE CASCADE,
  boost      numeric(5,2) NOT NULL CHECK (boost > 0) -- facteur multiplicatif de vraisemblance
);
CREATE TABLE diagnostic.sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  platform    platform.os_platform NOT NULL,
  description text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','analyzing','completed','abandoned')),
  resolved    boolean,                         -- retour utilisateur : la piste a-t-elle résolu ?
  resolved_cause_code text REFERENCES diagnostic.causes(code),
  created_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX diag_sessions_user_idx ON diagnostic.sessions (user_id, created_at DESC);
CREATE TABLE diagnostic.session_symptoms (
  session_id   uuid REFERENCES diagnostic.sessions(id) ON DELETE CASCADE,
  symptom_code text REFERENCES diagnostic.symptoms(code),
  source       text NOT NULL CHECK (source IN ('user_selected','extracted_text','extracted_log','probe')),
  PRIMARY KEY (session_id, symptom_code)
);
CREATE TABLE diagnostic.attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES diagnostic.sessions(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('screenshot','log_file','probe_report')),
  storage_key text NOT NULL,                   -- clé S3
  sha256      char(64) NOT NULL,
  size_bytes  bigint NOT NULL,
  pii_redacted boolean NOT NULL DEFAULT false,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE diagnostic.hypotheses (
  session_id  uuid REFERENCES diagnostic.sessions(id) ON DELETE CASCADE,
  cause_code  text REFERENCES diagnostic.causes(code),
  probability numeric(5,4) NOT NULL CHECK (probability BETWEEN 0 AND 1),
  rank        int NOT NULL,
  explanation text NOT NULL,
  PRIMARY KEY (session_id, cause_code)
);
CREATE TABLE diagnostic.probe_devices (       -- machines connectées via l'agent
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  hostname    text NOT NULL,
  platform    platform.os_platform NOT NULL,
  os_version  text,
  cert_fingerprint char(64) UNIQUE NOT NULL,
  last_seen_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- LABS : modèles, scénarios de panne, instances
-- -----------------------------------------------------------------------------
CREATE TABLE labs.lab_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text UNIQUE NOT NULL,
  title          text NOT NULL,
  category       text NOT NULL CHECK (category IN ('windows','linux','macos','docker','network','cyber','cloud','database')),
  difficulty     platform.difficulty NOT NULL,
  runtime        text NOT NULL CHECK (runtime IN ('container','microvm','windows_vm','simulation')),
  image_ref      text,                         -- image OCI / gabarit VM
  brief_md       text NOT NULL,                -- énoncé
  objectives     text[] NOT NULL DEFAULT '{}',
  hints          jsonb NOT NULL DEFAULT '[]',  -- indices progressifs
  solution_md    text,                         -- explication après résolution
  ttl_minutes    int NOT NULL DEFAULT 60,
  is_premium     boolean NOT NULL DEFAULT false,
  author_id      uuid REFERENCES iam.users(id),
  marketplace_product_id uuid,                 -- si vendu sur la marketplace
  status         platform.publish_status NOT NULL DEFAULT 'draft',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE labs.fault_scenarios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES labs.lab_templates(id) ON DELETE CASCADE,
  name         text NOT NULL,
  inject_script text NOT NULL,                 -- script versionné d'injection de panne
  real_world_reference text                    -- incident réel reproduit
);
CREATE TABLE labs.validators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES labs.lab_templates(id) ON DELETE CASCADE,
  description text NOT NULL,
  check_script text NOT NULL,                  -- doit sortir 0 si l'objectif est atteint
  points      int NOT NULL DEFAULT 10
);
CREATE TABLE labs.instances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES labs.lab_templates(id),
  scenario_id  uuid REFERENCES labs.fault_scenarios(id),
  user_id      uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning','running','paused','solved','expired','failed')),
  node_ref     text,
  hints_used   int NOT NULL DEFAULT 0,
  score        int,
  started_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ended_at     timestamptz
);
CREATE INDEX lab_instances_active_idx ON labs.instances (user_id) WHERE status IN ('provisioning','running','paused');

-- -----------------------------------------------------------------------------
-- ASSESSMENT : quiz, examens, tentatives, certifications
-- -----------------------------------------------------------------------------
CREATE TABLE assessment.questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('single','multiple','ordering','command','free_text','lab_task')),
  prompt_md   text NOT NULL,
  choices     jsonb,                           -- [{id, text}]
  answer      jsonb NOT NULL,                  -- stocké séparément du contenu exposé
  explanation text NOT NULL,                   -- pourquoi c'est la bonne réponse
  difficulty  platform.difficulty NOT NULL,
  platform    platform.os_platform NOT NULL,
  generated_by_ai boolean NOT NULL DEFAULT false,
  reviewed    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE assessment.question_skills (
  question_id uuid REFERENCES assessment.questions(id) ON DELETE CASCADE,
  skill_id    uuid REFERENCES skills.skills(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, skill_id)
);
CREATE TABLE assessment.quizzes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  title       text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('practice','exam')),
  time_limit_s int,
  pass_score  int NOT NULL DEFAULT 70 CHECK (pass_score BETWEEN 0 AND 100),
  shuffle     boolean NOT NULL DEFAULT true
);
CREATE TABLE assessment.quiz_questions (
  quiz_id     uuid REFERENCES assessment.quizzes(id) ON DELETE CASCADE,
  question_id uuid REFERENCES assessment.questions(id) ON DELETE CASCADE,
  position    int NOT NULL,
  weight      numeric(4,2) NOT NULL DEFAULT 1,
  PRIMARY KEY (quiz_id, question_id)
);
CREATE TABLE assessment.attempts (              -- append-only (audit / anti-triche)
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id     uuid NOT NULL REFERENCES assessment.quizzes(id),
  user_id     uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score       numeric(5,2),
  passed      boolean,
  answers     jsonb NOT NULL DEFAULT '{}',
  proctoring  jsonb NOT NULL DEFAULT '{}'      -- signaux d'intégrité
);
CREATE INDEX attempts_user_idx ON assessment.attempts (user_id, started_at DESC);
CREATE TABLE assessment.certifications (
  code          text PRIMARY KEY,               -- WIN-TECH, WIN-ADMIN, LINUX-ADMIN…
  title         text NOT NULL,
  description   text NOT NULL,
  level         platform.difficulty NOT NULL,
  exam_quiz_id  uuid REFERENCES assessment.quizzes(id),
  required_labs text[] NOT NULL DEFAULT '{}',   -- slugs de labs à réussir
  prerequisites text[] NOT NULL DEFAULT '{}',   -- codes de certifications
  validity_months int,                          -- NULL = sans expiration
  price_cents   int NOT NULL DEFAULT 0
);
CREATE TABLE assessment.certificates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial        text UNIQUE NOT NULL,           -- ex. SM-2026-LNX-7F3K9Q
  certification_code text NOT NULL REFERENCES assessment.certifications(code),
  user_id       uuid NOT NULL REFERENCES iam.users(id),
  attempt_id    uuid REFERENCES assessment.attempts(id),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoke_reason text,
  pdf_storage_key text,
  signature     text NOT NULL                   -- signature Ed25519 du contenu, vérifiable via QR
);

-- -----------------------------------------------------------------------------
-- GAMIFICATION : XP (registre append-only), niveaux, badges, défis
-- -----------------------------------------------------------------------------
CREATE TABLE gamification.xp_ledger (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  user_id     uuid NOT NULL,
  amount      int NOT NULL,
  reason      text NOT NULL,                    -- 'lesson.completed', 'lab.solved'…
  source_event_id uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at),
  UNIQUE (source_event_id, created_at)          -- idempotence
) PARTITION BY RANGE (created_at);
CREATE TABLE gamification.xp_ledger_default PARTITION OF gamification.xp_ledger DEFAULT;

CREATE TABLE gamification.user_stats (          -- read model
  user_id     uuid PRIMARY KEY REFERENCES iam.users(id) ON DELETE CASCADE,
  total_xp    bigint NOT NULL DEFAULT 0,
  level       int NOT NULL DEFAULT 1,
  streak_days int NOT NULL DEFAULT 0,
  last_activity_date date
);
CREATE TABLE gamification.levels (
  level       int PRIMARY KEY,
  min_xp      bigint NOT NULL UNIQUE,
  title       text NOT NULL
);
CREATE TABLE gamification.badges (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL,
  icon        text NOT NULL,
  rarity      text NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
  criteria    jsonb NOT NULL
);
CREATE TABLE gamification.user_badges (
  user_id    uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  badge_code text REFERENCES gamification.badges(code),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_code)
);
CREATE TABLE gamification.challenges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  description text NOT NULL,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  reward_xp  int NOT NULL,
  criteria   jsonb NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE TABLE gamification.challenge_participants (
  challenge_id uuid REFERENCES gamification.challenges(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  progress     jsonb NOT NULL DEFAULT '{}',
  completed_at timestamptz,
  PRIMARY KEY (challenge_id, user_id)
);

-- -----------------------------------------------------------------------------
-- COMMUNITY : forum, Q&R, partages, mentorat, groupes d'étude
-- -----------------------------------------------------------------------------
CREATE TABLE community.categories (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug     text UNIQUE NOT NULL,
  name     text NOT NULL,
  platform platform.os_platform
);
CREATE TABLE community.threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid NOT NULL REFERENCES community.categories(id),
  author_id    uuid NOT NULL REFERENCES iam.users(id),
  kind         text NOT NULL CHECK (kind IN ('discussion','question','lab_share','script_share')),
  title        text NOT NULL,
  body_md      text NOT NULL,
  tags         text[] NOT NULL DEFAULT '{}',
  accepted_post_id uuid,
  is_locked    boolean NOT NULL DEFAULT false,
  score        int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX threads_category_idx ON community.threads (category_id, created_at DESC);
CREATE TABLE community.posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES community.threads(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES iam.users(id),
  body_md    text NOT NULL,
  score      int NOT NULL DEFAULT 0,
  is_ai_assisted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at  timestamptz
);
CREATE TABLE community.votes (
  user_id     uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('thread','post')),
  target_id   uuid NOT NULL,
  value       smallint NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE TABLE community.shared_scripts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid REFERENCES community.threads(id) ON DELETE CASCADE,
  language    text NOT NULL,                    -- powershell, bash, python…
  code        text NOT NULL,
  explanation text NOT NULL,                    -- obligatoire (philosophie)
  risk_level  platform.risk_level NOT NULL,
  reviewed    boolean NOT NULL DEFAULT false
);
CREATE TABLE community.reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES iam.users(id),
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community.study_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  owner_id    uuid NOT NULL REFERENCES iam.users(id),
  goal        text,
  is_public   boolean NOT NULL DEFAULT true,
  max_members int NOT NULL DEFAULT 20,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community.study_group_members (
  group_id  uuid REFERENCES community.study_groups(id) ON DELETE CASCADE,
  user_id   uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE community.mentorships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id  uuid NOT NULL REFERENCES iam.users(id),
  mentee_id  uuid NOT NULL REFERENCES iam.users(id),
  topic      text NOT NULL,
  status     text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','active','ended','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mentor_id <> mentee_id)
);

-- -----------------------------------------------------------------------------
-- BILLING : plans, abonnements, factures, coupons, affiliation, marketplace
-- -----------------------------------------------------------------------------
CREATE TABLE billing.plans (
  code            text PRIMARY KEY,             -- free, premium, pro, enterprise, training_center, school, university
  name            text NOT NULL,
  price_cents     int,                          -- NULL = sur devis
  currency        char(3) NOT NULL DEFAULT 'EUR',
  interval        text CHECK (interval IN ('month','year')),
  per_seat        boolean NOT NULL DEFAULT false,
  stripe_price_id text UNIQUE,
  features        jsonb NOT NULL,               -- entitlements accordés
  is_public       boolean NOT NULL DEFAULT true
);
CREATE TABLE billing.customers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid UNIQUE REFERENCES iam.users(id),
  organization_id    uuid UNIQUE REFERENCES iam.organizations(id),
  stripe_customer_id text UNIQUE NOT NULL,
  tax_id             text,
  CHECK ((user_id IS NULL) <> (organization_id IS NULL))
);
CREATE TABLE billing.subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id            uuid NOT NULL REFERENCES billing.customers(id),
  plan_code              text NOT NULL REFERENCES billing.plans(code),
  stripe_subscription_id text UNIQUE,
  status                 text NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','incomplete','paused')),
  seats                  int NOT NULL DEFAULT 1,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing.invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES billing.customers(id),
  stripe_invoice_id text UNIQUE NOT NULL,
  amount_cents      int NOT NULL,
  currency          char(3) NOT NULL,
  status            text NOT NULL,
  pdf_url           text,
  issued_at         timestamptz NOT NULL
);
CREATE TABLE billing.coupons (
  code             text PRIMARY KEY,
  stripe_coupon_id text UNIQUE,
  percent_off      numeric(5,2) CHECK (percent_off BETWEEN 0 AND 100),
  amount_off_cents int,
  max_redemptions  int,
  redeemed_count   int NOT NULL DEFAULT 0,
  valid_until      timestamptz,
  CHECK ((percent_off IS NULL) <> (amount_off_cents IS NULL))
);
CREATE TABLE billing.affiliates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid UNIQUE NOT NULL REFERENCES iam.users(id),
  referral_code  text UNIQUE NOT NULL,
  commission_pct numeric(5,2) NOT NULL DEFAULT 20,
  stripe_connect_account_id text
);
CREATE TABLE billing.referrals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id   uuid NOT NULL REFERENCES billing.affiliates(id),
  referred_user_id uuid UNIQUE NOT NULL REFERENCES iam.users(id),
  converted_at   timestamptz,
  commission_cents int
);
CREATE TABLE billing.marketplace_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    uuid NOT NULL REFERENCES iam.users(id),
  kind         text NOT NULL CHECK (kind IN ('course','lab_pack','script_pack','exam_prep')),
  title        text NOT NULL,
  description  text NOT NULL,
  price_cents  int NOT NULL CHECK (price_cents >= 0),
  currency     char(3) NOT NULL DEFAULT 'EUR',
  revenue_share_pct numeric(5,2) NOT NULL DEFAULT 70,
  status       platform.publish_status NOT NULL DEFAULT 'draft',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing.marketplace_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES billing.marketplace_products(id),
  buyer_id    uuid NOT NULL REFERENCES iam.users(id),
  amount_cents int NOT NULL,
  stripe_payment_intent_id text UNIQUE,
  status      text NOT NULL CHECK (status IN ('pending','paid','refunded')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing.stripe_webhook_events (   -- idempotence des webhooks
  stripe_event_id text PRIMARY KEY,
  type            text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

-- -----------------------------------------------------------------------------
-- AI : profils d'agents, conversations, exécutions, RAG
-- -----------------------------------------------------------------------------
CREATE TABLE ai.agent_profiles (
  code          text PRIMARY KEY,               -- tutor, diagnostician, windows_expert…
  name          text NOT NULL,
  mission       text NOT NULL,
  system_prompt text NOT NULL,
  tools         text[] NOT NULL DEFAULT '{}',
  rag_filters   jsonb NOT NULL DEFAULT '{}',    -- ex. {"publisher":["Microsoft"]}
  model_tier    text NOT NULL DEFAULT 'standard' CHECK (model_tier IN ('small','standard','large')),
  version       int NOT NULL DEFAULT 1,
  enabled       boolean NOT NULL DEFAULT true
);
CREATE TABLE ai.conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  title       text,
  context     jsonb NOT NULL DEFAULT '{}',      -- leçon, lab ou diagnostic en cours
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai.messages (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  role            text NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  agent_code      text,
  content         jsonb NOT NULL,               -- réponse structurée (why/how/risks/sources…)
  citations       jsonb NOT NULL DEFAULT '[]',
  tokens_in       int,
  tokens_out      int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE ai.messages_default PARTITION OF ai.messages DEFAULT;
CREATE INDEX ai_messages_conv_idx ON ai.messages (conversation_id, created_at);
CREATE TABLE ai.agent_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  agent_code   text NOT NULL,
  model        text NOT NULL,
  latency_ms   int,
  cost_micro_eur bigint,
  outcome      text NOT NULL CHECK (outcome IN ('ok','refused','error','guardrail_blocked')),
  trace_id     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai.feedback (
  message_id uuid NOT NULL,
  user_id    uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE ai.rag_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher   text UNIQUE NOT NULL,             -- Microsoft, Linux man-pages, Apple, Docker, PostgreSQL, Kubernetes
  base_url    text NOT NULL,
  license     text NOT NULL,
  crawl_rules jsonb NOT NULL DEFAULT '{}',
  enabled     boolean NOT NULL DEFAULT true,
  last_ingested_at timestamptz
);
CREATE TABLE ai.rag_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES ai.rag_sources(id) ON DELETE CASCADE,
  url         text UNIQUE NOT NULL,
  title       text NOT NULL,
  product     text,
  version     text,
  content_hash char(64) NOT NULL,
  fetched_at  timestamptz NOT NULL
);
CREATE TABLE ai.rag_chunks (                     -- le vecteur vit dans Qdrant (même id)
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES ai.rag_documents(id) ON DELETE CASCADE,
  heading_path text[] NOT NULL DEFAULT '{}',
  content     text NOT NULL,
  token_count int NOT NULL,
  position    int NOT NULL
);

-- -----------------------------------------------------------------------------
-- NOTIFICATION
-- -----------------------------------------------------------------------------
CREATE TABLE notification.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('in_app','email','push')),
  type       text NOT NULL,
  payload    jsonb NOT NULL,
  read_at    timestamptz,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_unread_idx ON notification.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE TABLE notification.preferences (
  user_id uuid REFERENCES iam.users(id) ON DELETE CASCADE,
  type    text NOT NULL,
  channel text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, type, channel)
);

-- -----------------------------------------------------------------------------
-- READ MODELS (CQRS) : tableau de bord et classement
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW learning.dashboard_progress AS
SELECT e.user_id,
       e.path_id,
       p.title AS path_title,
       e.progress_pct,
       count(lp.lesson_id) FILTER (WHERE lp.status = 'completed') AS lessons_completed,
       max(lp.completed_at) AS last_activity
FROM learning.enrollments e
JOIN learning.learning_paths p ON p.id = e.path_id
LEFT JOIN learning.lesson_progress lp ON lp.user_id = e.user_id
GROUP BY e.user_id, e.path_id, p.title, e.progress_pct;
CREATE UNIQUE INDEX dashboard_progress_pk ON learning.dashboard_progress (user_id, path_id);

CREATE VIEW gamification.leaderboard AS
SELECT us.user_id, u.display_name, us.total_xp, us.level,
       rank() OVER (ORDER BY us.total_xp DESC) AS position
FROM gamification.user_stats us
JOIN iam.users u ON u.id = us.user_id
WHERE u.status = 'active';
