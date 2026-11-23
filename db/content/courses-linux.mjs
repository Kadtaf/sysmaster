// Cours du parcours « Administrateur Linux ». Trame de chaque leçon :
// pourquoi → comment → quand → risques → alternatives.
export default [
  {
    slug: 'linux-ligne-de-commande', title: 'Linux : la ligne de commande sans danger', platform: 'linux', difficulty: 'beginner', isPremium: false,
    summary: 'Se déplacer, lire les droits, comprendre les processus et agir sans casser : les réflexes qui précèdent toute administration.',
    modules: [
      {
        title: 'Se repérer',
        lessons: [
          {
            slug: 'arborescence', title: 'L’arborescence Linux : où est quoi', type: 'reading', estMinutes: 15, skills: ['linux.shell'],
            objectives: ['Situer /etc, /var, /home, /usr et /tmp', 'Savoir où chercher une configuration ou un journal'],
            contentMd: `## Pourquoi c'est important

Sous Linux, **tout est un fichier** et chaque type de fichier a sa place. Savoir où regarder fait gagner un temps considérable : la configuration d'un service n'est jamais dans un dossier au hasard.

## Comment c'est organisé

| Dossier | Contient | Exemple |
|---|---|---|
| \`/etc\` | la **configuration**, en texte | \`/etc/ssh/sshd_config\` |
| \`/var\` | ce qui **varie** : journaux, bases, files d'attente | \`/var/log\`, \`/var/lib/postgresql\` |
| \`/home\` | les dossiers des utilisateurs | \`/home/alice\` |
| \`/usr\` | les programmes installés par le système | \`/usr/bin/ls\` |
| \`/tmp\` | les fichiers temporaires, souvent vidés au redémarrage | — |
| \`/proc\`, \`/sys\` | une **vue du noyau**, pas de vrais fichiers | \`/proc/meminfo\` |

## Quand s'en servir

- Un service se comporte mal : sa configuration est dans \`/etc/<service>\`, ses données dans \`/var/lib/<service>\`.
- Un disque se remplit : regardez d'abord \`/var/log\` et \`/var/lib\`.

## Risques

Ne modifiez pas les fichiers de \`/usr\` à la main : le gestionnaire de paquets les écrasera à la prochaine mise à jour. Vos réglages vont dans \`/etc\`.

## Alternatives

\`man hier\` décrit l'arborescence complète de votre distribution.`,
          },
          {
            slug: 'lire-les-droits', title: 'Lire et corriger les droits', type: 'interactive', estMinutes: 20, skills: ['linux.permissions'],
            objectives: ['Lire une ligne de ls -l', 'Choisir entre chmod et chown pour corriger un « Permission denied »'],
            contentMd: `## Pourquoi

« Permission denied » est l'erreur la plus fréquente sous Linux. Elle a toujours une explication précise, lisible en une ligne.

## Comment lire \`ls -l\`

\`\`\`
-rw-r----- 1 postgres postgres 4096 mars 3 10:12 pg_hba.conf
│└┬┘└┬┘└┬┘   └──┬───┘ └──┬───┘
│ │  │  │      │        └ groupe
│ │  │  │      └ propriétaire
│ │  │  └ autres : aucun droit
│ │  └ groupe : lecture
│ └ propriétaire : lecture, écriture
└ type : - fichier, d répertoire, l lien
\`\`\`

Pour un **répertoire**, \`x\` signifie « traverser » : sans lui, on ne peut atteindre aucun fichier à l'intérieur, même lisible.

## Méthode de diagnostic

1. Qui exécute ? \`id\` (ou \`ps -o user= -p PID\` pour un service).
2. Que demande-t-il ? lire, écrire, exécuter.
3. \`ls -ld\` sur **chaque dossier du chemin** puis sur le fichier.
4. Corriger le plus petit élément fautif : le **propriétaire** avec \`chown\`, ou les **droits** avec \`chmod\`.

## Risques

\`chmod 777\` « répare » tout en ouvrant tout : n'importe quel service compromis peut alors modifier le fichier. \`chown -R\` sur un mauvais chemin peut casser le système.

## Alternatives

Pour donner l'accès à une personne précise sans changer le groupe, les **ACL** (\`setfacl\`) sont plus fines.`,
          },
        ],
      },
      {
        title: 'Processus et sauvegardes',
        lessons: [
          {
            slug: 'processus-et-signaux', title: 'Processus et signaux : arrêter proprement', type: 'reading', estMinutes: 20, skills: ['linux.processes'],
            objectives: ['Identifier le processus qui consomme une ressource', 'Expliquer la différence entre SIGTERM et SIGKILL'],
            contentMd: `## Pourquoi

Une machine lente ou un programme bloqué se traitent en identifiant **le** processus en cause, pas en redémarrant tout.

## Comment

1. **Identifier** : \`ps aux --sort=-%cpu | head\` (ou \`--sort=-%mem\`).
2. **Comprendre** : à qui appartient-il ? est-ce un service (\`systemctl status <pid>\` le dit) ?
3. **Agir** proprement :
   - service → \`systemctl restart nom\` ;
   - autre processus → \`kill PID\` (SIGTERM), attendre, vérifier.

## SIGTERM ou SIGKILL ?

| Signal | Qui agit | Conséquence |
|---|---|---|
| SIGTERM (15) | le programme | il ferme ses fichiers, libère ses verrous, puis s'arrête |
| SIGKILL (9) | le noyau | arrêt immédiat ; rien n'est nettoyé |

## Risques

- Arrêter un processus interrompt ce qu'il faisait : sessions d'utilisateurs, traitements en cours.
- **-9** empêche tout nettoyage : verrous et écritures en cours peuvent rester incohérents. N'y recourir que si SIGTERM est resté sans effet, et jamais sur une base de données.
- Un PID peut être réutilisé : vérifiez-le (\`ps -p PID -o cmd\`) juste avant d'agir.

## États à connaître

- **D** : bloqué dans le noyau (souvent un disque ou un partage réseau). Même -9 n'y peut rien : cherchez l'entrée-sortie en cause.
- **Z** : zombie, déjà mort. C'est son parent qui doit le récupérer.

## Alternatives

\`top\` ou \`htop\` pour suivre l'évolution en direct.`,
          },
          {
            slug: 'sauvegarder-avant-modifier', title: 'Sauvegarder avant de modifier', type: 'lab', estMinutes: 15, skills: ['linux.shell'],
            objectives: ['Archiver une configuration avec tar avant une modification', 'Revenir en arrière en une commande'],
            contentMd: `## Pourquoi

La plupart des incidents d'administration viennent d'une modification. Une copie de 10 secondes permet un retour arrière immédiat.

## Comment

\`\`\`bash
sudo tar -czf ~/nginx-$(date +%F-%H%M).tar.gz /etc/nginx
tar -tzf ~/nginx-*.tar.gz | head     # vérifier le contenu
\`\`\`

Modifier, puis **valider avant de recharger** : \`sudo nginx -t\` (la plupart des services ont un équivalent).

Retour arrière :

\`\`\`bash
sudo tar -xzf ~/nginx-2026-11-23-1012.tar.gz -C /
sudo systemctl reload nginx
\`\`\`

## Quand

Avant toute modification de \`/etc\`, avant une mise à jour majeure, avant un script qui écrit beaucoup de fichiers.

## Risques

L'extraction **écrase** sans demander. Listez toujours le contenu d'une archive avant de l'extraire, surtout avec \`-C /\`.

## Alternatives

\`etckeeper\` versionne \`/etc\` avec Git automatiquement : chaque modification devient un commit consultable.`,
          },
        ],
      },
    ],
  },

  {
    slug: 'linux-reseau', title: 'Linux : diagnostiquer le réseau', platform: 'linux', difficulty: 'intermediate', isPremium: false,
    summary: 'Une méthode couche par couche pour savoir si le problème vient de l’interface, de la route, du DNS ou du service.',
    modules: [
      {
        title: 'Méthode couche par couche',
        lessons: [
          {
            slug: 'interface-et-route', title: 'Interface, adresse et route', type: 'interactive', estMinutes: 20, skills: ['linux.network'],
            objectives: ['Vérifier qu’une interface est active et adressée', 'Trouver la route par défaut et le chemin d’un paquet'],
            contentMd: `## Pourquoi

Avant d'accuser le pare-feu ou le DNS, il faut vérifier les fondations : sans interface active ni route, rien ne sort.

## Comment, dans l'ordre

\`\`\`bash
ip -br a                 # 1. interface UP avec une adresse ?
ip route                 # 2. une ligne « default via … » ?
ip route get 1.1.1.1     # 3. chemin réellement choisi
ping -c3 <passerelle>    # 4. la passerelle répond-elle ?
\`\`\`

| Constat | Cause probable |
|---|---|
| Interface DOWN | câble, Wi-Fi, ou interface désactivée |
| Pas d'adresse | DHCP en échec, configuration absente |
| Pas de route par défaut | passerelle non configurée |
| Passerelle muette | réseau local, VLAN, équipement |

## Quand

Au tout début de chaque incident réseau, même « évident ».

## Risques

Lire ne coûte rien. Modifier (\`ip link set … down\`, \`ip route del\`) sur l'interface de votre session SSH **coupe votre accès**. Et ces modifications disparaissent au redémarrage.

## Alternatives

\`nmcli\` (NetworkManager) ou \`networkctl\` (systemd-networkd) montrent la même chose et gèrent la configuration **durable**.`,
          },
          {
            slug: 'dns-ou-reseau', title: 'DNS ou réseau ? Trancher en deux commandes', type: 'reading', estMinutes: 15, skills: ['network.dns'],
            objectives: ['Distinguer une panne DNS d’une panne réseau', 'Lire NXDOMAIN et SERVFAIL'],
            contentMd: `## Pourquoi

« Internet ne marche pas » veut souvent dire « les noms ne se résolvent pas ». Les causes et les correctifs sont très différents.

## Comment

\`\`\`bash
ping -c3 1.1.1.1          # le réseau fonctionne-t-il ?
dig +short exemple.fr     # le DNS répond-il ?
dig @1.1.1.1 exemple.fr   # un autre résolveur répond-il ?
\`\`\`

| IP | DNS local | DNS public | Conclusion |
|---|---|---|---|
| ✗ | ✗ | ✗ | réseau : revoir interface et route |
| ✓ | ✗ | ✓ | **résolveur local** en panne ou mal configuré |
| ✓ | ✗ | ✗ | le nom n'existe pas, ou le domaine est en panne |

## Lire la réponse de dig

- **NOERROR** sans réponse : le nom existe, pas pour ce type d'enregistrement.
- **NXDOMAIN** : le nom n'existe pas (faute de frappe, enregistrement manquant).
- **SERVFAIL** : le serveur n'a pas pu répondre (DNSSEC, serveur autoritaire injoignable).

## Où est configuré le résolveur ?

\`resolvectl status\` sur les systèmes avec systemd-resolved, sinon \`/etc/resolv.conf\`.

## Risques

Aucun pour le diagnostic. Remplacer le résolveur d'un serveur d'entreprise par un DNS public casse la résolution des noms **internes**.`,
          },
          {
            slug: 'service-joignable', title: 'Le service écoute-t-il ?', type: 'lab', estMinutes: 20, skills: ['linux.network'],
            objectives: ['Vérifier le port et l’adresse d’écoute d’un service', 'Distinguer un service arrêté d’un pare-feu fermé'],
            contentMd: `## Pourquoi

Le réseau et le DNS fonctionnent, mais le site ne répond pas. Il reste trois suspects : le service, son adresse d'écoute, le pare-feu.

## Comment

\`\`\`bash
systemctl status nginx              # 1. le service tourne-t-il ?
sudo ss -tlnp 'sport = :443'        # 2. écoute-t-il, et sur quelle adresse ?
curl -sv https://localhost/ -k      # 3. répond-il en local ?
sudo ufw status  # ou firewall-cmd --list-all   # 4. pare-feu
\`\`\`

| Constat | Conclusion |
|---|---|
| Service arrêté | lire \`journalctl -u nginx\` |
| Écoute sur 127.0.0.1 | il n'est joignable qu'en local : changer l'adresse d'écoute |
| Répond en local, pas de l'extérieur | pare-feu ou groupe de sécurité du cloud |

## Quand

Après avoir validé interface, route et DNS.

## Risques

Ouvrir un port « pour voir » expose le service à Internet. Ouvrez seulement le port nécessaire, et seulement aux adresses qui en ont besoin.

## Alternatives

\`nc -zv hôte port\` teste un port TCP depuis un autre poste.`,
          },
        ],
      },
    ],
  },

  {
    slug: 'linux-stockage', title: 'Linux : disque plein et stockage', platform: 'linux', difficulty: 'intermediate', isPremium: false,
    summary: 'Trouver ce qui remplit un disque, libérer de la place sans rien casser, et éviter que cela recommence.',
    modules: [
      {
        title: 'Disque plein',
        lessons: [
          {
            slug: 'disque-plein-methode', title: 'Disque plein : la méthode df puis du', type: 'interactive', estMinutes: 20, skills: ['linux.storage'],
            objectives: ['Identifier la partition pleine', 'Descendre jusqu’au dossier responsable'],
            contentMd: `## Pourquoi

Un disque plein ne prévient pas : les bases passent en lecture seule, les journaux s'arrêtent, les services échouent avec des messages trompeurs.

## Comment

\`\`\`bash
df -h                                     # 1. quelle partition ?
df -i                                     # 2. ou bien les inodes ?
sudo du -xh --max-depth=1 /var | sort -h  # 3. quel dossier ?
\`\`\`

Recommencez l'étape 3 sur le plus gros dossier jusqu'à trouver la cause. Les coupables habituels :

- \`/var/log\` : journaux non tournés ;
- \`/var/lib/docker\` : images et conteneurs arrêtés ;
- \`/var/cache\` : paquets téléchargés ;
- un fichier de vidage (\`core\`) ou une sauvegarde oubliée.

## Le piège : df et du ne sont pas d'accord

Un fichier **supprimé mais encore ouvert** occupe toujours la place. \`sudo lsof +L1\` montre le processus qui le garde ouvert ; redémarrez-le proprement.

## Risques

Supprimer « ce qui est gros » sans comprendre peut détruire une base de données. Ne touchez jamais aux fichiers de \`/var/lib/postgresql\` ou \`/var/lib/mysql\` à la main.

## Alternatives

\`ncdu\` offre une navigation interactive dans les tailles.`,
          },
          {
            slug: 'liberer-sans-casser', title: 'Libérer de la place sans rien casser', type: 'case_study', estMinutes: 25, skills: ['linux.storage', 'linux.journald'],
            objectives: ['Nettoyer journaux, caches et images avec les outils prévus', 'Mettre en place une limite pour éviter la récidive'],
            contentMd: `## Pourquoi

Chaque type de données a son outil de nettoyage : il sait ce qui est sûr à supprimer, contrairement à \`rm\`.

## Comment

| Coupable | Nettoyage sûr | Prévention |
|---|---|---|
| journald | \`sudo journalctl --vacuum-size=500M\` | \`SystemMaxUse=500M\` dans \`/etc/systemd/journald.conf\` |
| journaux applicatifs | \`logrotate\` (vérifier \`/etc/logrotate.d\`) | rotation et compression quotidiennes |
| cache apt | \`sudo apt clean\` | — |
| Docker | \`docker system df\` puis \`docker image prune\` | limiter la taille des journaux des conteneurs |

## Cas réel

Un serveur web s'arrête un dimanche. \`df -h\` : \`/\` à 100 %. \`du\` mène à \`/var/log/nginx/access.log\` : 38 Go, la rotation était désactivée. Correctif immédiat : \`sudo truncate -s 0\` sur le journal (et non \`rm\`, qui laisse le fichier ouvert par nginx). Correctif durable : réactiver logrotate.

## Risques

- \`docker system prune -a --volumes\` supprime aussi les **volumes** non utilisés, donc des données.
- \`rm\` sur un journal ouvert ne libère rien tant que le service tourne.

## Alternatives

Une alerte de supervision à 80 % d'occupation évite d'avoir à intervenir dans l'urgence.`,
          },
        ],
      },
    ],
  },
];
