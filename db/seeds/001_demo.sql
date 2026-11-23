-- =============================================================================
-- Données de démonstration SysMaster (idempotent : peut être rejoué)
-- =============================================================================
BEGIN;

-- Utilisateurs de démo ---------------------------------------------------------
INSERT INTO iam.users (id, email, email_verified, display_name, username, locale) VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin@sysmaster.local',   true, 'Admin SysMaster', 'admin',   'fr'),
  ('00000000-0000-4000-8000-000000000002', 'alice@sysmaster.local',   true, 'Alice Martin',    'alice',   'fr'),
  ('00000000-0000-4000-8000-000000000003', 'bob@sysmaster.local',     true, 'Bob Diallo',      'bob',     'fr'),
  ('00000000-0000-4000-8000-000000000004', 'mentor@sysmaster.local',  true, 'Nadia Mentor',    'nadia',   'fr')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.roles (code, scope, description) VALUES
  ('learner','global','Apprenant'), ('mentor','global','Mentor bénévole ou certifié'),
  ('author','global','Auteur de contenus'), ('reviewer','global','Relecteur technique'),
  ('moderator','global','Modérateur communauté'), ('support','global','Support client'),
  ('admin','global','Administrateur plateforme'), ('super_admin','global','Super administrateur'),
  ('org_owner','organization','Propriétaire de l''organisation'), ('org_admin','organization','Administrateur de l''organisation'),
  ('instructor','organization','Formateur'), ('member','organization','Membre')
ON CONFLICT DO NOTHING;

INSERT INTO iam.permissions (code, description) VALUES
  ('course:write','Créer et modifier des cours'), ('course:publish','Publier un cours'),
  ('diagnostic_rule:write','Modifier les règles du moteur de déduction'),
  ('community:moderate','Modérer la communauté'), ('certificate:revoke','Révoquer un certificat'),
  ('org:manage_seats','Gérer les sièges d''une organisation'), ('rag_source:manage','Gérer les sources RAG')
ON CONFLICT DO NOTHING;

INSERT INTO iam.role_permissions VALUES
  ('author','course:write'), ('reviewer','course:publish'), ('moderator','community:moderate'),
  ('admin','course:write'), ('admin','course:publish'), ('admin','diagnostic_rule:write'),
  ('admin','community:moderate'), ('admin','certificate:revoke'), ('admin','rag_source:manage'),
  ('org_admin','org:manage_seats'), ('org_owner','org:manage_seats')
ON CONFLICT DO NOTHING;

INSERT INTO iam.user_roles VALUES
  ('00000000-0000-4000-8000-000000000001','admin', now()),
  ('00000000-0000-4000-8000-000000000002','learner', now()),
  ('00000000-0000-4000-8000-000000000003','learner', now()),
  ('00000000-0000-4000-8000-000000000004','mentor', now())
ON CONFLICT DO NOTHING;

INSERT INTO iam.organizations (id, name, slug, kind, country, seats) VALUES
  ('00000000-0000-4000-8100-000000000001','Lycée Technique Demo','lycee-demo','school','FR',120)
ON CONFLICT DO NOTHING;
INSERT INTO iam.memberships VALUES
  ('00000000-0000-4000-8100-000000000001','00000000-0000-4000-8000-000000000003','member', now())
ON CONFLICT DO NOTHING;

-- Carrières et parcours --------------------------------------------------------
INSERT INTO learning.careers (code, name, description) VALUES
  ('it_technician','Technicien informatique','Support utilisateur, poste de travail, dépannage matériel et logiciel.'),
  ('sysadmin','Administrateur système','Serveurs Windows et Linux, annuaires, sauvegardes, supervision.'),
  ('systems_engineer','Ingénieur systèmes','Architecture d''infrastructure, virtualisation, haute disponibilité.'),
  ('cloud','Spécialiste cloud','Azure, AWS, GCP, réseaux virtuels, IAM cloud.'),
  ('cybersecurity','Spécialiste cybersécurité','Durcissement, détection, réponse à incident.'),
  ('devops','Ingénieur DevOps','Conteneurs, Kubernetes, CI/CD, infrastructure as code.')
ON CONFLICT DO NOTHING;

INSERT INTO learning.learning_paths (id, slug, title, summary, career_code, difficulty, est_hours, status) VALUES
  ('00000000-0000-4000-8200-000000000001','technicien-informatique','Devenir technicien informatique',
   'De zéro à l''autonomie sur un poste Windows : matériel, système, réseau local et méthode de diagnostic.',
   'it_technician','beginner',120,'published'),
  ('00000000-0000-4000-8200-000000000002','administrateur-linux','Devenir administrateur Linux',
   'Shell, systemd, journaux, réseau, stockage, sécurité et automatisation sur Debian/Ubuntu et Rocky Linux.',
   'sysadmin','intermediate',160,'published'),
  ('00000000-0000-4000-8200-000000000003','ingenieur-devops','Devenir ingénieur DevOps',
   'Docker, Kubernetes, CI/CD avec GitHub Actions et Terraform, en partant des bases Linux.',
   'devops','advanced',200,'published')
ON CONFLICT DO NOTHING;

