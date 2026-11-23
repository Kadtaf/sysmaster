// Fiches commandes Linux. Chaque fiche respecte P-1 : pourquoi, quand, contexte, risques,
// exemple expliqué, alternative publiée et source officielle (vérifié par les tests).
const man = (page, section = 1) => ({
  title: `${page}(${section})`,
  url: `https://man7.org/linux/man-pages/man${section}/${page}.${section}.html`,
  publisher: 'man7.org',
});

export default [
  {
    slug: 'linux-ls', name: 'ls', platform: 'linux', shell: 'bash', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Liste le contenu d’un répertoire, avec au besoin les droits, le propriétaire, la taille et la date.',
    history: 'Présente dès la première version d’Unix (1971), sous le nom hérité de la commande « list » de Multics.',
    internals: 'ls lit les entrées du répertoire (getdents) puis, en format long, appelle stat() sur chaque fichier pour obtenir droits, propriétaire, taille et dates.',
    syntax: 'ls [options] [chemin…]',
    why: 'Avant de modifier, copier ou supprimer quoi que ce soit, il faut voir ce qui est réellement là, et à qui cela appartient. La plupart des erreurs « fichier introuvable » ou « permission refusée » se comprennent en une ligne de ls -l.',
    whenToUse: 'Avant toute manipulation de fichiers, pour vérifier un chemin, un propriétaire ou des droits. Pour chercher un fichier dans une arborescence, préférez find ; pour l’espace occupé, du.',
    context: 'Tout shell POSIX. Aucun droit particulier : il faut seulement le droit de lecture (r) et de traversée (x) sur le répertoire listé.',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule : ne modifie rien.' }],
    bestPractices: [
      'Utiliser ls -la pour voir aussi les fichiers cachés (commençant par un point), souvent des fichiers de configuration.',
      'Ajouter -h pour des tailles lisibles (Ko, Mo).',
      'Ne pas analyser la sortie de ls dans un script : les noms avec espaces la cassent. Utiliser find ou une boucle sur les globs.',
    ],
    commonErrors: [
      { error: 'ls: cannot open directory: Permission denied', cause: 'Il manque le droit r (lister) ou x (traverser) sur le répertoire.', fix: 'Vérifier les droits du répertoire parent avec ls -ld chemin, puis demander l’accès ou utiliser sudo si c’est justifié.' },
    ],
    parameters: [
      { flag: '-l', description: 'Format long : type, droits, nombre de liens, propriétaire, groupe, taille, date.', riskLevel: 'none' },
      { flag: '-a', description: 'Affiche aussi les fichiers cachés, dont . et ..', riskLevel: 'none' },
      { flag: '-h', description: 'Tailles lisibles par un humain (avec -l).', riskLevel: 'none' },
      { flag: '-t', description: 'Trie par date de modification, le plus récent d’abord.', riskLevel: 'none' },
      { flag: '-d', description: 'Affiche le répertoire lui-même plutôt que son contenu (utile avec -l pour voir ses droits).', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Voir les fichiers récents d’un dossier de journaux', code: 'ls -lht /var/log | head', explanation: 'Les fichiers modifiés en dernier apparaissent en premier : c’est là que se trouve l’incident en cours.', isRealCase: true },
      { title: 'Comprendre un « Permission denied »', code: 'ls -ld /srv/app /srv/app/config.yml', explanation: 'Montre les droits du dossier et du fichier : il faut x sur le dossier pour atteindre le fichier, et r sur le fichier pour le lire.', isRealCase: false },
    ],
    alternatives: [
      { slug: 'linux-find', note: 'Pour chercher des fichiers selon leur nom, leur taille ou leur date dans toute une arborescence.' },
      { slug: 'linux-du', note: 'Pour savoir combien de place occupe un dossier.' },
    ],
    sources: [man('ls')],
  },

  {
    slug: 'linux-find', name: 'find', platform: 'linux', shell: 'bash', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Cherche des fichiers dans une arborescence selon leur nom, leur type, leur taille, leur date ou leurs droits.',
    history: 'Apparue dans Unix Version 5 (1974). La version GNU (findutils) ajoute -delete, -printf et de nombreux tests.',
    internals: 'find parcourt récursivement l’arborescence et évalue, pour chaque entrée, une expression de gauche à droite. Les actions (-print, -exec, -delete) ne s’appliquent qu’aux entrées qui satisfont les tests qui les précèdent.',
    syntax: 'find [chemin…] [tests] [actions]',
    why: 'Retrouver un fichier de configuration, les gros fichiers qui remplissent un disque ou les fichiers modifiés juste avant une panne, sans tout parcourir à la main.',
    whenToUse: 'Pour une recherche par critères (taille, date, nom). Pour lister un seul dossier, ls suffit. Pour chercher du texte dans des fichiers, utiliser grep -r.',
    context: 'Disponible partout. Les dossiers que vous ne pouvez pas lire produisent des erreurs « Permission denied » sans arrêter la recherche.',
    riskLevel: 'high',
    risks: [
      { level: 'none', text: 'Sans action, find ne fait que lister.' },
      { level: 'high', text: 'Avec -delete ou -exec rm, find supprime tout ce qui correspond, sans corbeille. Un test mal placé (par exemple -delete avant -name) supprime tout le chemin parcouru.' },
    ],
    bestPractices: [
      'Toujours lancer d’abord la même commande avec -print, relire la liste, puis seulement ajouter -delete.',
      'Placer -delete en dernier dans l’expression.',
      'Limiter la profondeur avec -maxdepth et rester sur un seul système de fichiers avec -xdev.',
      'Rediriger les erreurs de droits (2>/dev/null) seulement après avoir vérifié qu’elles ne cachent rien d’important.',
    ],
    commonErrors: [
      { error: 'find: paths must precede expression', cause: 'Un motif comme *.log non protégé a été développé par le shell avant d’arriver à find.', fix: 'Mettre le motif entre guillemets : find . -name "*.log".' },
      { error: 'Tout le dossier a disparu après un find -delete', cause: '-delete était placé avant le test -name, donc appliqué à toutes les entrées.', fix: 'Restaurer depuis la sauvegarde. À l’avenir : tester avec -print, et -delete toujours en dernier.' },
    ],
    parameters: [
      { flag: '-name motif', description: 'Nom correspondant au motif (sensible à la casse ; -iname pour l’ignorer).', riskLevel: 'none' },
      { flag: '-type f|d', description: 'Seulement les fichiers (f) ou les répertoires (d).', riskLevel: 'none' },
      { flag: '-size +100M', description: 'Fichiers de plus de 100 Mio (- pour « moins de »).', riskLevel: 'none' },
      { flag: '-mtime -1', description: 'Modifiés il y a moins d’un jour (+7 : il y a plus de 7 jours).', riskLevel: 'none' },
      { flag: '-xdev', description: 'Ne descend pas dans les autres systèmes de fichiers montés.', riskLevel: 'none' },
      { flag: '-exec cmd {} +', description: 'Exécute une commande sur les fichiers trouvés. Le risque est celui de la commande lancée.', riskLevel: 'medium' },
      { flag: '-delete', description: 'Supprime les entrées trouvées, définitivement.', riskLevel: 'high' },
    ],
    examples: [
      { title: 'Trouver ce qui remplit la partition racine', code: 'sudo find / -xdev -type f -size +500M -exec ls -lh {} + 2>/dev/null', explanation: '-xdev reste sur la partition concernée ; ls -lh affiche taille et date des gros fichiers pour décider quoi faire.', isRealCase: true },
      { title: 'Purger des journaux applicatifs de plus de 30 jours, en deux temps', code: 'find /var/log/monapp -name "*.log.gz" -mtime +30 -print\n# relire la liste, puis :\nfind /var/log/monapp -name "*.log.gz" -mtime +30 -delete', explanation: 'La première commande montre exactement ce qui serait supprimé. La seconde ne change que l’action, placée en dernier.', isRealCase: false },
    ],
    alternatives: [
      { slug: 'linux-ls', note: 'Pour regarder un seul dossier.' },
      { slug: 'linux-du', note: 'Pour trouver quel dossier occupe le plus de place, avant de chercher les fichiers.' },
    ],
    sources: [man('find')],
  },

  {
    slug: 'linux-chmod', name: 'chmod', platform: 'linux', shell: 'bash', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Modifie les droits de lecture, d’écriture et d’exécution d’un fichier ou d’un répertoire.',
    history: 'Présente depuis la première version d’Unix. La notation symbolique (u+x) a été ajoutée pour éviter de calculer les valeurs octales.',
    internals: 'chmod appelle chmod() ou fchmodat() pour réécrire le champ mode de l’inode : trois triplets rwx (propriétaire, groupe, autres) et les bits spéciaux setuid, setgid et sticky.',
    syntax: 'chmod [options] mode fichier…   (mode : u+x, g-w, o=r ou 750)',
    why: 'Les droits décident qui peut lire un secret, modifier une configuration ou lancer un script. Un script sans x ne s’exécute pas ; une clé SSH lisible par tous est refusée par ssh.',
    whenToUse: 'Pour rendre un script exécutable, protéger un fichier sensible ou corriger un « Permission denied » dont la cause est comprise. Si c’est le propriétaire qui est faux, utiliser chown.',
    context: 'Seul le propriétaire du fichier (ou root) peut en changer les droits.',
    riskLevel: 'medium',
    risks: [
      { level: 'medium', text: 'chmod 777 rend un fichier modifiable par n’importe quel utilisateur ou service compromis : porte ouverte à l’injection de code.' },
      { level: 'medium', text: 'chmod -R sur un mauvais chemin change d’un coup les droits de milliers de fichiers ; il n’existe pas d’annulation.' },
    ],
    bestPractices: [
      'Préférer la notation symbolique (u+x) qui ne touche que ce qui est demandé.',
      'Ne jamais « réparer » un problème avec 777 : chercher qui a besoin de quel droit.',
      'Clés privées et secrets : 600. Scripts : 750 ou 755. Répertoires partagés : 2770 (setgid) plutôt que 777.',
      'Avant un -R, lister ce qui sera touché avec find chemin | head.',
    ],
    commonErrors: [
      { error: 'Permissions 0644 for id_rsa are too open', cause: 'ssh refuse une clé privée lisible par d’autres que son propriétaire.', fix: 'chmod 600 ~/.ssh/id_rsa' },
      { error: 'bash: ./script.sh: Permission denied', cause: 'Le bit x manque.', fix: 'chmod u+x script.sh (ou lancer bash script.sh pour un test ponctuel).' },
    ],
    parameters: [
      { flag: 'u+x / g-w / o=', description: 'Ajoute, retire ou fixe un droit pour le propriétaire (u), le groupe (g), les autres (o).', riskLevel: 'low' },
      { flag: '750', description: 'Notation octale : 7=rwx, 5=r-x, 0=--- (propriétaire, groupe, autres).', riskLevel: 'low' },
      { flag: '-R', description: 'Récursif : s’applique à tout le contenu du répertoire.', riskLevel: 'medium' },
      { flag: '--reference=fichier', description: 'Copie les droits d’un fichier de référence.', riskLevel: 'low' },
    ],
    examples: [
      { title: 'Rendre un script exécutable par son propriétaire seulement', code: 'chmod u+x deploy.sh && ls -l deploy.sh', explanation: 'u+x n’ajoute que l’exécution pour le propriétaire ; ls -l permet de vérifier le résultat.', isRealCase: false },
      { title: 'Protéger un fichier de secrets', code: 'chmod 600 /etc/monapp/secrets.env', explanation: 'Lecture et écriture pour le propriétaire, rien pour les autres. Vérifier ensuite que le service tourne bien sous ce propriétaire.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-chown', note: 'Quand le problème vient du propriétaire ou du groupe, pas des droits.' },
    ],
    sources: [man('chmod'), { title: 'chmod(2)', url: 'https://man7.org/linux/man-pages/man2/chmod.2.html', publisher: 'man7.org' }],
  },

  {
    slug: 'linux-chown', name: 'chown', platform: 'linux', shell: 'bash', difficulty: 'intermediate', requiresAdmin: true,
    summary: 'Change le propriétaire et le groupe d’un fichier ou d’un répertoire.',
    history: 'Présente depuis les premiers Unix. Réservée à root sur Linux pour empêcher un utilisateur de contourner les quotas en « donnant » ses fichiers.',
    internals: 'chown appelle chown() ou lchown() pour réécrire l’uid et le gid de l’inode. Changer le propriétaire efface les bits setuid et setgid par sécurité.',
    syntax: 'sudo chown [options] utilisateur[:groupe] fichier…',
    why: 'Un service tourne sous un compte dédié (www-data, postgres). S’il ne possède pas ses fichiers, il ne peut ni les lire ni écrire ses journaux, et il échoue souvent avec un message peu clair.',
    whenToUse: 'Après avoir copié des fichiers en root pour un service, ou restauré une sauvegarde. Si le propriétaire est bon mais les droits insuffisants, utiliser chmod.',
    context: 'Nécessite root (sudo). Le compte et le groupe doivent exister (id nom pour vérifier).',
    riskLevel: 'high',
    risks: [
      { level: 'medium', text: 'Donner un fichier sensible à un service exposé lui permet de le modifier en cas de compromission.' },
      { level: 'high', text: 'chown -R sur / ou /usr casse sudo, ssh et de nombreux services : le système peut devenir inutilisable.' },
    ],
    bestPractices: [
      'Vérifier le chemin avec ls -ld avant un -R.',
      'Préciser le groupe explicitement (user:group) pour ne pas dépendre du comportement par défaut.',
      'Ne jamais utiliser -R sur un chemin contenant une variable non vérifiée.',
    ],
    commonErrors: [
      { error: 'chown: changing ownership: Operation not permitted', cause: 'Commande lancée sans root.', fix: 'Relancer avec sudo, si le changement est justifié.' },
      { error: 'chown: invalid user', cause: 'Le compte n’existe pas, ou une faute de frappe.', fix: 'Vérifier avec id nom ou getent passwd nom.' },
    ],
    parameters: [
      { flag: 'user:group', description: 'Nouveau propriétaire et groupe ; :group seul ne change que le groupe.', riskLevel: 'medium' },
      { flag: '-R', description: 'Récursif sur tout le contenu.', riskLevel: 'high' },
      { flag: '--from=ancien', description: 'Ne change que les fichiers appartenant à ce propriétaire : limite les dégâts d’un -R.', riskLevel: 'low' },
      { flag: '-h', description: 'Agit sur le lien symbolique lui-même, pas sur sa cible.', riskLevel: 'low' },
    ],
    examples: [
      { title: 'Rendre le dossier d’upload à son service web', code: 'ls -ld /srv/site/uploads\nsudo chown -R www-data:www-data /srv/site/uploads', explanation: 'Le service web (www-data) doit pouvoir écrire les fichiers envoyés. On vérifie le chemin avant le -R.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-chmod', note: 'Quand le propriétaire est correct mais que les droits sont insuffisants.' },
    ],
    sources: [man('chown')],
  },

  {
    slug: 'linux-ps', name: 'ps', platform: 'linux', shell: 'bash', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Affiche les processus en cours : identifiant (PID), propriétaire, consommation CPU et mémoire, commande lancée.',
    history: 'Présente depuis Unix V4. Linux accepte deux syntaxes héritées : BSD (ps aux) et System V (ps -ef).',
    internals: 'ps lit /proc/<pid>/stat, status et cmdline pour chaque processus. C’est une photographie à un instant donné, pas un suivi continu.',
    syntax: 'ps aux   |   ps -eo pid,user,%cpu,%mem,cmd --sort=-%cpu',
    why: 'Savoir ce qui tourne réellement : un service est-il lancé, sous quel compte, et qui consomme le processeur ou la mémoire ?',
    whenToUse: 'Quand une machine est lente, pour vérifier qu’un service tourne, ou trouver le PID à arrêter. Pour suivre l’évolution dans le temps, utiliser top ou htop.',
    context: 'Aucun droit particulier pour lire la liste ; certains détails des processus d’autres utilisateurs peuvent être masqués (option hidepid de /proc).',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule. Attention seulement à ne pas copier publiquement une sortie qui contiendrait des mots de passe passés en arguments.' }],
    bestPractices: [
      'Trier par consommation : ps aux --sort=-%mem | head.',
      'Pour chercher un processus, préférer pgrep -a nom à ps | grep, qui se trouve lui-même.',
    ],
    commonErrors: [],
    parameters: [
      { flag: 'aux', description: 'Tous les processus de tous les utilisateurs, avec CPU et mémoire (syntaxe BSD).', riskLevel: 'none' },
      { flag: '-ef', description: 'Tous les processus avec le PID parent (syntaxe System V), utile pour voir qui a lancé quoi.', riskLevel: 'none' },
      { flag: '-o colonnes', description: 'Choisit les colonnes affichées.', riskLevel: 'none' },
      { flag: '--sort=-%cpu', description: 'Trie par CPU décroissant.', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Les cinq processus qui consomment le plus de mémoire', code: 'ps aux --sort=-%mem | head -6', explanation: 'La colonne RSS est la mémoire physique réellement utilisée, en Kio. C’est la première chose à regarder quand le noyau tue des processus (OOM).', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-kill', note: 'Pour arrêter un processus une fois identifié.' },
      { slug: 'linux-systemctl', note: 'Pour l’état d’un service géré par systemd, avec ses derniers journaux.' },
    ],
    sources: [man('ps')],
  },

  {
    slug: 'linux-kill', name: 'kill', platform: 'linux', shell: 'bash', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Envoie un signal à un processus, le plus souvent pour lui demander de s’arrêter.',
    history: 'Présente depuis Unix V3. Le nom trompe : kill envoie n’importe quel signal, pas seulement l’arrêt.',
    internals: 'kill appelle kill(pid, signal). SIGTERM (15) demande un arrêt propre que le programme peut intercepter ; SIGKILL (9) est appliqué par le noyau, sans que le programme puisse réagir ni nettoyer.',
    syntax: 'kill [-signal] PID…',
    why: 'Arrêter un programme bloqué ou demander à un service de relire sa configuration (SIGHUP), sans redémarrer la machine.',
    whenToUse: 'Pour un processus qui n’est pas géré par systemd. Pour un service, préférer systemctl stop ou restart, qui respecte ses dépendances et le relance si nécessaire.',
    context: 'On ne peut signaler que ses propres processus ; root peut signaler tous les processus.',
    riskLevel: 'high',
    risks: [
      { level: 'medium', text: 'SIGTERM arrête le programme : les utilisateurs connectés perdent leur session.' },
      { level: 'high', text: 'SIGKILL (-9) empêche tout nettoyage : fichiers temporaires, verrous et écritures en cours peuvent rester incohérents, jusqu’à corrompre une base de données.' },
    ],
    bestPractices: [
      'Toujours essayer SIGTERM d’abord, attendre quelques secondes, et n’utiliser -9 qu’en dernier recours.',
      'Vérifier le PID avec ps -p PID -o pid,cmd juste avant : un PID peut être réutilisé par un autre programme.',
      'Ne jamais envoyer -9 à une base de données : utiliser son propre arrêt.',
    ],
    commonErrors: [
      { error: 'kill: (1234) - Operation not permitted', cause: 'Le processus appartient à un autre utilisateur.', fix: 'Vérifier le propriétaire avec ps ; utiliser sudo seulement si l’arrêt est justifié.' },
      { error: 'Le processus est toujours là après kill -9', cause: 'Il est bloqué dans le noyau (état D, souvent une entrée-sortie disque ou réseau) ou c’est un zombie (état Z) déjà mort.', fix: 'Pour D : chercher le disque ou le partage réseau en cause. Pour Z : c’est le parent qui doit le récupérer.' },
    ],
    parameters: [
      { flag: '-15 / -TERM', description: 'Demande d’arrêt propre (signal par défaut).', riskLevel: 'medium' },
      { flag: '-1 / -HUP', description: 'Beaucoup de services relisent leur configuration à la réception de ce signal.', riskLevel: 'low' },
      { flag: '-9 / -KILL', description: 'Arrêt immédiat par le noyau, sans nettoyage.', riskLevel: 'high' },
      { flag: '-l', description: 'Liste les signaux disponibles.', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Arrêter proprement un script resté bloqué', code: 'pgrep -a rapport.py\nkill 48211\nsleep 5; ps -p 48211 || echo "arrêté"', explanation: 'On identifie le PID, on demande l’arrêt, puis on vérifie. Ce n’est que si le processus est toujours là qu’on envisage -9.', isRealCase: false },
    ],
    alternatives: [
      { slug: 'linux-systemctl', note: 'Pour arrêter ou redémarrer un service : systemd gère l’ordre, les dépendances et le redémarrage.' },
      { slug: 'linux-ps', note: 'Pour identifier le bon PID avant d’agir.' },
    ],
    sources: [man('kill'), { title: 'signal(7)', url: 'https://man7.org/linux/man-pages/man7/signal.7.html', publisher: 'man7.org' }],
  },

  {
    slug: 'linux-df', name: 'df', platform: 'linux', shell: 'bash', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Affiche l’espace utilisé et disponible sur chaque système de fichiers monté.',
    history: 'Abréviation de « disk free », présente depuis Unix V1.',
    internals: 'df interroge le noyau (statfs) pour chaque point de montage. Il compte les blocs alloués, y compris ceux de fichiers supprimés mais encore ouverts par un programme.',
    syntax: 'df [-h] [-i] [chemin]',
    why: 'Un disque plein fait échouer des services sans message clair : base de données en lecture seule, journaux qui ne s’écrivent plus, mises à jour impossibles. df dit en une seconde si c’est le cas.',
    whenToUse: 'Dès qu’un service échoue de façon inexpliquée, ou qu’on voit « No space left on device ». Pour savoir quel dossier occupe la place, enchaîner avec du.',
    context: 'Aucun droit particulier.',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule.' }],
    bestPractices: [
      'Regarder aussi les inodes (df -i) : un disque peut être « plein » de petits fichiers alors qu’il reste des gigaoctets.',
      'Si df et du ne sont pas d’accord, chercher les fichiers supprimés encore ouverts : sudo lsof +L1.',
      'Environ 5 % de chaque partition ext4 sont réservés à root : un utilisateur peut voir 100 % alors que root peut encore écrire.',
    ],
    commonErrors: [
      { error: 'df indique 100 % mais du ne trouve pas les fichiers', cause: 'Un fichier supprimé est encore ouvert par un processus (souvent un journal) : l’espace n’est libéré qu’à sa fermeture.', fix: 'sudo lsof +L1 pour trouver le processus, puis le redémarrer proprement.' },
    ],
    parameters: [
      { flag: '-h', description: 'Tailles lisibles (Go, Mo).', riskLevel: 'none' },
      { flag: '-i', description: 'Affiche les inodes au lieu des blocs.', riskLevel: 'none' },
      { flag: '-T', description: 'Affiche le type de système de fichiers (ext4, xfs, tmpfs…).', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Un service PostgreSQL refuse d’écrire', code: 'df -h /var/lib/postgresql\ndf -i /var/lib/postgresql', explanation: 'On vérifie la partition qui contient les données, en blocs puis en inodes. Si elle est pleine, du dira quoi nettoyer.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-du', note: 'Pour trouver quel dossier occupe la place une fois la partition pleine identifiée.' },
    ],
    sources: [man('df')],
  },

  {
    slug: 'linux-du', name: 'du', platform: 'linux', shell: 'bash', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Calcule l’espace disque occupé par des fichiers et des dossiers.',
    history: 'Abréviation de « disk usage », présente depuis Unix V1.',
    internals: 'du parcourt l’arborescence et additionne les blocs réellement alloués à chaque fichier (stat), ce qui peut différer de la taille apparente pour les fichiers creux.',
    syntax: 'du [-sh] [--max-depth=N] chemin…',
    why: 'Après df, qui dit quelle partition est pleine, du dit quel dossier est responsable. On peut alors nettoyer la vraie cause au lieu de supprimer au hasard.',
    whenToUse: 'Pour descendre dossier par dossier jusqu’à la source d’un disque plein. Pour l’état global des partitions, df.',
    context: 'Il faut le droit de lire les dossiers parcourus : utilisez sudo pour les dossiers système, sinon les totaux seront sous-estimés.',
    riskLevel: 'low',
    risks: [
      { level: 'none', text: 'Lecture seule.' },
      { level: 'low', text: 'Sur une très grosse arborescence ou un partage réseau, du peut charger fortement les disques pendant plusieurs minutes.' },
    ],
    bestPractices: [
      'Descendre niveau par niveau : du -h --max-depth=1 /var | sort -h.',
      'Ajouter -x pour ne pas compter les autres partitions montées dans le dossier.',
    ],
    commonErrors: [],
    parameters: [
      { flag: '-s', description: 'Un seul total par argument.', riskLevel: 'none' },
      { flag: '-h', description: 'Tailles lisibles.', riskLevel: 'none' },
      { flag: '--max-depth=1', description: 'Un total par sous-dossier direct.', riskLevel: 'none' },
      { flag: '-x', description: 'Reste sur le même système de fichiers.', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Trouver le dossier qui remplit /var', code: 'sudo du -xh --max-depth=1 /var | sort -h | tail', explanation: 'Les plus gros dossiers apparaissent en bas. On recommence sur le plus gros jusqu’à trouver la cause, souvent des journaux ou un cache.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-df', note: 'Pour savoir d’abord quelle partition est pleine.' },
      { slug: 'linux-find', note: 'Pour lister directement les plus gros fichiers.' },
    ],
    sources: [man('du')],
  },

  {
    slug: 'linux-ip', name: 'ip', platform: 'linux', shell: 'bash', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Affiche et modifie la configuration réseau : interfaces, adresses, routes et voisins.',
    history: 'Fait partie d’iproute2 (1999), qui remplace ifconfig et route, devenus obsolètes car ils ne voient pas toutes les fonctions du noyau.',
    internals: 'ip dialogue avec le noyau par netlink. Les modifications sont immédiates mais non persistantes : elles disparaissent au redémarrage, la configuration durable étant gérée par NetworkManager, systemd-networkd ou netplan.',
    syntax: 'ip [-br] [-c] address|link|route [show|add|del] …',
    why: 'Un problème réseau commence par trois questions : l’interface est-elle active, a-t-elle une adresse, et par où part le trafic ? ip y répond.',
    whenToUse: 'En lecture, pour tout diagnostic réseau. En écriture, pour un essai temporaire ; la configuration permanente se fait dans l’outil de la distribution.',
    context: 'La lecture ne demande aucun droit ; toute modification demande root.',
    riskLevel: 'high',
    risks: [
      { level: 'none', text: 'Les commandes show sont en lecture seule.' },
      { level: 'high', text: 'ip link set down, ip addr del ou ip route del sur l’interface par laquelle vous êtes connecté coupent votre session SSH : il faut alors un accès console.' },
    ],
    bestPractices: [
      'Utiliser -br (brief) et -c (couleurs) pour une vue lisible.',
      'Avant une modification à distance, programmer un retour arrière (par exemple avec at ou une commande sleep suivie de la restauration).',
      'Rendre une modification permanente dans l’outil de la distribution, pas dans un script de démarrage.',
    ],
    commonErrors: [
      { error: 'RTNETLINK answers: Operation not permitted', cause: 'Modification lancée sans root.', fix: 'Relancer avec sudo si la modification est voulue.' },
      { error: 'La configuration a disparu après redémarrage', cause: 'Les changements faits avec ip sont temporaires.', fix: 'Les reporter dans NetworkManager (nmcli), netplan ou systemd-networkd.' },
    ],
    parameters: [
      { flag: '-br a', description: 'Une ligne par interface : état et adresses.', riskLevel: 'none' },
      { flag: 'route', description: 'Table de routage ; la ligne default indique la passerelle.', riskLevel: 'none' },
      { flag: 'route get 1.1.1.1', description: 'Par quelle interface et quelle passerelle partirait un paquet vers cette adresse.', riskLevel: 'none' },
      { flag: 'link set dev X down', description: 'Désactive une interface.', riskLevel: 'high' },
      { flag: 'addr add/del', description: 'Ajoute ou retire une adresse (temporaire).', riskLevel: 'high' },
    ],
    examples: [
      { title: 'Le serveur ne joint plus Internet', code: 'ip -br a\nip route\nip route get 1.1.1.1', explanation: 'On vérifie dans l’ordre : interface UP avec une adresse, présence d’une route par défaut, puis le chemin réellement choisi.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-ss', note: 'Pour voir les connexions et les ports en écoute, pas la configuration des interfaces.' },
      { slug: 'linux-dig', note: 'Quand le réseau fonctionne mais que les noms ne se résolvent pas.' },
    ],
    sources: [{ title: 'ip(8)', url: 'https://man7.org/linux/man-pages/man8/ip.8.html', publisher: 'man7.org' }],
  },

  {
    slug: 'linux-ss', name: 'ss', platform: 'linux', shell: 'bash', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Liste les sockets : ports en écoute et connexions établies, avec le processus associé.',
    history: 'Fait partie d’iproute2 et remplace netstat, plus lent sur les serveurs très chargés.',
    internals: 'ss interroge le noyau par netlink (sock_diag) au lieu de lire /proc/net/tcp, ce qui reste rapide même avec des dizaines de milliers de connexions.',
    syntax: 'ss [-t] [-u] [-l] [-n] [-p] [filtre]',
    why: 'Répondre à « mon service écoute-t-il vraiment ? », « sur quelle adresse ? » et « qui occupe déjà ce port ? ».',
    whenToUse: 'Quand un service ne répond pas, qu’un démarrage échoue avec « Address already in use », ou pour compter les connexions vers une base.',
    context: 'Lecture sans droit ; l’option -p (processus) ne montre ceux des autres utilisateurs qu’avec sudo.',
    riskLevel: 'low',
    risks: [
      { level: 'none', text: 'Lecture seule.' },
      { level: 'low', text: 'L’option -K ferme des connexions : à ne pas utiliser sans raison précise.' },
    ],
    bestPractices: [
      'La combinaison la plus utile : sudo ss -tlnp (TCP, en écoute, numérique, processus).',
      'Regarder l’adresse d’écoute : 127.0.0.1 n’est joignable que localement, 0.0.0.0 ou [::] depuis l’extérieur.',
    ],
    commonErrors: [
      { error: 'Le service écoute mais reste injoignable depuis un autre poste', cause: 'Il écoute sur 127.0.0.1, ou un pare-feu bloque le port.', fix: 'Changer l’adresse d’écoute dans sa configuration, ou ouvrir le port dans le pare-feu (ufw, firewalld).' },
    ],
    parameters: [
      { flag: '-t / -u', description: 'TCP / UDP.', riskLevel: 'none' },
      { flag: '-l', description: 'Seulement les sockets en écoute.', riskLevel: 'none' },
      { flag: '-n', description: 'Adresses et ports en chiffres, sans résolution de noms (plus rapide et sans ambiguïté).', riskLevel: 'none' },
      { flag: '-p', description: 'Processus propriétaire de chaque socket.', riskLevel: 'none' },
      { flag: '-K', description: 'Ferme les sockets correspondant au filtre (root).', riskLevel: 'low' },
    ],
    examples: [
      { title: '« Address already in use » au démarrage de nginx', code: 'sudo ss -tlnp \'sport = :80\'', explanation: 'Montre quel processus occupe déjà le port 80 (souvent une autre instance ou Apache).', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-ip', note: 'Pour la configuration des interfaces et des routes.' },
      { slug: 'linux-ps', note: 'Pour en savoir plus sur le processus trouvé.' },
    ],
    sources: [{ title: 'ss(8)', url: 'https://man7.org/linux/man-pages/man8/ss.8.html', publisher: 'man7.org' }],
  },

  {
    slug: 'linux-dig', name: 'dig', platform: 'linux', shell: 'bash', difficulty: 'intermediate', requiresAdmin: false,
    summary: 'Interroge des serveurs DNS et affiche leur réponse détaillée.',
    history: 'Fourni avec BIND (Internet Systems Consortium). « Domain Information Groper ».',
    internals: 'dig envoie une requête DNS (UDP 53, ou TCP si la réponse est trop longue) et affiche la réponse brute : code de retour, enregistrements, durée de validité (TTL) et serveur qui a répondu.',
    syntax: 'dig [@serveur] nom [type] [+short]',
    why: 'Beaucoup de « pannes réseau » sont des pannes de résolution de noms. dig sépare les deux : si dig répond mais que l’application échoue, le problème est ailleurs.',
    whenToUse: 'Quand un site « ne marche pas » alors que l’adresse IP répond, après un changement d’enregistrement DNS, ou pour comparer deux serveurs DNS.',
    context: 'Paquet dnsutils (Debian, Ubuntu) ou bind-utils (Red Hat). Aucun droit particulier.',
    riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule.' }],
    bestPractices: [
      'Comparer le résolveur local et un résolveur public : dig nom puis dig @1.1.1.1 nom.',
      'Lire le statut : NXDOMAIN (le nom n’existe pas) n’a pas la même cause que SERVFAIL (le serveur n’a pas pu répondre).',
      'Après une modification, regarder le TTL : il indique combien de temps les caches garderont l’ancienne valeur.',
    ],
    commonErrors: [
      { error: 'dig: command not found', cause: 'Paquet non installé.', fix: 'sudo apt install dnsutils (ou dnf install bind-utils).' },
    ],
    parameters: [
      { flag: '@serveur', description: 'Interroge ce serveur au lieu du résolveur configuré.', riskLevel: 'none' },
      { flag: 'A / AAAA / MX / TXT', description: 'Type d’enregistrement demandé.', riskLevel: 'none' },
      { flag: '+short', description: 'Seulement la réponse.', riskLevel: 'none' },
      { flag: '+trace', description: 'Suit la résolution depuis les serveurs racine : montre où elle casse.', riskLevel: 'none' },
    ],
    examples: [
      { title: 'Le site répond par son IP mais pas par son nom', code: 'dig intranet.exemple.fr\ndig @1.1.1.1 intranet.exemple.fr', explanation: 'Si le résolveur interne répond et pas le public, c’est un nom interne normal. Si aucun ne répond, l’enregistrement manque.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-ip', note: 'Quand même les adresses IP ne répondent pas : le problème est sous le DNS.' },
      { slug: 'windows-nslookup', note: 'Équivalent disponible sous Windows.' },
    ],
    sources: [{ title: 'dig(1)', url: 'https://bind9.readthedocs.io/en/latest/manpages.html#dig-dns-lookup-utility', publisher: 'ISC' }],
  },

  {
    slug: 'linux-tar', name: 'tar', platform: 'linux', shell: 'bash', difficulty: 'beginner', requiresAdmin: false,
    summary: 'Regroupe des fichiers dans une archive (souvent compressée) ou en extrait le contenu.',
    history: '« Tape ARchiver » : créé en 1979 pour écrire sur bande magnétique. Toujours le format standard de distribution sous Unix.',
    internals: 'tar concatène les fichiers avec un en-tête par fichier (nom, droits, propriétaire, dates). La compression (gzip, xz, zstd) est appliquée au flux complet.',
    syntax: 'tar -czf archive.tar.gz chemin…   |   tar -xzf archive.tar.gz -C destination',
    why: 'Sauvegarder une configuration avant de la modifier, ou déplacer une arborescence en conservant droits et propriétaires.',
    whenToUse: 'Avant toute modification importante d’un dossier de configuration, ou pour transférer un ensemble de fichiers. Pour une vraie stratégie de sauvegarde (incrémentale, chiffrée), utiliser un outil dédié.',
    context: 'Aucun droit particulier, sauf pour lire des fichiers système ou restaurer les propriétaires d’origine (root).',
    riskLevel: 'medium',
    risks: [
      { level: 'low', text: 'Créer une archive lit seulement les fichiers.' },
      { level: 'medium', text: 'Extraire écrase sans prévenir les fichiers de même nom dans la destination. Une archive venue d’ailleurs peut contenir des chemins inattendus.' },
    ],
    bestPractices: [
      'Lister le contenu avant d’extraire : tar -tzf archive.tar.gz | head.',
      'Toujours extraire dans un dossier vide choisi avec -C.',
      'Dater les archives de sauvegarde : config-$(date +%F).tar.gz.',
    ],
    commonErrors: [
      { error: 'tar: Removing leading `/\' from member names', cause: 'Message normal : tar enregistre des chemins relatifs pour ne pas écraser le système à l’extraction.', fix: 'Rien à faire ; extraire avec -C / seulement si c’est vraiment voulu.' },
    ],
    parameters: [
      { flag: '-c / -x / -t', description: 'Créer, extraire ou lister.', riskLevel: 'medium' },
      { flag: '-z / -J / --zstd', description: 'Compression gzip, xz ou zstd.', riskLevel: 'none' },
      { flag: '-f fichier', description: 'Nom de l’archive (obligatoire en pratique).', riskLevel: 'none' },
      { flag: '-C dossier', description: 'Se place dans ce dossier avant d’agir.', riskLevel: 'low' },
      { flag: '-p', description: 'Conserve les droits exacts à l’extraction.', riskLevel: 'low' },
    ],
    examples: [
      { title: 'Sauvegarder la configuration nginx avant de la modifier', code: 'sudo tar -czf ~/nginx-$(date +%F).tar.gz /etc/nginx\ntar -tzf ~/nginx-$(date +%F).tar.gz | head', explanation: 'Une archive datée permet de revenir en arrière en une commande ; la liste vérifie qu’elle contient bien les fichiers.', isRealCase: true },
    ],
    alternatives: [
      { slug: 'linux-find', note: 'Pour sélectionner précisément les fichiers à archiver (find … -print0 | tar --null -T -).' },
    ],
    sources: [{ title: 'GNU tar manual', url: 'https://www.gnu.org/software/tar/manual/tar.html', publisher: 'GNU' }],
  },
];
