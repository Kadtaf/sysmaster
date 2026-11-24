-- =============================================================================
-- 011 — Labs simulés (Phase 4, premier incrément)
--
-- Un lab au runtime « simulation » embarque sa machine (état JSON en panne) et ses
-- validateurs déclaratifs dans `simulation`. Chaque instance garde l'état courant de SA
-- machine et l'historique des commandes. Les colonnes image_ref, fault_scenarios et
-- labs.validators restent pour les runtimes réels (conteneur, micro-VM), plus tard.
-- =============================================================================

ALTER TABLE labs.lab_templates
  ADD COLUMN simulation jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT lab_templates_simulation_chk CHECK ((runtime = 'simulation') = (simulation IS NOT NULL));

ALTER TABLE labs.instances
  ADD COLUMN state jsonb,
  ADD COLUMN transcript jsonb NOT NULL DEFAULT '[]',   -- [{command, output, exitCode, at}]
  ADD COLUMN command_count int NOT NULL DEFAULT 0;

-- Une seule instance active par apprenant et par lab : on reprend là où on s'était arrêté.
CREATE UNIQUE INDEX lab_instances_one_active_idx ON labs.instances (user_id, template_id)
  WHERE status IN ('provisioning','running','paused');

-- Compteurs de gamification pour les badges de labs.
ALTER TABLE gamification.user_stats
  ADD COLUMN labs_solved int NOT NULL DEFAULT 0,
  ADD COLUMN labs_solved_without_hint int NOT NULL DEFAULT 0;
