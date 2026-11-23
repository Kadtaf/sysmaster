-- =============================================================================
-- 002 — Identité déléguée à Keycloak (ADR-008)
-- Keycloak est la source de vérité pour les identifiants, la 2FA, les passkeys et les rôles.
-- iam.users garde le profil applicatif, relié au compte Keycloak par son identifiant « sub ».
-- =============================================================================
ALTER TABLE iam.users ADD COLUMN idp_subject text UNIQUE;
COMMENT ON COLUMN iam.users.idp_subject IS 'Claim « sub » du jeton OIDC Keycloak';
COMMENT ON COLUMN iam.users.password_hash IS 'Inutilisé : les mots de passe sont gérés par Keycloak. Conservé pour une éventuelle migration.';

ALTER TABLE iam.user_roles ADD COLUMN source text NOT NULL DEFAULT 'idp'
  CHECK (source IN ('idp', 'local'));
COMMENT ON COLUMN iam.user_roles.source IS 'idp = synchronisé depuis Keycloak à chaque connexion ; local = attribué dans l''application';
