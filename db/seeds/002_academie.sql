-- =============================================================================
-- Contenu de démonstration de l'académie (rejouable : met à jour le contenu existant)
-- Chaque leçon suit la même trame : pourquoi → comment → quand → risques → alternatives.
-- =============================================================================
BEGIN;

INSERT INTO learning.modules (id, course_id, title, position) VALUES
  ('00000000-0000-4000-8400-000000000004','00000000-0000-4000-8300-000000000003','Conteneurs et images',1)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

INSERT INTO learning.lessons (id, module_id, slug, title, type, est_minutes, position, objectives, content_md) VALUES

-- ---------------------------------------------------------------- Windows ----
('00000000-0000-4000-8500-000000000001','00000000-0000-4000-8400-000000000001','sequence-demarrage',
 'La séquence de démarrage','reading',15,1,
 ARRAY['Nommer les étapes du démarrage de Windows','Associer un symptôme à l''étape qui échoue'],
$md$
## Pourquoi c'est important

Quand un PC « ne démarre pas », la panne se situe à **une étape précise**. Savoir laquelle évite de tout réinstaller par réflexe.

## Comment ça fonctionne

1. **Micrologiciel (UEFI)** : teste le matériel (POST), puis lit la partition système EFI.
2. **Gestionnaire de démarrage** (`bootmgfw.efi`) : lit la configuration (BCD) et choisit le système.
3. **Chargeur** (`winload.efi`) : charge le noyau et les pilotes de démarrage.
4. **Noyau** (`ntoskrnl.exe`) : initialise la mémoire, les pilotes, puis lance les services.
5. **Session** : `winlogon`, écran de connexion, puis votre bureau.

## Quel symptôme pour quelle étape ?

| Symptôme | Étape probable |
|---|---|
| Bips, rien à l'écran | 1 — matériel (RAM, carte graphique) |
| « No bootable device » | 1 → 2 — disque non vu ou partition EFI absente |
| Écran bleu pendant le logo | 3 → 4 — pilote de démarrage |
| Écran noir après connexion | 5 — session ou `explorer.exe` |

## Risques

Modifier le BCD (`bcdedit`) sans sauvegarde peut rendre la machine indémarrable. Faites toujours `bcdedit /export C:\bcd-sauvegarde` avant.

## Alternatives

L'**environnement de récupération** (WinRE) propose une *réparation du démarrage* automatique : à essayer avant toute manipulation manuelle.
$md$),

