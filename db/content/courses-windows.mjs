// Cours du parcours « Technicien informatique » (Windows).
export default [
  {
    slug: 'windows-reseau', title: 'Windows : dépanner le réseau d’un poste', platform: 'windows', difficulty: 'beginner', isPremium: false,
    summary: 'Configuration IP, connectivité, DNS : une méthode par couches pour résoudre la plupart des « pas d’Internet ».',
    modules: [
      {
        title: 'Méthode par couches',
        lessons: [
          {
            slug: 'lire-ipconfig', title: 'Lire ipconfig /all', type: 'interactive', estMinutes: 15, skills: ['windows.network'],
            objectives: ['Repérer une adresse APIPA', 'Vérifier passerelle et serveurs DNS'],
            contentMd: `## Pourquoi

La configuration IP dit déjà beaucoup : un poste sans adresse valide ou sans passerelle ne pourra jamais sortir, quel que soit le reste.

## Comment

\`ipconfig /all\`, puis lire pour la carte active :

| Ligne | Ce qu'on vérifie |
|---|---|
| Adresse IPv4 | **169.254.x.x** = aucun serveur DHCP n'a répondu |
| Passerelle par défaut | vide = pas de sortie possible |
| Serveurs DNS | ceux de l'entreprise sur un poste du domaine |
| DHCP activé / Bail obtenu | savoir d'où vient la configuration |

## Quand

En premier, pour tout problème réseau.

## Risques

Lire ne coûte rien. \`ipconfig /release\` coupe la carte : jamais en bureau à distance.

## Alternatives

Dans PowerShell, \`Get-NetIPConfiguration\` donne la même information, plus facile à utiliser dans un script.`,
          },
          {
            slug: 'ping-par-couches', title: 'Tester par couches avec ping et tracert', type: 'interactive', estMinutes: 20, skills: ['windows.network'],
            objectives: ['Localiser une coupure entre le poste et Internet', 'Interpréter un délai dépassé sans conclure trop vite'],
            contentMd: `## Pourquoi

Chaque test qui réussit élimine une famille de causes. En trois commandes, on sait si le problème est local, chez le fournisseur ou côté DNS.

## Comment

\`\`\`
ping 192.168.1.1      (passerelle)
ping 1.1.1.1          (Internet par adresse)
ping www.exemple.fr   (Internet par nom)
\`\`\`

| Passerelle | 1.1.1.1 | Nom | Conclusion |
|---|---|---|---|
| ✗ | ✗ | ✗ | réseau local : câble, Wi-Fi, carte |
| ✓ | ✗ | ✗ | box, fournisseur ou pare-feu de sortie |
| ✓ | ✓ | ✗ | **DNS** |
| ✓ | ✓ | ✓ | le réseau va bien : regarder l'application ou le proxy |

Si 1.1.1.1 échoue, \`tracert -d 1.1.1.1\` montre le dernier équipement qui répond.

## Attention

Un « délai d'attente dépassé » ne prouve pas que la machine est éteinte : beaucoup de pare-feu, dont celui de Windows, bloquent ping.

## Risques

Aucun.`,
          },
          {
            slug: 'resoudre-dns-windows', title: 'Résoudre un problème DNS', type: 'case_study', estMinutes: 20, skills: ['network.dns', 'windows.network'],
            objectives: ['Comparer deux serveurs DNS avec nslookup', 'Savoir quand vider le cache DNS'],
            contentMd: `## Pourquoi

Quand les adresses répondent mais pas les noms, il est inutile de redémarrer la box : c'est la résolution de noms qu'il faut examiner.

## Comment

\`\`\`
nslookup intranet.exemple.local
nslookup intranet.exemple.local 1.1.1.1
ipconfig /flushdns
\`\`\`

- Le DNS interne répond, le public non : normal pour un nom **interne**.
- Aucun ne répond : enregistrement manquant ou mal orthographié.
- nslookup répond mais pas le navigateur : cache local (\`/flushdns\`), fichier \`hosts\`, ou proxy.

## Cas réel

Après la migration d'un serveur, une partie des postes ouvre encore l'ancien. \`nslookup\` donne bien la nouvelle adresse : les postes fautifs gardent l'ancienne en cache, jusqu'à la fin de sa durée de validité (TTL). \`ipconfig /flushdns\` corrige immédiatement. Pour la prochaine fois : baisser le TTL quelques jours avant une migration.

## Risques

Forcer un DNS public sur un poste du domaine casse l'ouverture de session et l'accès aux partages internes.`,
          },
        ],
      },
    ],
  },

  {
    slug: 'windows-disques', title: 'Windows : disques, fichiers système et démarrage', platform: 'windows', difficulty: 'intermediate', isPremium: false,
    summary: 'Vérifier un disque, réparer les fichiers de Windows dans le bon ordre et remettre en route un démarrage bloqué.',
    modules: [
      {
        title: 'Réparer dans le bon ordre',
        lessons: [
          {
            slug: 'chkdsk-sans-risque', title: 'Vérifier un disque sans le mettre en danger', type: 'reading', estMinutes: 15, skills: ['windows.disk'],
            objectives: ['Choisir entre /scan, /spotfix, /f et /r', 'Savoir quand sauvegarder avant de réparer'],
            contentMd: `## Pourquoi

Une coupure de courant ou un disque fatigué peuvent laisser le système de fichiers incohérent. Mais une réparation lancée trop vite sur un disque mourant peut faire perdre les données qu'on voulait sauver.

## Comment

| Étape | Commande | Effet |
|---|---|---|
| 1 | \`chkdsk C: /scan\` | analyse, ne modifie rien |
| 2 | \`chkdsk C: /spotfix\` | corrige seulement ce qui a été trouvé |
| 3 | \`chkdsk C: /f\` | réparation complète (au redémarrage pour C:) |
| 4 | \`chkdsk C: /r\` | lit tout le disque : long, et éprouvant pour un disque défaillant |

## Quand sauvegarder d'abord

- bruits anormaux, lenteurs extrêmes ;
- événements **disk 7** ou **153** dans le journal Système ;
- attributs SMART en alerte (\`Get-PhysicalDisk | Get-StorageReliabilityCounter\`).

Dans ces cas, **copiez les données avant toute réparation**.

## Risques

\`/f\` peut déplacer des fichiers trop endommagés dans \`found.000\`. \`/r\` peut achever un disque mécanique.

## Alternatives

Sur un SSD, \`/r\` n'apporte rien : le contrôleur gère lui-même les cellules défaillantes.`,
          },
          {
            slug: 'chaine-de-reparation', title: 'chkdsk, DISM puis SFC : pourquoi cet ordre', type: 'reading', estMinutes: 15, skills: ['windows.repair', 'windows.disk'],
            objectives: ['Expliquer ce que répare chaque outil', 'Enchaîner les réparations dans l’ordre qui fonctionne'],
            contentMd: `## Pourquoi

Les trois outils réparent des **couches différentes**. Les lancer dans le désordre donne des échecs incompréhensibles.

## Les couches

1. **Système de fichiers** (chkdsk) : la structure qui permet de lire n'importe quel fichier.
2. **Magasin de composants** (DISM) : les copies de référence des fichiers de Windows, dans \`C:\\Windows\\WinSxS\`.
3. **Fichiers système** (SFC) : les fichiers utilisés par Windows, restaurés **depuis** le magasin.

## Donc

\`\`\`
chkdsk C: /scan
DISM /Online /Cleanup-Image /RestoreHealth
sfc /scannow
\`\`\`

Si le magasin est abîmé, SFC ne peut pas réparer : il n'a plus de bonne copie à recopier. D'où DISM **avant** SFC.

## Quand

Plantages d'applications Windows, écrans bleus récurrents sans pilote en cause, mises à jour qui échouent toujours.

## Risques

Faibles : ces outils ne remplacent que des fichiers de Windows par leur version d'origine. DISM a besoin de Windows Update ou d'une source (\`/Source\`).

## Alternatives

Si tout échoue, la **réinstallation sur place** (mise à niveau avec le même ISO) conserve fichiers et applications.`,
          },
          {
            slug: 'demarrage-bloque', title: 'Remettre en route un démarrage bloqué', type: 'case_study', estMinutes: 25, skills: ['windows.boot'],
            objectives: ['Utiliser l’environnement de récupération (WinRE)', 'Sauvegarder et lire le magasin BCD avant de le modifier'],
            contentMd: `## Pourquoi

Un poste qui ne démarre plus n'est pas forcément à réinstaller : la plupart des démarrages bloqués se réparent depuis l'environnement de récupération.

## Comment

1. Accéder à **WinRE** : trois démarrages interrompus de suite, ou maintenir Maj en cliquant sur « Redémarrer ».
2. *Dépannage → Options avancées → Outil de redémarrage système* : la réparation automatique, **à essayer en premier**.
3. Si elle échoue, *Invite de commandes* :

\`\`\`
bcdedit /export C:\\bcd-sauvegarde
bcdedit /enum all
\`\`\`

## Cas réel

Un poste redémarre en boucle en mode sans échec après une intervention. \`bcdedit /enum {current}\` montre \`safeboot Minimal\`. Correctif : \`bcdedit /deletevalue {current} safeboot\`. Le poste redémarre normalement ; la sauvegarde du magasin n'a pas servi, mais elle aurait permis de revenir en arrière.

## Risques

\`bcdedit /delete\` sur la mauvaise entrée rend Windows **indémarrable**. Toujours exporter le magasin avant, et ne toucher qu'à l'option identifiée.

## Alternatives

\`bootrec /rebuildbcd\` reconstruit le magasin automatiquement ; sur un poste UEFI, \`bcdboot C:\\Windows\` recrée les fichiers de démarrage de la partition EFI.`,
          },
        ],
      },
    ],
  },
];
