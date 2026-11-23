-- =============================================================================
-- Recherche de fiches insensible aux accents.
-- Pourquoi : beaucoup d'utilisateurs tapent « redemarrer » ou « parametre » sans accents ;
-- la configuration 'french' de Postgres ne les retrouvait pas (« redémarrer » ≠ « redemarrer »).
-- Comment : une configuration de recherche qui retire les accents avant la racinisation.
-- Décision liée : docs/01-architecture.md §19, ADR-012 (Postgres suffit pour la recherche à ce stade).
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION kb.fr (COPY = pg_catalog.french);
ALTER TEXT SEARCH CONFIGURATION kb.fr ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;

CREATE TEXT SEARCH CONFIGURATION kb.simple_fr (COPY = pg_catalog.simple);
ALTER TEXT SEARCH CONFIGURATION kb.simple_fr ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;

-- Une colonne générée ne peut pas changer d'expression : on la recrée (l'index suit).
ALTER TABLE kb.commands DROP COLUMN search_vector;
ALTER TABLE kb.commands ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('kb.simple_fr', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('kb.fr', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('kb.fr', coalesce(why, '')), 'C')) STORED;
CREATE INDEX commands_search_idx ON kb.commands USING gin (search_vector);