INSERT INTO learning.courses (id, slug, title, summary, platform, difficulty, status, is_premium) VALUES
  ('00000000-0000-4000-8300-000000000001','windows-fondamentaux','Windows : les fondamentaux',
   'Comprendre le démarrage, les services, les journaux et les outils de réparation intégrés.','windows','beginner','published',false),
  ('00000000-0000-4000-8300-000000000002','linux-systemd','Linux : services et systemd',
   'Unités, dépendances, journald, diagnostiquer un service qui ne démarre pas.','linux','intermediate','published',false),
  ('00000000-0000-4000-8300-000000000003','docker-essentiels','Docker : les essentiels',
   'Images, conteneurs, volumes, réseaux et lecture des journaux.','docker','intermediate','published',true)
ON CONFLICT DO NOTHING;

INSERT INTO learning.path_courses VALUES
  ('00000000-0000-4000-8200-000000000001','00000000-0000-4000-8300-000000000001',1),
  ('00000000-0000-4000-8200-000000000002','00000000-0000-4000-8300-000000000002',1),
  ('00000000-0000-4000-8200-000000000003','00000000-0000-4000-8300-000000000002',1),
  ('00000000-0000-4000-8200-000000000003','00000000-0000-4000-8300-000000000003',2)
ON CONFLICT DO NOTHING;

INSERT INTO learning.modules (id, course_id, title, position) VALUES
  ('00000000-0000-4000-8400-000000000001','00000000-0000-4000-8300-000000000001','Le démarrage de Windows',1),
  ('00000000-0000-4000-8400-000000000002','00000000-0000-4000-8300-000000000001','Réparer le système',2),
  ('00000000-0000-4000-8400-000000000003','00000000-0000-4000-8300-000000000002','Gérer les services',1)
ON CONFLICT DO NOTHING;

INSERT INTO learning.lessons (id, module_id, slug, title, type, content_md, objectives, est_minutes, position) VALUES
  ('00000000-0000-4000-8500-000000000001','00000000-0000-4000-8400-000000000001','sequence-demarrage','La séquence de démarrage','reading',
   '# Du bouton à la session\nUEFI → Boot Manager → winload → noyau → services → session.\n\n**Pourquoi le savoir ?** Chaque étape a ses symptômes de panne propres.',
   ARRAY['Nommer les étapes du démarrage','Associer un symptôme à une étape'],15,1),
  ('00000000-0000-4000-8500-000000000002','00000000-0000-4000-8400-000000000002','sfc-dism','Réparer les fichiers système avec SFC et DISM','interactive',
   '# SFC puis DISM\nSFC vérifie les fichiers protégés à partir du magasin de composants ; DISM répare ce magasin.\n\n**Ordre recommandé et pourquoi** : si le magasin est corrompu, SFC ne peut pas réparer.',
   ARRAY['Expliquer la différence entre SFC et DISM','Lire le journal CBS.log'],25,1),
  ('00000000-0000-4000-8500-000000000003','00000000-0000-4000-8400-000000000003','systemctl-bases','systemctl : démarrer, arrêter, activer','lab',
   '# Les états d''une unité\nactive, inactive, failed… et la différence entre *start* et *enable*.',
   ARRAY['Distinguer start et enable','Lire le statut d''une unité en échec'],30,1)
ON CONFLICT DO NOTHING;

-- Compétences -----------------------------------------------------------------
INSERT INTO skills.skills (code, name, platform) VALUES
  ('windows.boot','Processus de démarrage Windows','windows'),
  ('windows.repair','Réparation du système Windows','windows'),
  ('windows.eventlog','Lecture des journaux Windows','windows'),
  ('linux.systemd','Gestion des services systemd','linux'),
  ('linux.journald','Lecture des journaux journald','linux'),
  ('network.dns','Résolution DNS','network'),
  ('docker.containers','Cycle de vie des conteneurs','docker')
ON CONFLICT DO NOTHING;