('00000000-0000-4000-8500-000000000004','00000000-0000-4000-8400-000000000001','journaux-evenements',
 'Lire l''Observateur d''événements','interactive',20,2,
 ARRAY['Filtrer le journal Système par niveau et par source','Reconnaître les événements 41, 1074 et 6008'],
$md$
## Pourquoi

Windows note presque tout ce qui lui arrive. Lire le journal transforme une supposition (« c'est sûrement la RAM ») en **constat**.

## Comment

1. `Win + R`, tapez `eventvwr.msc`.
2. *Journaux Windows → Système*, puis **Filtrer le journal actuel** : niveaux *Critique* et *Erreur*.
3. Regardez l'**heure** de l'incident, pas seulement le dernier événement.

## Trois événements à connaître

| ID | Source | Ce qu'il signifie |
|---|---|---|
| **41** | Kernel-Power | Redémarrage sans arrêt propre : coupure, alimentation, surchauffe ou blocage total |
| **1074** | User32 | Arrêt demandé par un programme ou un utilisateur (ex. Windows Update) |
| **6008** | EventLog | L'arrêt précédent était inattendu |

Un 41 **seul** ne dit pas *pourquoi* : il dit seulement que Windows n'a pas pu s'arrêter proprement. Cherchez ce qui le précède.

## Quand l'utiliser

Avant toute réparation, et à chaque fois que vous lancez un [diagnostic](/diagnostic) : copiez les lignes pertinentes dans le champ « extrait de journal ».

## Alternative

En PowerShell : `Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2} -MaxEvents 20`. Pratique à distance ou dans un script.
$md$),

('00000000-0000-4000-8500-000000000002','00000000-0000-4000-8400-000000000002','sfc-dism',
 'Réparer les fichiers système avec SFC et DISM','interactive',25,1,
 ARRAY['Expliquer la différence entre SFC et DISM','Choisir l''ordre des outils et lire CBS.log'],
$md$
## Pourquoi deux outils ?

- **SFC** vérifie les fichiers système protégés et les remplace par une copie saine…
- … qu'il prend dans le **magasin de composants** (`WinSxS`).
- **DISM** répare ce magasin.

Si le magasin est abîmé, SFC ne peut rien réparer : c'est pourquoi on combine les deux.

## Comment (invite de commandes en administrateur)

1. Observer sans modifier : [`sfc /verifyonly`](/commandes/windows-sfc)
2. Si des problèmes sont signalés : `sfc /scannow`
3. Si SFC n'a pas tout réparé : [`DISM /Online /Cleanup-Image /RestoreHealth`](/commandes/windows-dism-restorehealth), puis relancer `sfc /scannow`.

Le détail est dans `C:\Windows\Logs\CBS\CBS.log`. Lisez-le plutôt que de relancer SFC en boucle.

## Quand

Écrans bleus inexpliqués, applications intégrées qui plantent, après une mise à jour interrompue.

## Risques

Faibles : SFC remplace des fichiers système. Une personnalisation volontaire (thème modifié) sera annulée. N'interrompez pas DISM.

## Alternatives

Si les deux échouent : *réinitialiser ce PC* en conservant les fichiers, ou une réparation sur place depuis l'ISO de la même version.
$md$),

('00000000-0000-4000-8500-000000000005','00000000-0000-4000-8400-000000000002','points-de-restauration',
 'Étude de cas : revenir en arrière après une mise à jour de pilote','case_study',20,2,
 ARRAY['Choisir entre restauration du pilote et point de restauration','Mesurer ce qu''une restauration annule'],
$md$
## La situation

Depuis la mise à jour du pilote graphique hier, le PC de Samia affiche un écran bleu `VIDEO_TDR_FAILURE` en jeu.

## Raisonnement

1. **Corrélation temporelle** forte avec la mise à jour : le pilote est le suspect n°1.
2. Le message cite la vidéo (`TDR` = *Timeout Detection and Recovery* du pilote graphique).

## Trois options, de la plus ciblée à la plus large

| Option | Ce qu'elle annule | Quand la choisir |
|---|---|---|
| **Restaurer le pilote** (Gestionnaire de périphériques → Pilote → *Restaurer*) | Uniquement ce pilote | Premier choix |
| **Point de restauration** | Pilotes, registre, programmes installés depuis | Plusieurs changements suspects |
| **Réinitialiser Windows** | Tous les programmes | En dernier recours |

Un point de restauration **ne touche pas vos documents**, mais désinstalle les programmes installés après lui. Prévenez l'utilisateur.

## Ce qu'on retient

Toujours commencer par l'action **la plus ciblée** qui teste l'hypothèse. Si l'écran bleu disparaît après la restauration du pilote, l'hypothèse est confirmée et on peut signaler le bug au fabricant.
$md$),

-- ------------------------------------------------------------------ Linux ----
('00000000-0000-4000-8500-000000000003','00000000-0000-4000-8400-000000000003','systemctl-bases',
 'systemctl : démarrer, arrêter, activer','lab',30,1,
 ARRAY['Distinguer start et enable','Lire le statut d''une unité en échec'],
$md$
## Pourquoi

Sur Debian, Ubuntu, Fedora, Rocky ou Arch, **systemd** lance et surveille les services. Le piloter correctement évite les services « qui marchaient avant le redémarrage ».

## start ≠ enable

| Commande | Effet | Survit au redémarrage ? |
|---|---|---|
| `systemctl start nginx` | Démarre maintenant | Non |
| `systemctl enable nginx` | Démarre au prochain boot | Oui, mais pas maintenant |
| `systemctl enable --now nginx` | Les deux | Oui |

## Lire un statut

```
$ systemctl status nginx
● nginx.service - A high performance web server
     Active: failed (Result: exit-code) since …
    Process: 1234 ExecStartPre=/usr/sbin/nginx -t (code=exited, status=1/FAILURE)
```

`ExecStartPre … status=1` : c'est la **vérification de configuration** qui a échoué, pas nginx lui-même. Voir la fiche [systemctl](/commandes/linux-systemctl).

## Risques

`stop` ou `restart` sur `sshd` ou le réseau d'un serveur distant peut **couper votre propre accès**. Préférez `reload` quand le service le permet.

## Alternative

`service nginx start` fonctionne encore (compatibilité SysV) mais masque les détails : apprenez `systemctl`.
$md$),

('00000000-0000-4000-8500-000000000006','00000000-0000-4000-8400-000000000003','journalctl-diagnostic',
 'Comprendre pourquoi un service échoue','interactive',25,2,
 ARRAY['Filtrer journald par unité, priorité et démarrage','Remonter à la première erreur, pas à la dernière'],
$md$
## Pourquoi

`systemctl status` n'affiche que les dernières lignes. La **cause** est souvent plus haut.

## Comment

```
journalctl -u nginx -b --no-pager        # ce démarrage, cette unité
journalctl -u nginx -p err --since today  # seulement les erreurs
journalctl -b -1 -p warning               # démarrage précédent (après un crash)
```

## Méthode

1. Trouver le **premier** message d'erreur dans le temps : les suivants en sont souvent des conséquences.
2. Le lire en entier : chemin de fichier, numéro de ligne, permission refusée…
3. Formuler une hypothèse **avant** de modifier quoi que ce soit.

## Quand

À chaque échec de service, et systématiquement après un redémarrage inattendu (`-b -1`).

## Risque

Aucun : la lecture ne modifie rien. Attention cependant aux journaux partagés : ils peuvent contenir des données personnelles.

## Alternative

Sur les systèmes sans journal persistant, `/var/log/syslog` ou `/var/log/messages`. Voir la fiche [journalctl](/commandes/linux-journalctl).
$md$),

('00000000-0000-4000-8500-000000000007','00000000-0000-4000-8400-000000000003','unite-personnalisee',
 'Écrire sa première unité systemd','lab',35,3,
 ARRAY['Écrire une unité de service minimale','Choisir une politique de redémarrage adaptée'],
$md$
## Pourquoi

Lancer un script avec `nohup … &` ne survit ni au redémarrage ni au plantage. Une **unité** donne : démarrage automatique, redémarrage, journaux, limites de ressources.

## Comment

`sudo systemctl edit --force --full monapp.service` :

```ini
[Unit]
Description=Mon application
After=network-online.target
Wants=network-online.target

[Service]
User=monapp
ExecStart=/opt/monapp/bin/serveur --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Puis `sudo systemctl daemon-reload && sudo systemctl enable --now monapp`.

## Les choix expliqués

- `User=monapp` : jamais root sans raison (moindre privilège).
- `Restart=on-failure` plutôt que `always` : un arrêt volontaire ne relance pas le service.
- `After=network-online.target` : l'application a besoin du réseau.

## Risque

Un `Restart=always` sans `RestartSec` sur un programme qui plante immédiatement fait boucler le service. systemd finit par abandonner (`start-limit-hit`).

## Alternatives

Un conteneur (Docker, Podman) si l'application a beaucoup de dépendances ; un *timer* systemd plutôt que cron pour une tâche planifiée.
$md$),

-- ----------------------------------------------------------------- Docker ----
('00000000-0000-4000-8500-000000000008','00000000-0000-4000-8400-000000000004','image-vs-conteneur',
 'Image ou conteneur ?','reading',15,1,
 ARRAY['Distinguer image, conteneur et volume','Expliquer pourquoi les données d''un conteneur disparaissent'],
$md$
## L'analogie (et sa limite)

Une **image** est un modèle en lecture seule ; un **conteneur** est une instance qui tourne, avec une fine couche inscriptible au-dessus. Comme une classe et un objet… sauf qu'un conteneur supprimé **perd sa couche inscriptible**.

## Conséquence pratique

```
docker run --name db -e POSTGRES_PASSWORD=x postgres:16
docker rm -f db          # les données sont perdues
```

Pour conserver des données : un **volume**.

```
docker run --name db -e POSTGRES_PASSWORD=x -v pgdata:/var/lib/postgresql/data postgres:16
```

## Quand utiliser quoi

| Besoin | Outil |
|---|---|
| Données à conserver (base, fichiers envoyés) | Volume nommé |
| Code en développement | Montage de répertoire (`-v $PWD:/app`) |
| Configuration | Variables d'environnement ou fichier monté en lecture seule |

## Risque

`docker system prune --volumes` supprime aussi les volumes inutilisés : **toutes les données** d'une base arrêtée.
$md$),

('00000000-0000-4000-8500-000000000009','00000000-0000-4000-8400-000000000004','conteneur-en-boucle',
 'Étude de cas : un conteneur redémarre en boucle','case_study',20,2,
 ARRAY['Lire l''état et les journaux d''un conteneur','Distinguer erreur d''application et erreur de configuration'],
$md$
## La situation

`docker ps` affiche `Restarting (1) 5 seconds ago` pour le conteneur `api`.

## Démarche

1. **Code de sortie** : `docker inspect api --format '{{.State.ExitCode}}'`
   - `1` : l'application a signalé une erreur ;
   - `137` : tuée (souvent manque de mémoire, *OOM*) ;
   - `127` : commande introuvable dans l'image.
2. **Journaux** : [`docker logs --tail 50 api`](/commandes/docker-logs)

```
Error: DATABASE_URL is not defined
```

3. **Hypothèse** : variable absente du fichier `.env`. **Vérification** : `docker inspect api --format '{{json .Config.Env}}'`.

## Correction

Ajouter la variable, puis `docker compose up -d api`. Inutile de reconstruire l'image : c'est la **configuration**, pas le code.

## À retenir

La politique `restart: always` masque les erreurs : le conteneur semble « vivant » alors qu'il plante toutes les 5 secondes. Regardez toujours le **nombre de redémarrages** (`docker ps`) et le code de sortie.
$md$)

ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, slug = EXCLUDED.slug, title = EXCLUDED.title, type = EXCLUDED.type,
  est_minutes = EXCLUDED.est_minutes, position = EXCLUDED.position,
  objectives = EXCLUDED.objectives, content_md = EXCLUDED.content_md;

-- Compétences développées par les leçons
INSERT INTO learning.lesson_skills (lesson_id, skill_id)
SELECT l.id, s.id FROM (VALUES
  ('00000000-0000-4000-8500-000000000001'::uuid,'windows.boot'),
  ('00000000-0000-4000-8500-000000000004'::uuid,'windows.eventlog'),
  ('00000000-0000-4000-8500-000000000002'::uuid,'windows.repair'),
  ('00000000-0000-4000-8500-000000000005'::uuid,'windows.repair'),
  ('00000000-0000-4000-8500-000000000003'::uuid,'linux.systemd'),
  ('00000000-0000-4000-8500-000000000006'::uuid,'linux.journald'),
  ('00000000-0000-4000-8500-000000000007'::uuid,'linux.systemd'),
  ('00000000-0000-4000-8500-000000000008'::uuid,'docker.containers'),
  ('00000000-0000-4000-8500-000000000009'::uuid,'docker.containers')
) AS v(lesson_id, code)
JOIN learning.lessons l ON l.id = v.lesson_id
JOIN skills.skills s ON s.code = v.code
ON CONFLICT DO NOTHING;

COMMIT;
