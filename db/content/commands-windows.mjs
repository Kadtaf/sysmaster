// Fiches commandes Windows (mêmes exigences P-1 que les fiches Linux).
const learn = (cmd) => ({
  title: `${cmd} (Microsoft Learn)`,
  url: `https://learn.microsoft.com/fr-fr/windows-server/administration/windows-commands/${cmd}`,
  publisher: 'Microsoft',
});

export default [
  {
    slug: 'windows-ipconfig', name: 'ipconfig', platform: 'windows', shell: 'cmd', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Affiche la configuration IP des cartes réseau et gère le cache DNS et les baux DHCP.',
    history: 'Présente depuis Windows NT. Remplace winipcfg, l’outil graphique de Windows 9x.',
    internals: 'ipconfig interroge la pile TCP/IP et le client DHCP. /flushdns vide le cache du service Client DNS (Dnscache) ; /renew redemande une adresse au serveur DHCP.',
    syntax: 'ipconfig [/all] [/release] [/renew] [/flushdns] [/displaydns]',
    why: 'Savoir en dix secondes si le poste a une adresse valide, une passerelle et des serveurs DNS. Une adresse en 169.254.x.x signifie qu’aucun serveur DHCP n’a répondu.',
    whenToUse: 'Au tout début d’un diagnostic réseau, et après un changement de réseau ou de DNS. Pour des modifications durables, utiliser les paramètres réseau ou PowerShell (Set-NetIPAddress).',
    context: 'Invite de commandes ou PowerShell. La lecture ne demande aucun droit ; /release, /renew et /flushdns fonctionnent sans droits d’administrateur sur les versions récentes.',
    riskLevel: 'medium',
    risks: [
      { level: 'none', text: 'ipconfig et ipconfig /all sont en lecture seule.' },
      { level: 'low', text: '/flushdns oblige seulement à refaire les résolutions DNS : sans danger.' },
      { level: 'medium', text: '/release coupe immédiatement le réseau de la carte : en bureau à distance, vous perdez la session jusqu’au /renew, que vous ne pourrez plus lancer.' },
    ],
    bestPractices: [
      'Commencer par ipconfig /all : il montre aussi le serveur DHCP, les DNS et l’adresse physique (MAC).',
      'Ne jamais lancer /release à distance : enchaîner « ipconfig /release && ipconfig /renew » sur une seule ligne si c’est indispensable.',
    ],
    commonErrors: [
      { error: 'Adresse IPv4 en 169.254.x.x (APIPA)', cause: 'Le poste n’a reçu aucune réponse DHCP : câble, Wi-Fi, VLAN ou serveur DHCP en panne.', fix: 'Vérifier la connexion physique, puis ipconfig /renew ; si l’échec persiste, regarder le serveur DHCP.' },
    ],
    parameters: [
      { flag: '/all', description: 'Configuration complète : DHCP, DNS, passerelle, adresse MAC, bail.', riskLevel: 'none' },
      { flag: '/flushdns', description: 'Vide le cache DNS local.', riskLevel: 'low' },
      { flag: '/displaydns', description: 'Affiche le cache DNS local.', riskLevel: 'none' },
      { flag: '/renew', description: 'Redemande une adresse au serveur DHCP.', riskLevel: 'low' },
      { flag: '/release', description: 'Rend l’adresse DHCP : la carte n’a plus d’adresse.', riskLevel: 'medium' },
    ],
    examples: [
      { title: 'Le poste « n’a plus Internet »', code: 'ipconfig /all', explanation: 'On lit l’adresse IPv4 (169.254 = pas de DHCP), la passerelle par défaut (vide = pas de route) et les serveurs DNS.', isRealCase: true },
      { title: 'Un site a changé d’adresse mais le poste va encore sur l’ancienne', code: 'ipconfig /flushdns\nnslookup intranet.exemple.fr', explanation: 'On vide le cache local, puis on vérifie la nouvelle réponse DNS.', isRealCase: false },
    ],
    alternatives: [
      { slug: 'windows-ping', note: 'Pour tester la connectivité une fois la configuration vérifiée.' },
      { slug: 'linux-ip', note: 'Équivalent sous Linux.' },
    ],
    sources: [learn('ipconfig')],
  },

  {
    slug: 'windows-ping', name: 'ping', platform: 'windows', shell: 'cmd', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Vérifie qu’une machine répond sur le réseau et mesure le temps d’aller-retour.',
    history: 'Écrit par Mike Muuss en 1983, par analogie avec le sonar. Présent sur tous les systèmes.',
    internals: 'ping envoie des paquets ICMP Echo Request et attend des Echo Reply. Beaucoup de pare-feu bloquent ICMP : une absence de réponse ne prouve pas que la machine est éteinte.',
    syntax: 'ping [-n nombre] [-t] [-4|-6] destination',
    why: 'Séparer les couches d’un problème : la passerelle répond-elle ? une IP publique ? un nom ? Chaque réponse élimine une famille de causes.',
    whenToUse: 'Dans l’ordre : passerelle, puis IP publique (1.1.1.1), puis un nom. Pour savoir où le trajet s’arrête, utiliser tracert.',
    context: 'Aucun droit particulier. Le pare-feu Windows bloque par défaut les réponses ping entrantes : un poste Windows peut ne pas répondre tout en étant joignable.',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Envoie seulement quelques petits paquets.' }],
    bestPractices: [
      'Tester par étapes : passerelle → 1.1.1.1 → nom de domaine.',
      'Si l’IP répond et pas le nom, le problème est le DNS (nslookup).',
      'Utiliser -t pour surveiller une coupure intermittente, et Ctrl+C pour les statistiques.',
    ],
    commonErrors: [
      { error: 'Délai d’attente de la demande dépassé', cause: 'Pas de réponse : machine éteinte, route absente, ou ICMP bloqué par un pare-feu.', fix: 'Essayer la passerelle, puis un autre test (ouvrir le service, tracert) avant de conclure.' },
      { error: 'Impossible de trouver l’hôte', cause: 'Le nom ne se résout pas : problème DNS, pas de connectivité.', fix: 'nslookup nom, puis vérifier les DNS dans ipconfig /all.' },
    ],
    parameters: [
      { flag: '-n N', description: 'Envoie N paquets (4 par défaut).', riskLevel: 'none' },
      { flag: '-t', description: 'Envoie en continu jusqu’à Ctrl+C.', riskLevel: 'none' },
      { flag: '-4 / -6', description: 'Force IPv4 ou IPv6.', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Méthode par couches', code: 'ping 192.168.1.1\nping 1.1.1.1\nping www.exemple.fr', explanation: 'Passerelle OK mais 1.1.1.1 KO : problème chez le fournisseur ou la box. 1.1.1.1 OK mais le nom KO : problème DNS.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'windows-tracert', note: 'Pour voir à quel routeur le trajet s’arrête.' },
      { slug: 'windows-nslookup', note: 'Quand les adresses répondent mais pas les noms.' },
    ],
    sources: [learn('ping')],
  },

  {
    slug: 'windows-tracert', name: 'tracert', platform: 'windows', shell: 'cmd', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Affiche les routeurs traversés jusqu’à une destination et le temps de réponse de chacun.',
    history: 'Version Windows de traceroute (Van Jacobson, 1987).',
    internals: 'tracert envoie des paquets avec une durée de vie (TTL) croissante : 1, 2, 3… Chaque routeur qui décrémente le TTL à zéro renvoie un message ICMP « Time Exceeded », ce qui révèle son adresse.',
    syntax: 'tracert [-d] [-h sauts] destination',
    why: 'Quand ping échoue, savoir si le problème est sur le réseau local, chez le fournisseur ou près de la destination.',
    whenToUse: 'Après un ping en échec ou très lent vers une destination distante. Pour un problème de nom, utiliser nslookup.',
    context: 'Aucun droit particulier. Des étoiles (*) sur une ligne isolée sont normales : certains routeurs ne répondent pas à ces paquets.',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule ; génère un trafic très faible.' }],
    bestPractices: [
      'Ajouter -d pour éviter les résolutions de noms, souvent très lentes.',
      'Ne regarder que la première ligne où tout s’arrête durablement, pas une étoile isolée.',
    ],
    commonErrors: [],
    parameters: [
      { flag: '-d', description: 'N’affiche pas les noms des routeurs (beaucoup plus rapide).', riskLevel: 'none' },
      { flag: '-h N', description: 'Nombre maximal de sauts (30 par défaut).', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Le serveur d’une agence ne répond plus', code: 'tracert -d 10.20.0.15', explanation: 'Si tout s’arrête après la passerelle locale, regarder le lien VPN ou inter-sites ; si tout s’arrête juste avant le serveur, regarder son pare-feu.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'windows-ping', note: 'Pour un simple test de joignabilité.' },
    ],
    sources: [learn('tracert')],
  },

  {
    slug: 'windows-nslookup', name: 'nslookup', platform: 'windows', shell: 'cmd', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Interroge un serveur DNS pour connaître l’adresse d’un nom (ou le nom d’une adresse).',
    history: 'Fourni avec BIND dans les années 1980, intégré à Windows depuis NT.',
    internals: 'nslookup interroge directement un serveur DNS, sans passer par le cache local de Windows ni par le fichier hosts. Il peut donc répondre différemment d’une application.',
    syntax: 'nslookup [-type=A|MX|TXT] nom [serveur]',
    why: 'Distinguer une panne réseau d’une panne de résolution de noms, et vérifier ce que répond chaque serveur DNS.',
    whenToUse: 'Quand un ping par IP fonctionne mais pas par nom, après une modification DNS, ou pour vérifier les enregistrements d’un domaine Active Directory.',
    context: 'Aucun droit particulier.',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule.' }],
    bestPractices: [
      'Comparer le serveur interne et un serveur public : nslookup nom puis nslookup nom 1.1.1.1.',
      'Si nslookup répond mais pas l’application, vérifier le fichier hosts et vider le cache (ipconfig /flushdns).',
    ],
    commonErrors: [
      { error: 'DNS request timed out', cause: 'Le serveur DNS configuré ne répond pas.', fix: 'Vérifier l’adresse DNS dans ipconfig /all et la joignabilité de ce serveur.' },
      { error: '*** Non-existent domain', cause: 'Le nom n’existe pas sur ce serveur (NXDOMAIN).', fix: 'Vérifier l’orthographe et le suffixe DNS, ou créer l’enregistrement.' },
    ],
    parameters: [
      { flag: '-type=MX', description: 'Type d’enregistrement (A, AAAA, MX, TXT, SRV…).', riskLevel: 'none' },
      { flag: 'serveur', description: 'Interroge ce serveur DNS au lieu de celui configuré.', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Les postes ne trouvent plus le contrôleur de domaine', code: 'nslookup -type=SRV _ldap._tcp.dc._msdcs.exemple.local', explanation: 'Les postes trouvent les contrôleurs de domaine par ces enregistrements SRV ; s’ils manquent, l’ouverture de session échoue.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-dig', note: 'Équivalent plus détaillé sous Linux.' },
      { slug: 'windows-ipconfig', note: 'Pour vérifier quels serveurs DNS le poste utilise.' },
    ],
    sources: [learn('nslookup')],
  },

  {
    slug: 'windows-chkdsk', name: 'chkdsk', platform: 'windows', shell: 'cmd', difficulty: 'intermediate', requiresAdmin: true,
    summary: 'Vérifie la cohérence d’un système de fichiers NTFS et, sur demande, répare les erreurs logiques et repère les secteurs défectueux.',
    history: 'Héritée de MS-DOS. Depuis Windows 8, NTFS corrige beaucoup d’erreurs en ligne et /scan travaille sans démonter le volume.',
    internals: 'chkdsk vérifie la table des fichiers (MFT), les index et les descripteurs de sécurité. /f corrige ces structures ; /r lit en plus chaque secteur du disque pour déplacer les données lisibles hors des secteurs défectueux.',
    syntax: 'chkdsk [volume:] [/scan] [/f] [/r] [/spotfix]',
    why: 'Des fichiers qui disparaissent, des erreurs « fichier ou répertoire endommagé » ou un démarrage qui s’arrête sur une erreur disque peuvent venir d’une incohérence du système de fichiers.',
    whenToUse: 'Après une coupure de courant, sur un message de corruption ou un événement Ntfs dans le journal. Si le disque lui-même est en train de mourir (bruits, SMART en alerte), sauvegarder d’abord : /r le sollicite fortement.',
    context: 'Invite de commandes en administrateur. Le volume système ne peut pas être réparé à chaud : la réparation est programmée au prochain redémarrage.',
    riskLevel: 'high',
    risks: [
      { level: 'none', text: '/scan analyse sans rien modifier.' },
      { level: 'medium', text: '/f peut supprimer des fichiers trop endommagés (récupérés dans found.000) et rend le volume indisponible pendant la réparation.' },
      { level: 'high', text: '/r lit tout le disque : sur un disque mécanique défaillant, cela peut durer des heures et précipiter la panne avant la sauvegarde.' },
    ],
    bestPractices: [
      'Commencer par chkdsk C: /scan, qui ne modifie rien.',
      'Sauvegarder avant /f ou /r si les données comptent.',
      'Sur un SSD, /r n’a pas de sens (le contrôleur gère les cellules) : se contenter de /f.',
      'Lire ensuite le résultat dans l’Observateur d’événements (source Chkdsk ou Wininit).',
    ],
    commonErrors: [
      { error: 'Chkdsk ne peut pas s’exécuter car le volume est utilisé par un autre processus', cause: 'Volume système ou fichiers ouverts.', fix: 'Accepter la planification au prochain redémarrage (O), puis redémarrer.' },
    ],
    parameters: [
      { flag: '/scan', description: 'Analyse en ligne, sans réparer.', riskLevel: 'none' },
      { flag: '/spotfix', description: 'Corrige rapidement les erreurs déjà repérées par /scan.', riskLevel: 'medium' },
      { flag: '/f', description: 'Corrige les erreurs du système de fichiers.', riskLevel: 'medium' },
      { flag: '/r', description: 'Inclut /f et recherche les secteurs défectueux (long).', riskLevel: 'high' },
    ],
    examples: [
      { title: 'Erreur Ntfs 55 dans le journal Système', code: 'chkdsk C: /scan\nchkdsk C: /spotfix', explanation: 'L’analyse confirme la corruption sans rien toucher ; /spotfix corrige seulement les points trouvés, avec une indisponibilité de quelques secondes au redémarrage.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'windows-sfc', note: 'Quand ce sont les fichiers de Windows qui sont corrompus, pas le système de fichiers.' },
      { slug: 'windows-get-winevent', note: 'Pour lire le résultat de chkdsk après un redémarrage.' },
    ],
    sources: [learn('chkdsk')],
  },

  {
    slug: 'windows-get-winevent', name: 'Get-WinEvent', platform: 'windows', shell: 'powershell', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Lit les journaux d’événements Windows depuis PowerShell, avec des filtres précis.',
    history: 'Introduite avec PowerShell 2.0 (2009). Remplace Get-EventLog, qui ne lit pas les journaux modernes (Applications et services).',
    internals: 'Get-WinEvent utilise l’API Windows Event Log. Avec -FilterHashtable, le filtre est appliqué par le service de journalisation lui-même : bien plus rapide que de tout lire puis filtrer avec Where-Object.',
    syntax: 'Get-WinEvent -FilterHashtable @{LogName=\'System\'; Level=1,2; StartTime=(Get-Date).AddDays(-1)}',
    why: 'Lire les journaux sans interface graphique, à distance ou dans un script, et ne garder que les événements utiles au diagnostic.',
    whenToUse: 'Pour un diagnostic à distance, sur plusieurs postes, ou pour extraire un extrait à joindre à un diagnostic. Pour une première exploration, l’Observateur d’événements reste plus confortable.',
    context: 'PowerShell. Le journal Sécurité exige les droits d’administrateur ; Système et Application sont lisibles par tous.',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule. Les journaux peuvent contenir des noms d’utilisateurs et de machines : relisez avant de les partager.' }],
    bestPractices: [
      'Toujours filtrer avec -FilterHashtable, jamais Get-WinEvent | Where-Object sur un gros journal.',
      'Limiter le nombre avec -MaxEvents.',
      'Ajouter StartTime pour ne garder que la période de l’incident.',
    ],
    commonErrors: [
      { error: 'Aucun événement ne correspond aux critères de sélection', cause: 'Message normal quand le filtre ne trouve rien (et non une erreur de la commande).', fix: 'Élargir la période ou les niveaux ; ajouter -ErrorAction SilentlyContinue dans un script.' },
    ],
    parameters: [
      { flag: 'LogName', description: 'Journal : System, Application, Security, ou un journal Applications et services.', riskLevel: 'none' },
      { flag: 'Level', description: '1 critique, 2 erreur, 3 avertissement, 4 information.', riskLevel: 'none' },
      { flag: 'Id', description: 'Identifiant d’événement (41, 6008, 1074…).', riskLevel: 'none' },
      { flag: '-MaxEvents N', description: 'Ne renvoie que les N plus récents.', riskLevel: 'none' },
      { flag: '-ComputerName', description: 'Lit les journaux d’un autre poste (droits et pare-feu nécessaires).', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Redémarrages inattendus de la dernière semaine', code: 'Get-WinEvent -FilterHashtable @{LogName=\'System\'; Id=41,6008,1074; StartTime=(Get-Date).AddDays(-7)} |\n  Select-Object TimeCreated, Id, ProviderName, Message | Format-List', explanation: '41 et 6008 signalent un arrêt brutal ; 1074 un arrêt demandé (par exemple Windows Update). Les dates permettent de faire le lien avec l’activité.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-journalctl', note: 'Équivalent pour les journaux systemd sous Linux.' },
    ],
    sources: [{ title: 'Get-WinEvent', url: 'https://learn.microsoft.com/fr-fr/powershell/module/microsoft.powershell.diagnostics/get-winevent', publisher: 'Microsoft' }],
  },

  {
    slug: 'windows-tasklist', name: 'tasklist', platform: 'windows', shell: 'cmd', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Liste les processus en cours avec leur identifiant (PID), leur mémoire et, au besoin, les services qu’ils hébergent.',
    history: 'Présente depuis Windows XP Professionnel.',
    internals: 'tasklist énumère les processus via l’API Windows ; /svc relie chaque processus svchost.exe aux services qu’il héberge.',
    syntax: 'tasklist [/svc] [/v] [/fi "filtre"]',
    why: 'Identifier ce qui tourne, et surtout quel service se cache derrière un svchost.exe qui consomme trop.',
    whenToUse: 'Pour une vue rapide en ligne de commande ou à distance (/s). Le Gestionnaire des tâches reste plus confortable en local.',
    context: 'Aucun droit particulier pour ses propres processus ; administrateur pour voir les détails de tous.',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule.' }],
    bestPractices: [
      'tasklist /svc /fi "imagename eq svchost.exe" pour savoir quels services hébergent les svchost.',
      'Noter le PID avant d’utiliser taskkill.',
    ],
    commonErrors: [],
    parameters: [
      { flag: '/svc', description: 'Services hébergés par chaque processus.', riskLevel: 'none' },
      { flag: '/v', description: 'Détails : utilisateur, temps CPU, titre de fenêtre.', riskLevel: 'none' },
      { flag: '/fi "filtre"', description: 'Filtre (ex. "memusage gt 500000" en Ko).', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Un svchost consomme 2 Go de mémoire', code: 'tasklist /svc /fi "pid eq 3120"', explanation: 'Montre les services de ce processus ; on peut ensuite redémarrer le seul service fautif plutôt que la machine.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'windows-taskkill', note: 'Pour arrêter le processus identifié.' },
      { slug: 'linux-ps', note: 'Équivalent sous Linux.' },
    ],
    sources: [learn('tasklist')],
  },

  {
    slug: 'windows-taskkill', name: 'taskkill', platform: 'windows', shell: 'cmd', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Arrête un ou plusieurs processus par leur PID ou leur nom.',
    history: 'Présente depuis Windows XP Professionnel.',
    internals: 'Sans /f, taskkill envoie une demande de fermeture (comme cliquer sur la croix) que l’application peut traiter. Avec /f, il appelle TerminateProcess : arrêt immédiat, sans enregistrement.',
    syntax: 'taskkill /pid PID [/t] [/f]   |   taskkill /im nom.exe [/f]',
    why: 'Fermer une application figée sans redémarrer le poste.',
    whenToUse: 'Quand une application ne répond plus. Pour un service Windows, préférer l’arrêt du service (Stop-Service ou services.msc), qui prévient ses dépendances.',
    context: 'On peut arrêter ses propres processus ; les processus système et ceux des autres utilisateurs demandent les droits d’administrateur.',
    riskLevel: 'high',
    risks: [
      { level: 'medium', text: 'Le travail non enregistré dans l’application est perdu.' },
      { level: 'high', text: '/f sur un processus système (csrss.exe, wininit.exe, lsass.exe) provoque un écran bleu ou un redémarrage immédiat. /im arrête toutes les instances du même nom, y compris celles d’autres utilisateurs en bureau à distance.' },
    ],
    bestPractices: [
      'Cibler un PID plutôt qu’un nom.',
      'Essayer d’abord sans /f.',
      'Vérifier le PID avec tasklist juste avant.',
    ],
    commonErrors: [
      { error: 'Accès refusé', cause: 'Processus d’un autre utilisateur, ou processus protégé.', fix: 'Relancer en administrateur si c’est justifié ; un processus protégé ne doit pas être arrêté.' },
    ],
    parameters: [
      { flag: '/pid PID', description: 'Processus à arrêter.', riskLevel: 'medium' },
      { flag: '/im nom', description: 'Toutes les instances portant ce nom.', riskLevel: 'high' },
      { flag: '/t', description: 'Arrête aussi les processus enfants.', riskLevel: 'medium' },
      { flag: '/f', description: 'Force l’arrêt immédiat.', riskLevel: 'high' },
    ],
    examples: [
      { title: 'Fermer un Excel figé', code: 'tasklist /fi "imagename eq EXCEL.EXE"\ntaskkill /pid 7744', explanation: 'On cible le PID de l’instance figée ; si elle ne se ferme pas au bout de quelques secondes, on ajoute /f en sachant que les modifications non enregistrées sont perdues.', isRealCase: false },
    ],
    alternatives: [
      { slug: 'windows-tasklist', note: 'Pour identifier le bon processus avant d’agir.' },
      { slug: 'linux-kill', note: 'Équivalent sous Linux.' },
    ],
    sources: [learn('taskkill')],
  },

  {
    slug: 'windows-bcdedit', name: 'bcdedit', platform: 'windows', shell: 'cmd', difficulty: 'advanced', requiresAdmin: true,
    summary: 'Affiche et modifie la configuration de démarrage de Windows (magasin BCD).',
    history: 'Introduite avec Windows Vista, quand le fichier boot.ini a été remplacé par le magasin BCD.',
    internals: 'Le magasin BCD est une base au format registre, stockée sur la partition système EFI (\\EFI\\Microsoft\\Boot\\BCD). Le gestionnaire de démarrage le lit pour savoir quel système charger et avec quelles options.',
    syntax: 'bcdedit [/enum] [/export fichier] [/import fichier] [/set {id} option valeur]',
    why: 'Comprendre et corriger un démarrage : entrée manquante, mode sans échec bloqué, options de débogage, double démarrage.',
    whenToUse: 'En lecture (/enum) pour comprendre un démarrage. En écriture, seulement après avoir exporté le magasin et quand la réparation automatique de WinRE a échoué.',
    context: 'Invite de commandes en administrateur, ou depuis l’environnement de récupération (WinRE).',
    riskLevel: 'critical',
    risks: [
      { level: 'none', text: '/enum est en lecture seule.' },
      { level: 'high', text: 'Une option erronée (par exemple /set safeboot) peut enfermer le poste dans un mode de démarrage inattendu.' },
      { level: 'critical', text: 'Supprimer ou corrompre l’entrée {bootmgr} ou {current} rend Windows indémarrable ; seule une restauration du magasin ou une réparation depuis un support d’installation le relance.' },
    ],
    bestPractices: [
      'Toujours commencer par bcdedit /export C:\\bcd-sauvegarde.',
      'Lire avec /enum all avant toute modification.',
      'Essayer d’abord la réparation automatique du démarrage dans WinRE.',
    ],
    commonErrors: [
      { error: 'Le magasin de données de configuration de démarrage n’a pas pu être ouvert. Accès refusé.', cause: 'Invite de commandes non lancée en administrateur.', fix: 'Relancer l’invite avec « Exécuter en tant qu’administrateur ».' },
      { error: 'Le poste redémarre toujours en mode sans échec', cause: 'Option safeboot posée et jamais retirée.', fix: 'bcdedit /deletevalue {current} safeboot, puis redémarrer.' },
    ],
    parameters: [
      { flag: '/enum [all]', description: 'Liste les entrées de démarrage.', riskLevel: 'none' },
      { flag: '/export fichier', description: 'Sauvegarde le magasin.', riskLevel: 'none' },
      { flag: '/import fichier', description: 'Remplace le magasin par une sauvegarde.', riskLevel: 'high' },
      { flag: '/set {id} option valeur', description: 'Modifie une option de démarrage.', riskLevel: 'high' },
      { flag: '/delete {id}', description: 'Supprime une entrée de démarrage.', riskLevel: 'critical' },
    ],
    examples: [
      { title: 'Sortir d’un mode sans échec bloqué', code: 'bcdedit /export C:\\bcd-sauvegarde\nbcdedit /enum {current}\nbcdedit /deletevalue {current} safeboot', explanation: 'On sauvegarde, on vérifie que l’option safeboot est bien présente, puis on la retire. Les autres options ne sont pas touchées.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'windows-sfc', note: 'Quand Windows démarre mais que ses fichiers sont endommagés.' },
    ],
    sources: [learn('bcdedit')],
  },
];