-- Base de connaissances ------------------------------------------------------
INSERT INTO kb.commands (id, slug, name, platform, shell, summary, history, internals, syntax, why, when_to_use, context,
                         best_practices, common_errors, risk_level, risks, difficulty, requires_admin, status) VALUES
 ('00000000-0000-4000-8600-000000000001','windows-sfc','sfc','windows','cmd',
  'Vérifie l''intégrité des fichiers système protégés de Windows et remplace les versions corrompues.',
  'Introduit avec Windows 98 (System File Checker), intégré à la protection des ressources Windows (WRP) depuis Vista.',
  'Compare chaque fichier protégé avec la copie de référence du magasin de composants (WinSxS) et la restaure si le hachage diffère. Résultats consignés dans %windir%\Logs\CBS\CBS.log.',
  'sfc /scannow | sfc /verifyonly | sfc /scanfile=<chemin>',
  'Des fichiers système corrompus provoquent écrans bleus, plantages d''applications intégrées ou fonctionnalités manquantes. SFC est la première vérification non destructive.',
  'Après un écran bleu inexpliqué, une mise à jour interrompue ou des erreurs d''applications Windows natives.',
  'Invite de commandes en tant qu''administrateur. Si SFC échoue à réparer, exécuter d''abord DISM /RestoreHealth.',
  ARRAY['Lancer /verifyonly avant /scannow pour observer sans modifier','Consulter CBS.log plutôt que de relancer en boucle','Ne pas interrompre l''analyse'],
  '[{"error":"La protection des ressources Windows n''a pas pu effectuer l''opération demandée","cause":"Magasin de composants corrompu ou service TrustedInstaller arrêté","fix":"Exécuter DISM /Online /Cleanup-Image /RestoreHealth puis relancer SFC"}]',
  'low','[{"level":"low","text":"Remplace des fichiers système : une modification volontaire de fichier système (personnalisation) sera annulée."}]',
  'beginner',true,'published'),
 ('00000000-0000-4000-8600-000000000002','windows-dism-restorehealth','DISM /RestoreHealth','windows','cmd',
  'Répare le magasin de composants Windows (WinSxS) à partir de Windows Update ou d''une source locale.',
  'DISM (Deployment Image Servicing and Management) remplace des outils séparés depuis Windows 7.',
  'Télécharge ou lit des composants sains et reconstruit le magasin utilisé ensuite par SFC.',
  'DISM /Online /Cleanup-Image /RestoreHealth [/Source:wim:D:\sources\install.wim:1 /LimitAccess]',
  'SFC répare depuis le magasin : si celui-ci est corrompu, SFC ne peut rien faire. DISM répare la source.',
  'Quand SFC signale des fichiers qu''il n''a pas pu réparer.',
  'Administrateur, connexion Internet ou image d''installation de la même version.',
  ARRAY['Lancer /CheckHealth puis /ScanHealth avant /RestoreHealth','Utiliser /Source avec une image de même build'],
  '[{"error":"Erreur 0x800f081f : fichiers sources introuvables","cause":"Pas d''accès Windows Update ou image de version différente","fix":"Fournir une source /Source correspondant exactement à la build"}]',
  'low','[{"level":"low","text":"Peut durer longtemps ; une interruption laisse le magasin dans un état incohérent."}]',
  'intermediate',true,'published'),
 ('00000000-0000-4000-8600-000000000003','linux-systemctl','systemctl','linux','bash',
  'Pilote systemd : démarrer, arrêter, activer et inspecter les services et autres unités.',
  'systemd remplace SysV init depuis 2010 (Fedora 15) et est devenu le standard de Debian, Ubuntu, RHEL et dérivés.',
  'systemctl dialogue avec le PID 1 via D-Bus. Les unités sont décrites dans /usr/lib/systemd/system et surchargées dans /etc/systemd/system.',
  'systemctl [start|stop|restart|reload|enable|disable|status|is-failed] <unité>',
  'C''est l''interface standard pour gérer les services : la connaître évite de lancer des processus à la main qui ne survivent pas au redémarrage.',
  'Pour démarrer un service, le rendre persistant au démarrage ou comprendre pourquoi il a échoué.',
  'Serveur ou poste Linux avec systemd, droits root (sudo) pour modifier l''état.',
  ARRAY['Toujours lire systemctl status avant de redémarrer','Utiliser reload quand le service le supporte pour éviter une coupure','Ne pas modifier les fichiers de /usr/lib : utiliser systemctl edit'],
  '[{"error":"Failed to start nginx.service: Unit nginx.service not found.","cause":"Paquet non installé ou nom d''unité erroné","fix":"systemctl list-unit-files | grep nginx"},{"error":"Job for x.service failed because the control process exited with error code","cause":"Erreur de configuration du service","fix":"journalctl -xeu x.service"}]',
  'medium','[{"level":"medium","text":"stop ou restart sur un service distant (sshd, réseau) peut couper votre propre accès."}]',
  'beginner',true,'published'),
 ('00000000-0000-4000-8600-000000000004','linux-journalctl','journalctl','linux','bash',
  'Interroge le journal de systemd (journald) : messages du noyau, des services et du démarrage.',
  'Apparu avec systemd ; stocke les journaux dans un format binaire indexé.',
  'Lit les fichiers de /var/log/journal (persistant) ou /run/log/journal (volatile) et filtre par unité, priorité, démarrage.',
  'journalctl [-u unité] [-p err] [-b [-1]] [--since "1 hour ago"] [-f]',
  'Les journaux expliquent la cause réelle d''une panne : sans eux, on devine.',
  'Dès qu''un service échoue, après un redémarrage inattendu (journalctl -b -1) ou pour suivre un problème en direct.',
  'Membre du groupe systemd-journal ou adm, ou sudo.',
  ARRAY['Filtrer par unité et priorité avant de tout lire','Rendre le journal persistant sur les serveurs (Storage=persistent)'],
  '[{"error":"No journal files were found.","cause":"Journal volatile et redémarrage depuis","fix":"Activer Storage=persistent dans /etc/systemd/journald.conf"}]',
  'none','[]','beginner',false,'published'),
 ('00000000-0000-4000-8600-000000000005','linux-rm-rf','rm -rf','linux','bash',
  'Supprime récursivement et sans confirmation des fichiers et répertoires.',
  'rm existe depuis Unix v1 (1971).',
  'Appelle unlink/rmdir sur chaque entrée ; aucune corbeille : les blocs sont libérés immédiatement.',
  'rm -rf <chemin>',
  'Utile pour nettoyer des répertoires temporaires ou des artefacts de build volumineux.',
  'Uniquement quand le chemin est vérifié et qu''une sauvegarde existe ou que les données sont jetables.',
  'Toujours avec un chemin absolu vérifié, jamais avec une variable non contrôlée.',
  ARRAY['Lancer ls sur le chemin exact avant','Préférer rm -ri pour une suppression interactive','Utiliser set -u dans les scripts pour bloquer les variables vides'],
  '[{"error":"rm: cannot remove ''x'': Permission denied","cause":"Droits insuffisants","fix":"Vérifier le propriétaire ; ne pas ajouter sudo par réflexe"}]',
  'critical','[{"level":"critical","text":"Suppression définitive sans corbeille. Une variable vide (rm -rf $DIR/) peut viser la racine."}]',
  'intermediate',false,'published'),
 ('00000000-0000-4000-8600-000000000006','docker-logs','docker logs','docker','bash',
  'Affiche la sortie standard et d''erreur d''un conteneur.',
  'Disponible depuis les premières versions de Docker (2013).',
  'Lit les fichiers du pilote de journalisation (json-file par défaut, sous /var/lib/docker/containers/<id>/).',
  'docker logs [--tail N] [-f] [--since 10m] <conteneur>',
  'Un conteneur qui redémarre en boucle explique presque toujours pourquoi dans ses journaux.',
  'Quand un conteneur s''arrête, redémarre ou répond mal.',
  'Accès au démon Docker (groupe docker ou sudo).',
  ARRAY['Utiliser --tail pour éviter de tout afficher','Configurer la rotation (max-size) pour ne pas saturer le disque'],
  '[{"error":"Error response from daemon: configured logging driver does not support reading","cause":"Pilote syslog/gelf configuré","fix":"Lire les journaux dans le système cible ou activer le dual logging"}]',
  'none','[]','beginner',false,'published')
