-- =============================================================================
-- Données de démo : mise en conformité des fiches avec la règle P-1
-- =============================================================================
-- Le back-office refuse de publier une fiche sans risques, exemple, alternative ou source.
-- Quatre fiches de démo d'origine ne respectaient pas cette règle : on les complète, et on ajoute
-- « trash-put », l'alternative sûre à rm -rf (rejouable sans doublon).

INSERT INTO kb.commands (id, slug, name, platform, shell, summary, history, internals, syntax, why, when_to_use, context,
                         best_practices, common_errors, risk_level, risks, difficulty, requires_admin, status) VALUES
 ('00000000-0000-4000-8600-000000000007','linux-trash-put','trash-put','linux','bash',
  'Déplace des fichiers dans la corbeille au lieu de les supprimer définitivement.',
  'Outil du projet trash-cli, qui implémente la spécification Trash de freedesktop.org (celle des environnements de bureau).',
  'Déplace le fichier dans ~/.local/share/Trash/files et écrit à côté un fichier .trashinfo (chemin d''origine, date) pour pouvoir le restaurer.',
  'trash-put <chemin>… | trash-list | trash-restore | trash-empty [jours]',
  'Une suppression se regrette souvent dans la minute qui suit. Passer par la corbeille laisse le temps de vérifier avant que ce soit définitif.',
  'Pour tout nettoyage manuel, surtout de données qui ne sont pas jetables. rm reste pertinent pour des artefacts régénérables (build, cache) dans un script.',
  'Paquet trash-cli (apt install trash-cli). Fonctionne sans droits particuliers sur ses propres fichiers.',
  ARRAY['Vider la corbeille par ancienneté (trash-empty 30) plutôt qu''entièrement','Vérifier avec trash-list avant de vider'],
  '[{"error":"trash-put: cannot trash regular file ''x'' from volume ''/mnt/data''","cause":"Pas de répertoire corbeille sur ce volume et droits insuffisants pour le créer","fix":"Créer /mnt/data/.Trash-$UID ou déplacer le fichier sur le volume principal"}]',
  'low','[{"level":"low","text":"Les fichiers restent sur le disque : l''espace n''est libéré qu''au vidage de la corbeille."}]',
  'beginner',false,'published')
ON CONFLICT (slug) DO NOTHING;

UPDATE kb.commands SET risks = '[{"level":"none","text":"Lecture seule. Attention : les options --vacuum-size et --vacuum-time, elles, suppriment des journaux."}]'
 WHERE slug = 'linux-journalctl' AND risks = '[]';
UPDATE kb.commands SET risks = '[{"level":"none","text":"Lecture seule. Les journaux peuvent contenir des secrets (jetons, mots de passe) : attention avant de les copier dans un ticket ou un forum."}]'
 WHERE slug = 'docker-logs' AND risks = '[]';

INSERT INTO kb.command_parameters (command_id, flag, description, risk_level, position) VALUES
  ('00000000-0000-4000-8600-000000000007','-v','Affiche chaque fichier déplacé, pour vérifier ce qui a été fait.','none',0)
ON CONFLICT DO NOTHING;

INSERT INTO kb.command_examples (command_id, title, code, explanation, is_real_case, position) VALUES
  ('00000000-0000-4000-8600-000000000002','Réparer le magasin puis les fichiers système',
   E'DISM /Online /Cleanup-Image /RestoreHealth\nsfc /scannow',
   'DISM répare d''abord le magasin de composants (la référence) ; SFC peut ensuite restaurer les fichiers système à partir d''une référence saine.',true,0),
  ('00000000-0000-4000-8600-000000000005','Supprimer un répertoire de build, prudemment',
   E'ls -ld ./build\nrm -rf -- ./build',
   'On vérifie d''abord ce que désigne le chemin. Le chemin est relatif et explicite, et « -- » empêche qu''un nom commençant par un tiret soit lu comme une option.',false,0),
  ('00000000-0000-4000-8600-000000000007','Mettre à la corbeille puis restaurer',
   E'trash-put -v rapport.pdf\ntrash-restore',
   'Le fichier quitte le dossier mais reste récupérable ; trash-restore propose la liste et remet le fichier à sa place d''origine.',false,0)
ON CONFLICT DO NOTHING;

INSERT INTO kb.command_alternatives VALUES
  ('00000000-0000-4000-8600-000000000002','00000000-0000-4000-8600-000000000001','Si le magasin de composants est sain, SFC suffit : il est plus rapide et n''a pas besoin de Windows Update.'),
  ('00000000-0000-4000-8600-000000000004','00000000-0000-4000-8600-000000000006','Si le service tourne dans un conteneur, sa sortie est dans docker logs plutôt que dans le journal système.'),
  ('00000000-0000-4000-8600-000000000006','00000000-0000-4000-8600-000000000004','Si le démon Docker utilise le pilote journald, les journaux des conteneurs se lisent aussi avec journalctl CONTAINER_NAME=…'),
  ('00000000-0000-4000-8600-000000000005','00000000-0000-4000-8600-000000000007','Dès que les données ne sont pas jetables : la corbeille permet de revenir en arrière.'),
  ('00000000-0000-4000-8600-000000000007','00000000-0000-4000-8600-000000000005','Pour des artefacts régénérables dans un script (build, cache), quand il faut libérer l''espace tout de suite.')
ON CONFLICT DO NOTHING;

INSERT INTO kb.sources (id, title, url, publisher) VALUES
  ('00000000-0000-4000-8700-000000000005','Réparer une image Windows | Microsoft Learn','https://learn.microsoft.com/windows-hardware/manufacture/desktop/repair-a-windows-image','Microsoft'),
  ('00000000-0000-4000-8700-000000000006','rm(1) — Linux manual page','https://man7.org/linux/man-pages/man1/rm.1.html','Linux man-pages'),
  ('00000000-0000-4000-8700-000000000007','trash-cli','https://github.com/andreafrancia/trash-cli','trash-cli')
ON CONFLICT DO NOTHING;
INSERT INTO kb.command_sources VALUES
  ('00000000-0000-4000-8600-000000000002','00000000-0000-4000-8700-000000000005'),
  ('00000000-0000-4000-8600-000000000005','00000000-0000-4000-8700-000000000006'),
  ('00000000-0000-4000-8600-000000000007','00000000-0000-4000-8700-000000000007')
ON CONFLICT DO NOTHING;
