-- =============================================================================
-- Profils d'agents modifiables depuis le back-office éditorial.
-- Pourquoi :
--  - affiner la mission d'un agent (tuteur, diagnosticien) ou les consignes d'un domaine (Windows,
--    Linux, conteneurs, réseau) ne doit pas exiger un déploiement du service IA ;
--  - un texte qui guide le modèle pour tous les apprenants mérite le même circuit qu'une fiche :
--    brouillon, relecture par une autre personne, publication tracée et versionnée.
-- Le socle de sécurité du prompt (comprendre avant d'exécuter, citations, risques honnêtes) reste
-- dans le code du service IA et n'est pas modifiable ici : un profil ne fait que s'y ajouter.
-- (Le script de migration ouvre lui-même la transaction.)
-- =============================================================================

-- Textes réellement utilisés par le service IA jusqu'ici. Les profils de démonstration n'avaient
-- qu'un texte d'attente (« Tu es un tuteur… ») : on le remplace, sans toucher un texte déjà modifié.
INSERT INTO ai.agent_profiles (code, name, mission, system_prompt, tools, rag_filters, model_tier) VALUES
  ('tutor', 'Tuteur pédagogique', 'Former, expliquer, adapter le niveau, créer exercices, quiz et labs.',
   $p$Mission : tuteur. On te pose une question de compréhension. Explique le mécanisme avec une
analogie simple si le niveau est débutant, puis montre comment l'observer sur une machine. Peu d'étapes.$p$,
   ARRAY['kb.search','rag.search'], '{}', 'standard'),
  ('diagnostician', 'Diagnosticien IA', 'Trouver l''origine probable des pannes avec un score de confiance et un plan d''action.',
   $p$Mission : diagnosticien. On te décrit une panne. Propose une démarche : hypothèses les plus
probables d'abord, puis pour chacune l'observation qui la confirme ou l'écarte. Les étapes vont de la
moins risquée à la plus risquée ; aucune réparation avant une observation qui la justifie.$p$,
   ARRAY['deduction.rank','rag.search'], '{}', 'large'),
  ('windows_expert', 'Expert Windows', 'CMD, PowerShell, BitLocker, AD, Hyper-V, WSL, Windows Server, Intune, Azure.',
   $p$Domaine : Windows (cmd, PowerShell, Observateur d'événements, WinRE). Précise si une étape exige une invite administrateur.$p$,
   ARRAY['rag.search','kb.search'], '{"publisher":["Microsoft"]}', 'standard'),
  ('linux_expert', 'Expert Linux', 'Ubuntu, Debian, Fedora, Rocky, Alma, Arch ; Bash, systemd, réseau, Docker, Kubernetes.',
   $p$Domaine : Linux (bash, systemd, journald). Précise si une étape exige sudo, et les différences entre distributions courantes.$p$,
   ARRAY['rag.search','kb.search'], '{}', 'standard'),
  ('devops_expert', 'Expert DevOps', 'Docker, Kubernetes, CI/CD, GitHub Actions, Terraform.',
   $p$Domaine : Docker et conteneurs. Distingue l'image, le conteneur et les volumes ; signale toute perte de données possible.$p$,
   ARRAY['rag.search','kb.search'], '{"publisher":["Docker","Kubernetes"]}', 'standard'),
  ('network_expert', 'Expert réseau', 'TCP/IP, DNS, DHCP, VPN, VLAN, NAT, pare-feu, Wireshark.',
   $p$Domaine : réseau. Raisonne couche par couche (lien, IP, route, DNS, service) et indique ce que chaque test élimine.$p$,
   ARRAY['rag.search','kb.search'], '{}', 'standard')
ON CONFLICT (code) DO UPDATE SET system_prompt = EXCLUDED.system_prompt
  WHERE ai.agent_profiles.system_prompt LIKE '%…';

ALTER TABLE ai.agent_profiles ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Révisions éditoriales : nouveau type « agent_profile », avec sa clé étrangère comme les autres.
ALTER TABLE editorial.revisions DROP CONSTRAINT revisions_kind_check;
ALTER TABLE editorial.revisions ADD CONSTRAINT revisions_kind_check
  CHECK (kind IN ('command', 'course', 'path', 'diagnostic_cause', 'agent_profile'));
ALTER TABLE editorial.revisions
  ADD COLUMN agent_code text REFERENCES ai.agent_profiles(code) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE editorial.revisions DROP CONSTRAINT revisions_target_matches_kind;
ALTER TABLE editorial.revisions ADD CONSTRAINT revisions_target_matches_kind CHECK (
  (kind = 'command'          OR command_id IS NULL) AND
  (kind = 'course'           OR course_id  IS NULL) AND
  (kind = 'path'             OR path_id    IS NULL) AND
  (kind = 'diagnostic_cause' OR cause_code IS NULL) AND
  (kind = 'agent_profile'    OR agent_code IS NULL)
);
CREATE UNIQUE INDEX revisions_one_open_agent_idx ON editorial.revisions (agent_code)
  WHERE agent_code IS NOT NULL AND status IN ('draft', 'in_review', 'changes_requested');