ON CONFLICT DO NOTHING;

INSERT INTO kb.command_parameters (command_id, flag, description, risk_level, position) VALUES
  ('00000000-0000-4000-8600-000000000001','/scannow','Analyse et répare tous les fichiers protégés.','low',1),
  ('00000000-0000-4000-8600-000000000001','/verifyonly','Analyse sans rien modifier.','none',2),
  ('00000000-0000-4000-8600-000000000003','enable --now','Active au démarrage et démarre immédiatement.','low',1),
  ('00000000-0000-4000-8600-000000000003','mask','Empêche totalement le démarrage de l''unité, même en dépendance.','medium',2),
  ('00000000-0000-4000-8600-000000000004','-b -1','Journal du démarrage précédent (utile après un redémarrage inattendu).','none',1),
  ('00000000-0000-4000-8600-000000000004','-p err','Uniquement les messages de priorité erreur ou plus grave.','none',2)
ON CONFLICT DO NOTHING;

INSERT INTO kb.command_examples (command_id, title, code, explanation, is_real_case, position) VALUES
  ('00000000-0000-4000-8600-000000000001','Vérifier sans modifier','sfc /verifyonly','Permet de constater l''état avant toute réparation.',false,1),
  ('00000000-0000-4000-8600-000000000003','Comprendre un service en échec','systemctl status nginx','Affiche l''état, le PID, et les dernières lignes de journal : c''est le point de départ.',false,1),
  ('00000000-0000-4000-8600-000000000003','Cas réel : nginx ne redémarre pas après une modification','sudo nginx -t && sudo systemctl reload nginx','On valide la configuration avant de recharger : un reload sur une configuration invalide est refusé, un restart couperait le service.',true,2),
  ('00000000-0000-4000-8600-000000000004','Pourquoi le serveur a-t-il redémarré ?','journalctl -b -1 -p warning --no-pager | tail -50','Montre les derniers avertissements avant le redémarrage précédent.',true,1),
  ('00000000-0000-4000-8600-000000000006','Conteneur qui redémarre en boucle','docker logs --tail 100 api','Les 100 dernières lignes contiennent généralement l''erreur fatale.',false,1)
ON CONFLICT DO NOTHING;

INSERT INTO kb.command_alternatives VALUES
  ('00000000-0000-4000-8600-000000000001','00000000-0000-4000-8600-000000000002','Si SFC ne parvient pas à réparer, réparer d''abord le magasin avec DISM.'),
  ('00000000-0000-4000-8600-000000000003','00000000-0000-4000-8600-000000000004','Pour comprendre la cause d''un échec, systemctl status ne montre que les dernières lignes : journalctl donne tout.')
ON CONFLICT DO NOTHING;

INSERT INTO kb.sources (id, title, url, publisher) VALUES
  ('00000000-0000-4000-8700-000000000001','sfc | Microsoft Learn','https://learn.microsoft.com/windows-server/administration/windows-commands/sfc','Microsoft'),
  ('00000000-0000-4000-8700-000000000002','systemctl(1) — Linux manual page','https://man7.org/linux/man-pages/man1/systemctl.1.html','Linux man-pages'),
  ('00000000-0000-4000-8700-000000000003','journalctl(1) — Linux manual page','https://man7.org/linux/man-pages/man1/journalctl.1.html','Linux man-pages'),
  ('00000000-0000-4000-8700-000000000004','docker container logs | Docker Docs','https://docs.docker.com/reference/cli/docker/container/logs/','Docker')
ON CONFLICT DO NOTHING;
INSERT INTO kb.command_sources VALUES
  ('00000000-0000-4000-8600-000000000001','00000000-0000-4000-8700-000000000001'),
  ('00000000-0000-4000-8600-000000000003','00000000-0000-4000-8700-000000000002'),
  ('00000000-0000-4000-8600-000000000004','00000000-0000-4000-8700-000000000003'),
  ('00000000-0000-4000-8600-000000000006','00000000-0000-4000-8700-000000000004')
ON CONFLICT DO NOTHING;

