-- =============================================================================
-- RGPD : droit d'accès et portabilité (export), droit à l'effacement, durées de conservation
-- (docs/03 §1, docs/01 §Sécurité).
-- Pourquoi :
--  - l'effacement est demandé puis exécuté après un délai de grâce (7 jours) pendant lequel la
--    personne peut annuler ; la loi impose au plus un mois ;
--  - effacer = supprimer les données personnelles et anonymiser la ligne iam.users, qui reste
--    pour que les contributions publiques (forum) gardent une cohérence sous « Compte supprimé » ;
--  - le registre des effacements ne contient aucune donnée personnelle : il prouve qu'une demande
--    a été traitée, et quand, sans garder ce qu'on a effacé.
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

ALTER TABLE iam.users
  ADD COLUMN deletion_requested_at timestamptz,
  ADD COLUMN deletion_due_at       timestamptz,
  ADD CONSTRAINT users_deletion_pair CHECK ((deletion_requested_at IS NULL) = (deletion_due_at IS NULL));
CREATE INDEX users_deletion_due_idx ON iam.users (deletion_due_at) WHERE deletion_due_at IS NOT NULL AND status <> 'deleted';

CREATE TABLE iam.erasure_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL,                 -- identifiant technique, sans lien avec une personne une fois anonymisé
  requested_at  timestamptz NOT NULL,
  erased_at     timestamptz NOT NULL DEFAULT now(),
  idp_deleted   boolean NOT NULL,              -- compte du fournisseur d'identité supprimé ?
  -- Identifiant Keycloak, gardé seulement tant que ce compte reste à supprimer (puis effacé).
  idp_subject   text CHECK (idp_subject IS NULL OR NOT idp_deleted),
  counts        jsonb NOT NULL DEFAULT '{}'    -- lignes supprimées par table, pour le contrôle
);