-- Moteur de déduction : « Mon PC redémarre seul » ------------------------------
INSERT INTO diagnostic.symptoms (code, label, platform, synonyms) VALUES
  ('unexpected_reboot','Le PC redémarre seul','windows',ARRAY['redémarre seul','reboot','se relance','redémarrage intempestif','redemarre']),
  ('reboot_under_load','Redémarre pendant un jeu ou une tâche lourde','windows',ARRAY['en jeu','sous charge','rendu','compilation','jeu','joue','jouant','gaming']),
  ('loud_fans','Ventilateurs bruyants ou PC très chaud','windows',ARRAY['ventilateur','chaud','chauffe','bruit']),
  ('bsod','Écran bleu avant le redémarrage','windows',ARRAY['écran bleu','bsod','blue screen','stop code']),
  ('after_driver_update','Problème apparu après une mise à jour de pilote ou de Windows','windows',ARRAY['mise à jour','pilote','driver','update']),
  ('no_display_beep','Bips au démarrage ou pas d''affichage','windows',ARRAY['bip','beep','pas d''image','écran noir']),
  ('random_freeze','Gels aléatoires','windows',ARRAY['gel','freeze','fige','bloque']),
  ('after_bios_change','Après un changement de BIOS/UEFI ou d''overclocking','windows',ARRAY['bios','uefi','overclock','xmp'])
ON CONFLICT DO NOTHING;

INSERT INTO diagnostic.causes (code, label, platform, prior, explanation, action_plan) VALUES
  ('overheating','Surchauffe','windows',0.20,
   'Le processeur ou la carte graphique dépasse sa température limite : la carte mère coupe l''alimentation pour éviter des dégâts.',
   '[{"step":"Mesurer les températures en charge (HWiNFO)","why":"Confirmer avant de démonter","risk":"none"},{"step":"Dépoussiérer ventilateurs et radiateurs","why":"La poussière est la première cause de surchauffe","risk":"low"},{"step":"Remplacer la pâte thermique si le PC a plus de 4 ans","why":"Elle sèche et conduit mal la chaleur","risk":"medium"}]'),
  ('driver_fault','Pilote défectueux','windows',0.25,
   'Un pilote en mode noyau provoque une erreur fatale (écran bleu) ; si le redémarrage automatique est activé, l''écran bleu passe inaperçu.',
   '[{"step":"Désactiver le redémarrage automatique (Paramètres système avancés)","why":"Pour lire le code d''arrêt","risk":"none"},{"step":"Analyser les fichiers C:\\Windows\\Minidump","why":"Identifie le pilote fautif","risk":"none"},{"step":"Revenir à la version précédente du pilote","why":"Annule la cause probable","risk":"low"}]'),
  ('psu_failure','Alimentation défaillante ou sous-dimensionnée','windows',0.15,
   'Sous charge, une alimentation faible ou vieillissante ne fournit plus une tension stable : coupure nette, sans écran bleu (Event ID 41 Kernel-Power).',
   '[{"step":"Vérifier Event ID 41 dans l''Observateur d''événements","why":"Signe d''une coupure sans arrêt propre","risk":"none"},{"step":"Calculer la puissance nécessaire de la configuration","why":"Exclure le sous-dimensionnement","risk":"none"},{"step":"Tester avec une alimentation connue fonctionnelle","why":"Seul test concluant","risk":"medium"}]'),
  ('ram_fault','Mémoire vive défectueuse','windows',0.15,
   'Des erreurs mémoire corrompent des données du noyau : écrans bleus variés, gels et redémarrages aléatoires.',
   '[{"step":"Lancer MemTest86 sur plusieurs passes","why":"Les erreurs sont parfois intermittentes","risk":"none"},{"step":"Désactiver le profil XMP/EXPO","why":"Un overclocking mémoire instable imite une RAM défectueuse","risk":"low"},{"step":"Tester les barrettes une par une","why":"Isoler la barrette fautive","risk":"low"}]'),
  ('bios_settings','Réglages BIOS/UEFI instables','windows',0.10,
   'Overclocking, sous-tension ou profil mémoire trop agressif rendent la machine instable.',
   '[{"step":"Charger les valeurs par défaut du BIOS (Load Optimized Defaults)","why":"Revenir à une base stable","risk":"low"},{"step":"Mettre à jour le BIOS si un correctif de stabilité existe","why":"Corrige des bugs connus","risk":"high"}]'),
  ('windows_update','Mise à jour Windows planifiée','windows',0.15,
   'Windows redémarre pour installer des mises à jour en dehors des heures d''activité : ce n''est pas une panne.',
   '[{"step":"Consulter l''historique Windows Update","why":"Vérifier la corrélation avec les redémarrages","risk":"none"},{"step":"Configurer les heures d''activité","why":"Éviter les redémarrages pendant l''utilisation","risk":"none"}]')
ON CONFLICT DO NOTHING;

INSERT INTO diagnostic.rules (symptom_code, cause_code, likelihood, rationale) VALUES
  ('unexpected_reboot','overheating',0.70,'Arrêt de protection thermique.'),
  ('unexpected_reboot','driver_fault',0.60,'Écran bleu suivi d''un redémarrage automatique.'),
  ('unexpected_reboot','psu_failure',0.80,'Coupure de tension.'),
  ('unexpected_reboot','ram_fault',0.50,'Corruption mémoire fatale.'),
  ('unexpected_reboot','bios_settings',0.50,'Instabilité de configuration.'),
  ('unexpected_reboot','windows_update',0.60,'Redémarrage planifié.'),
  ('reboot_under_load','overheating',0.85,'La chaleur augmente avec la charge.'),
  ('reboot_under_load','psu_failure',0.80,'La consommation augmente avec la charge.'),
  ('reboot_under_load','driver_fault',0.35,'Pilote graphique sollicité en jeu.'),
  ('reboot_under_load','ram_fault',0.30,'Plus d''accès mémoire.'),
  ('reboot_under_load','windows_update',0.05,'Indépendant de la charge.'),
  ('reboot_under_load','bios_settings',0.45,'Overclocking instable en charge.'),
  ('loud_fans','overheating',0.85,'Signe direct de dissipation thermique élevée.'),
  ('loud_fans','psu_failure',0.15,'Peu lié.'),
  ('loud_fans','driver_fault',0.10,'Peu lié.'),
  ('loud_fans','ram_fault',0.05,'Non lié.'),
  ('bsod','driver_fault',0.85,'Cause la plus fréquente des écrans bleus.'),
  ('bsod','ram_fault',0.70,'Écrans bleus aux codes variés.'),
  ('bsod','overheating',0.20,'Rare : la coupure thermique ne produit en général pas d''écran bleu.'),
  ('bsod','psu_failure',0.10,'Une coupure d''alimentation ne laisse pas le temps d''un écran bleu.'),
  ('bsod','bios_settings',0.50,'WHEA_UNCORRECTABLE_ERROR fréquent en overclocking.'),
  ('bsod','windows_update',0.05,'Un redémarrage de mise à jour est propre.'),
  ('after_driver_update','driver_fault',0.80,'Corrélation temporelle forte.'),
  ('after_driver_update','windows_update',0.40,'Mises à jour souvent groupées.'),
  ('after_driver_update','overheating',0.05,'Non lié.'),
  ('no_display_beep','ram_fault',0.75,'Les codes bips signalent souvent la mémoire.'),
  ('no_display_beep','psu_failure',0.30,'Alimentation insuffisante au POST.'),
  ('random_freeze','ram_fault',0.65,'Corruption mémoire.'),
  ('random_freeze','driver_fault',0.45,'Blocage d''un pilote.'),
  ('random_freeze','overheating',0.30,'Throttling extrême.'),
  ('after_bios_change','bios_settings',0.90,'Corrélation directe.'),
  ('after_bios_change','ram_fault',0.30,'Profil XMP activé.')
ON CONFLICT DO NOTHING;

INSERT INTO diagnostic.evidence_patterns (name, source, pattern, cause_code, boost) VALUES
  ('Kernel-Power 41','windows_event','(Event ?ID[: ]*41|Kernel-Power)','psu_failure',2.5),
  ('WHEA-Logger','windows_event','WHEA-Logger','bios_settings',2.0),
  ('BugCheck pilote','windows_event','(BugCheck|\.sys)','driver_fault',2.5),
  ('Thermal shutdown','windows_event','(thermal|ACPI.*(zone|température)|temperature)','overheating',3.0),
  ('Redémarrage Windows Update','windows_event','(Event ?ID[: ]*1074|TrustedInstaller|Windows Update)','windows_update',3.0),
  ('MEMORY_MANAGEMENT','windows_event','MEMORY_MANAGEMENT','ram_fault',3.0)
ON CONFLICT DO NOTHING;

-- Labs ---------------------------------------------------------------------------
INSERT INTO labs.lab_templates (slug, title, category, difficulty, runtime, image_ref, brief_md, objectives, hints, solution_md, ttl_minutes, status) VALUES
  ('linux-nginx-failed','nginx refuse de démarrer','linux','beginner','container','ghcr.io/sysmaster/labs/debian-nginx:1',
   'Le site de l''entreprise est hors ligne. `systemctl status nginx` affiche *failed*. Trouvez la cause et rétablissez le service **sans réinstaller nginx**.',
   ARRAY['Identifier la cause dans les journaux','Corriger la configuration','Valider avant de recharger'],
   '[{"cost_xp":5,"text":"Que dit journalctl -u nginx ?"},{"cost_xp":10,"text":"nginx -t valide la configuration."}]',
   'Un point-virgule manquait dans /etc/nginx/sites-enabled/default. nginx -t le signale ; on corrige puis systemctl reload.',45,'published'),
  ('windows-service-spooler','Le service d''impression s''arrête','windows','beginner','windows_vm','sysmaster-win2022-base',
   'Les utilisateurs ne peuvent plus imprimer : le spouleur s''arrête toutes les quelques minutes.',
   ARRAY['Lire l''Observateur d''événements','Identifier le pilote fautif','Rétablir le service'],
   '[{"cost_xp":5,"text":"Regardez le journal Système, source Service Control Manager."}]',
   'Un pilote d''imprimante tiers corrompu fait planter spoolsv.exe ; le retirer stabilise le service.',60,'published'),
  ('docker-crashloop','Conteneur en redémarrage permanent','docker','intermediate','container','ghcr.io/sysmaster/labs/docker-dind:1',
   'L''API conteneurisée redémarre en boucle. Trouvez pourquoi et corrigez sans modifier l''image.',
   ARRAY['Lire docker logs','Identifier la variable manquante','Relancer avec la bonne configuration'],
   '[{"cost_xp":5,"text":"docker logs --tail 50 api"}]',
   'La variable DATABASE_URL est absente du fichier .env ; l''application s''arrête au démarrage.',45,'published')
ON CONFLICT DO NOTHING;

-- Certifications -----------------------------------------------------------------
INSERT INTO assessment.certifications (code, title, description, level, validity_months, price_cents) VALUES
  ('WIN-TECH','Windows Technician','Support poste Windows, dépannage, réparation du système.','beginner',36,4900),
  ('WIN-ADMIN','Windows Administrator','Windows Server, Active Directory, GPO, Hyper-V.','intermediate',36,7900),
  ('LINUX-ADMIN','Linux Administrator','Administration Linux : shell, systemd, stockage, réseau, sécurité.','intermediate',36,7900),
  ('LINUX-EXPERT','Linux Server Expert','Haute disponibilité, performance, durcissement, automatisation.','expert',24,12900),
  ('NET-SPEC','Network Specialist','TCP/IP, DNS, DHCP, VLAN, VPN, pare-feu, analyse de trames.','intermediate',36,7900),
  ('DEVOPS-SPEC','DevOps Specialist','CI/CD, IaC Terraform, Kubernetes, observabilité.','advanced',24,9900),
  ('DOCKER-SPEC','Docker Specialist','Images, réseaux, volumes, sécurité et production avec Docker.','intermediate',24,6900),
  ('PG-SPEC','PostgreSQL Specialist','Administration, sauvegarde, réplication, optimisation PostgreSQL.','advanced',24,9900),
  ('CYBER-SPEC','Cybersecurity Specialist','Durcissement, détection, réponse à incident.','advanced',24,11900),
  ('SYSMASTER-EXPERT','SysMaster Expert','Certification de synthèse multi-plateformes.','expert',24,19900)
ON CONFLICT DO NOTHING;
UPDATE assessment.certifications SET prerequisites = ARRAY['WIN-TECH'] WHERE code = 'WIN-ADMIN';
UPDATE assessment.certifications SET prerequisites = ARRAY['LINUX-ADMIN'] WHERE code = 'LINUX-EXPERT';
UPDATE assessment.certifications SET prerequisites = ARRAY['WIN-ADMIN','LINUX-EXPERT','NET-SPEC'] WHERE code = 'SYSMASTER-EXPERT';

INSERT INTO assessment.questions (id, type, prompt_md, choices, answer, explanation, difficulty, platform, reviewed) VALUES
  ('00000000-0000-4000-8800-000000000001','single','SFC signale des fichiers qu''il n''a pas pu réparer. Quelle est l''étape suivante la plus pertinente ?',
   '[{"id":"a","text":"Réinstaller Windows"},{"id":"b","text":"DISM /Online /Cleanup-Image /RestoreHealth puis relancer SFC"},{"id":"c","text":"Relancer sfc /scannow jusqu''à réussite"}]',
   '"b"','SFC répare à partir du magasin de composants. S''il est corrompu, il faut d''abord le réparer avec DISM. Réinstaller est disproportionné ; relancer SFC ne change rien.',
   'beginner','windows',true),
  ('00000000-0000-4000-8800-000000000002','single','Quelle est la différence entre « systemctl start » et « systemctl enable » ?',
   '[{"id":"a","text":"Aucune"},{"id":"b","text":"start démarre maintenant, enable configure le démarrage automatique au boot"},{"id":"c","text":"enable démarre et redémarre en cas d''échec"}]',
   '"b"','start agit sur l''état courant ; enable crée les liens symboliques qui rattachent l''unité à une cible de démarrage. enable --now fait les deux.',
   'beginner','linux',true)
ON CONFLICT DO NOTHING;
INSERT INTO assessment.quizzes (id, slug, title, kind, pass_score) VALUES
  ('00000000-0000-4000-8900-000000000001','quiz-reparation-systeme','Quiz : réparer un système','practice',50)
ON CONFLICT DO NOTHING;
INSERT INTO assessment.quiz_questions VALUES
  ('00000000-0000-4000-8900-000000000001','00000000-0000-4000-8800-000000000001',1,1),
  ('00000000-0000-4000-8900-000000000001','00000000-0000-4000-8800-000000000002',2,1)
ON CONFLICT DO NOTHING;

-- Gamification -----------------------------------------------------------------
INSERT INTO gamification.levels VALUES
  (1,0,'Curieux'),(2,100,'Apprenti'),(3,300,'Dépanneur'),(4,700,'Technicien'),(5,1500,'Administrateur'),
  (6,3000,'Ingénieur'),(7,6000,'Expert'),(8,12000,'Maître système')
ON CONFLICT DO NOTHING;
INSERT INTO gamification.badges VALUES
  ('first_diagnostic','Premier diagnostic','A mené un premier diagnostic jusqu''au bout.','stethoscope','common','{"event":"diagnostic.session.completed.v1","count":1}'),
  ('read_before_run','Lire avant d''exécuter','A consulté les risques de 20 commandes avant de les utiliser.','book-open','rare','{"event":"kb.risks.viewed.v1","count":20}'),
  ('lab_no_hint','Sans filet','A résolu un lab sans indice.','shield-check','epic','{"event":"labs.lab.solved.v1","hints_used":0}'),
  ('streak_30','30 jours d''affilée','30 jours consécutifs d''apprentissage.','flame','legendary','{"streak_days":30}')
ON CONFLICT DO NOTHING;
INSERT INTO gamification.user_stats (user_id, total_xp, level, streak_days, last_activity_date) VALUES
  ('00000000-0000-4000-8000-000000000002',1820,5,12,current_date),
  ('00000000-0000-4000-8000-000000000003',460,3,3,current_date),
  ('00000000-0000-4000-8000-000000000004',7400,7,41,current_date)
ON CONFLICT DO NOTHING;

-- Communauté -------------------------------------------------------------------
INSERT INTO community.categories (slug, name, platform) VALUES
  ('windows','Windows','windows'),('linux','Linux','linux'),('reseau','Réseau','network'),
  ('docker-kubernetes','Docker & Kubernetes','kubernetes'),('certifications','Certifications',NULL)
ON CONFLICT DO NOTHING;

-- Offres -----------------------------------------------------------------------
INSERT INTO billing.plans (code, name, price_cents, interval, per_seat, features, is_public) VALUES
  ('free','Free',0,'month',false,'{"ai.questions_per_day":10,"ai.diagnostics_per_month":3,"labs.categories":["linux"],"labs.hours_per_month":2}',true),
  ('premium','Premium',999,'month',false,'{"ai.questions_per_day":100,"ai.diagnostics_per_month":30,"labs.categories":["linux","docker","network"],"labs.hours_per_month":20,"certifications.discount_pct":20}',true),
  ('pro','Pro',1999,'month',false,'{"ai.questions_per_day":"unlimited","ai.diagnostics_per_month":"unlimited","labs.categories":"all","labs.hours_per_month":60,"probe.devices":5,"certifications.discount_pct":40}',true),
  ('enterprise','Entreprise',NULL,'year',true,'{"sso":true,"team_dashboard":true,"probe.devices":"unlimited"}',true),
  ('training_center','Licence Centre de Formation',NULL,'year',true,'{"cohorts":true,"custom_paths":true}',true),
  ('school','Licence École',NULL,'year',true,'{"cohorts":true,"teacher_dashboard":true}',true),
  ('university','Licence Université',NULL,'year',true,'{"cohorts":true,"lti":true,"research_export":true}',true)
ON CONFLICT DO NOTHING;

-- Agents IA (profils) -------------------------------------------------------------
INSERT INTO ai.agent_profiles (code, name, mission, system_prompt, tools, rag_filters, model_tier) VALUES
  ('tutor','Tuteur pédagogique','Former, expliquer, adapter le niveau, créer exercices, quiz et labs.','Tu es un tuteur…',ARRAY['kb.search','rag.search','quiz.generate','lab.suggest'],'{}','standard'),
  ('diagnostician','Diagnosticien IA','Trouver l''origine probable des pannes avec un score de confiance et un plan d''action.','Tu es un diagnosticien…',ARRAY['deduction.rank','logs.analyze','rag.search'],'{}','large'),
  ('windows_expert','Expert Windows','CMD, PowerShell, BitLocker, AD, Hyper-V, WSL, Windows Server, Intune, Azure.','Tu es expert Windows…',ARRAY['rag.search','kb.search'],'{"publisher":["Microsoft"]}','standard'),
  ('linux_expert','Expert Linux','Ubuntu, Debian, Fedora, Rocky, Alma, Arch ; Bash, systemd, réseau, Docker, Kubernetes.','Tu es expert Linux…',ARRAY['rag.search','kb.search'],'{"publisher":["Linux man-pages","Docker","Kubernetes"]}','standard'),
  ('macos_expert','Expert macOS','macOS, APFS, FileVault, Time Machine.','Tu es expert macOS…',ARRAY['rag.search','kb.search'],'{"publisher":["Apple"]}','standard'),
  ('ios_expert','Expert iOS et iPadOS','iPhone, iPad, iCloud, sauvegarde, synchronisation, batterie, diagnostic.','Tu es expert iOS…',ARRAY['rag.search'],'{"publisher":["Apple"]}','standard'),
  ('android_expert','Expert Android','Samsung, Google Pixel, Xiaomi, Oppo.','Tu es expert Android…',ARRAY['rag.search'],'{"publisher":["Android"]}','standard'),
  ('network_expert','Expert réseau','TCP/IP, DNS, DHCP, VPN, VLAN, NAT, pare-feu, Wireshark.','Tu es expert réseau…',ARRAY['rag.search','kb.search'],'{}','standard'),
  ('devops_expert','Expert DevOps','Docker, Kubernetes, CI/CD, GitHub Actions, Terraform.','Tu es expert DevOps…',ARRAY['rag.search','kb.search'],'{"publisher":["Docker","Kubernetes"]}','standard'),
  ('log_analyst','Analyste de logs','Event Viewer, syslog, Docker, PostgreSQL, Apache, Nginx : détection d''anomalies.','Tu analyses des journaux…',ARRAY['logs.parse','logs.match_patterns'],'{}','standard'),
  ('lab_generator','Générateur de laboratoires','Scénarios de pannes, exercices, études de cas, TP.','Tu conçois des labs…',ARRAY['lab.template.create','sandbox.validate'],'{}','large'),
  ('evaluator','Évaluateur','Évaluer compétences, progression et connaissances ; créer quiz, examens, certifications.','Tu évalues…',ARRAY['quiz.generate','skills.read'],'{}','standard')
ON CONFLICT DO NOTHING;

INSERT INTO ai.rag_sources (publisher, base_url, license) VALUES
  ('Microsoft','https://learn.microsoft.com/','CC BY 4.0 (docs) — vérifier par section'),
  ('Linux man-pages','https://man7.org/linux/man-pages/','Licences variées (GPL/BSD/verbatim) — citer, ne pas republier'),
  ('Apple','https://support.apple.com/guide/','Propriétaire — citations courtes et liens uniquement'),
  ('Docker','https://docs.docker.com/','Apache 2.0'),
  ('PostgreSQL','https://www.postgresql.org/docs/','PostgreSQL License'),
  ('Kubernetes','https://kubernetes.io/docs/','CC BY 4.0')
ON CONFLICT DO NOTHING;

COMMIT;

REFRESH MATERIALIZED VIEW learning.dashboard_progress;
