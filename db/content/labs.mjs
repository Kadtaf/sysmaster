// Labs simulés (runtime « simulation ») : la machine est un état JSON que l'API transforme à
// chaque commande (apps/api/src/modules/labs/domain). Rien ne s'exécute réellement.
//
// Chaque lab décrit la machine DÉJÀ en panne, les validateurs qui définissent « réparé »,
// des indices progressifs et l'explication montrée après la réussite.

const G = 1024 ** 3;
const M = 1024 ** 2;

const at = (hhmmss) => `nov. 24 ${hhmmss} web01`;

/** Arborescence commune d'un petit serveur web Debian. */
function baseDirs(extra = []) {
  return [
    '/etc', '/etc/nginx', '/etc/nginx/sites-enabled', '/home', '/root', '/tmp', '/usr', '/var',
    '/var/log', '/var/log/nginx', '/var/lib', '/var/www', '/var/www/html', ...extra,
  ];
}

const nginxConf = `user www-data;
worker_processes auto;
events { worker_connections 768; }
http {
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;
    include /etc/nginx/sites-enabled/*;
}
`;

const siteConf = `server {
    listen 80 default_server;
    root /var/www/html;
    index index.html;
}
`;

const syslogTail = `Nov 24 08:58:02 web01 kernel: Linux version 6.1.0-27-amd64
Nov 24 08:58:05 web01 systemd[1]: Reached target multi-user.target.
Nov 24 08:59:10 web01 CRON[612]: (root) CMD (command -v debian-sa1 > /dev/null && debian-sa1 1 1)
`;

const diskFull = {
  slug: 'linux-disque-plein-nginx',
  title: 'Le site ne répond plus : disque plein',
  category: 'linux',
  difficulty: 'beginner',
  ttlMinutes: 60,
  briefMd: `Le site vitrine hébergé sur **web01** ne répond plus depuis ce matin. L'équipe a déjà tenté
de relancer nginx, sans succès.

Vous êtes connecté en root sur la machine. Trouvez la cause, corrigez-la **sans perdre les
journaux système** dont l'équipe sécurité a besoin, et remettez le site en ligne.

> Machine simulée : tapez \`help\` pour voir les commandes disponibles.`,
  objectives: [
    'Lire l’état et le journal d’un service avec systemctl et journalctl',
    'Relier une erreur « No space left on device » à un système de fichiers plein',
    'Trouver ce qui occupe l’espace avec du, et libérer la place sans effacer à l’aveugle',
  ],
  hints: [
    'Commencez par demander à systemd pourquoi nginx est arrêté : systemctl status nginx.',
    'Le journal parle de « No space left on device ». Quel système de fichiers porte /var/log/nginx ? Regardez df -h.',
    'Cherchez ce qui remplit /var/log : du -sh /var/log/* (puis descendez dans le dossier le plus gros).',
    'Videz le journal de débogage oublié avec truncate -s 0 plutôt que d’effacer /var/log, puis relancez nginx.',
  ],
  solutionMd: `**Cause** : un journal de débogage de l'application (\`/var/log/app/debug.log\`, 1,9 Go)
a rempli la partition \`/var\`. nginx doit écrire dans \`/var/log/nginx\` en démarrant : il échoue avec
\`No space left on device\`.

**Démarche** : \`systemctl status nginx\` → l'erreur d'écriture ; \`df -h\` → \`/var\` à 100 % ;
\`du -sh /var/log/*\` → \`app\` occupe presque tout ; \`truncate -s 0 /var/log/app/debug.log\` libère la place
sans casser le processus qui écrit encore dans ce fichier ; \`systemctl restart nginx\`.

**Pourquoi pas \`rm -rf /var/log/*\`** : vous perdriez les journaux système (\`syslog\`, \`auth.log\`),
indispensables pour comprendre un incident ou une intrusion. Et un fichier supprimé mais encore
ouvert par un processus continue d'occuper le disque tant que le processus vit.

**Pour que ça ne revienne pas** : désactiver le mode débogage en production et confier
\`/var/log/app\` à logrotate (rotation, compression, nombre de fichiers gardés).`,
  machine: {
    hostname: 'web01',
    cwd: '/root',
    clock: '2026-11-24T09:12:00.000Z',
    nextPid: 1312,
    dirs: baseDirs(['/var/log/app']),
    files: {
      '/etc/nginx/nginx.conf': { size: nginxConf.length, content: nginxConf },
      '/etc/nginx/sites-enabled/default': { size: siteConf.length, content: siteConf },
      '/var/www/html/index.html': { size: 612, content: '<h1>Bienvenue sur web01</h1>\n' },
      '/var/log/syslog': { size: 38 * M, content: syslogTail },
      '/var/log/auth.log': { size: 6 * M, content: 'Nov 24 09:01:44 web01 sshd[702]: Accepted publickey for root from 10.0.0.12 port 51122 ssh2\n' },
      '/var/log/nginx/access.log': { size: 21 * M, content: '10.0.0.40 - - [24/Nov/2026:08:59:58 +0000] "GET / HTTP/1.1" 200 612\n' },
      '/var/log/nginx/error.log': { size: 2048, content: '2026/11/24 09:00:03 [crit] 734#734: *1 write() to "/var/log/nginx/access.log" failed (28: No space left on device)\n' },
      '/var/log/app/debug.log': {
        size: Math.round(1.9 * G),
        content: '2026-11-24 09:11:59.998 DEBUG cache: miss key=session:7f3a\n2026-11-24 09:11:59.999 DEBUG cache: miss key=session:7f3b\n',
      },
    },
    mounts: [
      { target: '/', device: '/dev/sda1', sizeBytes: 20 * G, baseUsedBytes: Math.round(6.2 * G) },
      { target: '/var', device: '/dev/sda2', sizeBytes: 2 * G, baseUsedBytes: 30 * M },
    ],
    services: {
      nginx: {
        description: 'A high performance web server and a reverse proxy server',
        active: 'failed',
        enabled: true,
        process: 'nginx',
        ports: [80],
        writes: '/var/log/nginx/access.log',
        needsFiles: ['/etc/nginx/nginx.conf'],
        journal: [
          `${at('09:00:03')} systemd[1]: nginx.service: Main process exited, code=exited, status=1/FAILURE`,
          `${at('09:05:41')} systemd[1]: Starting nginx.service - A high performance web server and a reverse proxy server...`,
          `${at('09:05:41')} nginx[1288]: nginx: [emerg] write() to "/var/log/nginx/access.log" failed (28: No space left on device)`,
          `${at('09:05:41')} systemd[1]: nginx.service: Failed with result 'exit-code'.`,
          `${at('09:05:41')} systemd[1]: Failed to start nginx.service - A high performance web server and a reverse proxy server.`,
        ],
      },
      ssh: {
        description: 'OpenBSD Secure Shell server',
        active: 'active',
        enabled: true,
        process: 'sshd',
        pid: 702,
        ports: [22],
        journal: [`${at('08:58:04')} systemd[1]: Started ssh.service - OpenBSD Secure Shell server.`],
      },
    },
  },
  validators: [
    { description: 'nginx est démarré', check: { kind: 'service_active', service: 'nginx' } },
    { description: 'La partition /var est sous 90 % d’occupation', check: { kind: 'disk_usage_below', mount: '/var', percent: 90 } },
    { description: 'Les journaux système sont conservés (/var/log/syslog)', check: { kind: 'path_exists', path: '/var/log/syslog', expected: true } },
    { description: 'Le journal d’authentification est conservé (/var/log/auth.log)', check: { kind: 'path_exists', path: '/var/log/auth.log', expected: true } },
  ],
  walkthrough: [
    'systemctl status nginx',
    'df -h',
    'du -sh /var/log/*',
    'truncate -s 0 /var/log/app/debug.log',
    'systemctl restart nginx',
  ],
};

const portTaken = {
  slug: 'linux-port-80-occupe',
  title: 'nginx refuse de démarrer : port 80 déjà pris',
  category: 'linux',
  difficulty: 'intermediate',
  ttlMinutes: 60,
  briefMd: `Après une mise à jour faite hier soir par un stagiaire, **web01** affiche une page
« Apache2 Debian Default Page » au lieu du site. nginx, qui doit servir le site, est arrêté.

Remettez nginx en service, et faites en sorte que le problème **ne revienne pas au prochain
redémarrage** de la machine.

> Machine simulée : tapez \`help\` pour voir les commandes disponibles.`,
  objectives: [
    'Interpréter « Address already in use » dans un journal',
    'Trouver quel processus écoute un port avec ss -tlnp',
    'Distinguer arrêter un service (stop) et l’empêcher de redémarrer au boot (disable)',
  ],
  hints: [
    'Que dit le journal de nginx au dernier démarrage ? journalctl -u nginx -n 20.',
    '« Address already in use » : un autre programme écoute déjà le port 80. ss -tlnp vous dit lequel.',
    'Arrêter apache2 libère le port maintenant ; pensez aussi à ce qui se passera au prochain démarrage (systemctl disable).',
  ],
  solutionMd: `**Cause** : le paquet \`apache2\` a été installé (dépendance d'un autre paquet) ; son service
démarre automatiquement et écoute le port 80. nginx, lancé ensuite, ne peut plus s'y attacher :
\`bind() to 0.0.0.0:80 failed (98: Address already in use)\`.

**Démarche** : \`journalctl -u nginx\` → l'erreur de bind ; \`ss -tlnp\` → \`apache2\` sur :80 ;
\`systemctl stop apache2\` libère le port ; \`systemctl disable apache2\` empêche son retour au boot ;
\`systemctl start nginx\`.

**À retenir** : \`stop\` agit maintenant, \`disable\` agit au prochain démarrage. Il faut souvent les deux
(ou \`systemctl disable --now\`). Si apache2 n'a rien à faire là, le désinstaller est encore plus propre.`,
  machine: {
    hostname: 'web01',
    cwd: '/root',
    clock: '2026-11-24T09:12:00.000Z',
    nextPid: 1402,
    dirs: baseDirs(['/etc/apache2', '/var/log/apache2']),
    files: {
      '/etc/nginx/nginx.conf': { size: nginxConf.length, content: nginxConf },
      '/etc/nginx/sites-enabled/default': { size: siteConf.length, content: siteConf },
      '/etc/apache2/ports.conf': { size: 10, content: 'Listen 80\n' },
      '/var/www/html/index.html': { size: 10918, content: '<title>Apache2 Debian Default Page: It works</title>\n' },
      '/var/log/syslog': { size: 12 * M, content: syslogTail },
      '/var/log/auth.log': { size: 2 * M, content: '' },
      '/var/log/apache2/access.log': { size: 4096, content: '10.0.0.40 - - [24/Nov/2026:09:01:12 +0000] "GET / HTTP/1.1" 200 10918\n' },
      '/var/log/nginx/error.log': { size: 512, content: '2026/11/24 08:58:06 [emerg] 655#655: bind() to 0.0.0.0:80 failed (98: Address already in use)\n' },
    },
    mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 20 * G, baseUsedBytes: Math.round(6.4 * G) }],
    services: {
      nginx: {
        description: 'A high performance web server and a reverse proxy server',
        active: 'failed',
        enabled: true,
        process: 'nginx',
        ports: [80],
        writes: '/var/log/nginx/access.log',
        needsFiles: ['/etc/nginx/nginx.conf'],
        journal: [
          `${at('08:58:06')} systemd[1]: Starting nginx.service - A high performance web server and a reverse proxy server...`,
          `${at('08:58:06')} nginx[655]: nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)`,
          `${at('08:58:06')} nginx[655]: nginx: [emerg] still could not bind()`,
          `${at('08:58:06')} systemd[1]: nginx.service: Failed with result 'exit-code'.`,
          `${at('08:58:06')} systemd[1]: Failed to start nginx.service - A high performance web server and a reverse proxy server.`,
        ],
      },
      apache2: {
        description: 'The Apache HTTP Server',
        active: 'active',
        enabled: true,
        process: 'apache2',
        pid: 611,
        ports: [80],
        journal: [`${at('08:58:05')} systemd[1]: Started apache2.service - The Apache HTTP Server.`],
      },
      ssh: {
        description: 'OpenBSD Secure Shell server',
        active: 'active',
        enabled: true,
        process: 'sshd',
        pid: 702,
        ports: [22],
        journal: [`${at('08:58:04')} systemd[1]: Started ssh.service - OpenBSD Secure Shell server.`],
      },
    },
  },
  validators: [
    { description: 'nginx est démarré', check: { kind: 'service_active', service: 'nginx' } },
    { description: 'nginx redémarrera avec la machine', check: { kind: 'service_enabled', service: 'nginx', expected: true } },
    { description: 'apache2 ne redémarrera pas avec la machine', check: { kind: 'service_enabled', service: 'apache2', expected: false } },
  ],
  walkthrough: [
    'journalctl -u nginx -n 20',
    'ss -tlnp | grep :80',
    'systemctl stop apache2',
    'systemctl disable apache2',
    'systemctl start nginx',
  ],
};

// ---------------------------------------------------------------- Réseau ----
const DEBIAN = '151.101.2.132';
const debianHttp = { status: 200, body: '<html><head><title>Debian -- Mirror</title></head><body>deb.debian.org</body></html>' };

/** Machine d'un serveur applicatif sans service web : le réseau est le sujet. */
function netMachine({ hostname, files, network }) {
  return {
    hostname,
    cwd: '/root',
    clock: '2026-11-24T10:20:00.000Z',
    nextPid: 2100,
    dirs: ['/etc', '/etc/network', '/home', '/root', '/tmp', '/usr', '/var', '/var/log'],
    files: {
      '/etc/hosts': { size: 60, content: '127.0.0.1\tlocalhost\n127.0.1.1\t' + hostname + '\n' },
      '/var/log/syslog': { size: 4 * M, content: syslogTail.replaceAll('web01', hostname) },
      ...files,
    },
    mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 20 * G, baseUsedBytes: Math.round(4.1 * G) }],
    services: {
      ssh: {
        description: 'OpenBSD Secure Shell server', active: 'active', enabled: true, process: 'sshd', pid: 702, ports: [22],
        journal: [`nov. 24 08:58:04 ${hostname} systemd[1]: Started ssh.service - OpenBSD Secure Shell server.`],
      },
    },
    network,
  };
}

const dnsInterne = {
  slug: 'reseau-dns-interne',
  title: 'Plus aucun nom ne se résout après la migration DNS',
  category: 'network',
  difficulty: 'beginner',
  ttlMinutes: 45,
  briefMd: `Depuis ce matin, **app02** ne parvient plus à télécharger ses mises à jour depuis le dépôt interne
\`depot.exemple.fr\` : « Could not resolve host ». Pourtant, l'équipe réseau affirme que le réseau fonctionne.

Trouvez pourquoi les noms ne se résolvent plus, corrigez la configuration, et vérifiez que le dépôt répond.

> Machine simulée : tapez \`help\` pour voir les commandes disponibles. Un ticket de l'équipe réseau est dans \`/root\`.`,
  objectives: [
    'Séparer un problème de résolution de noms d’un problème de connectivité',
    'Lire /etc/resolv.conf et interroger un serveur DNS précis avec dig @serveur',
    'Comprendre pourquoi un DNS public ne connaît pas les noms internes',
  ],
  hints: [
    'Le réseau marche-t-il ? Essayez ping vers une adresse IP (la passerelle 10.0.0.1), sans nom.',
    'Quel serveur DNS la machine interroge-t-elle ? cat /etc/resolv.conf, puis dig depot.exemple.fr.',
    'Le ticket dans /root donne le nouveau serveur. Testez-le d’abord : dig @10.0.0.2 depot.exemple.fr.',
    'Remplacez le serveur dans /etc/resolv.conf : echo \'nameserver 10.0.0.2\' > /etc/resolv.conf.',
  ],
  solutionMd: `**Cause** : \`/etc/resolv.conf\` pointe encore vers l'ancien serveur DNS \`10.0.0.53\`, arrêté
lors de la migration. Chaque résolution attend sa réponse en vain : « Temporary failure in name resolution ».

**Démarche** : \`ping 10.0.0.1\` répond → le réseau va bien, c'est la **résolution** qui échoue ;
\`cat /etc/resolv.conf\` → \`nameserver 10.0.0.53\` ; \`dig depot.exemple.fr\` → « no servers could be reached » ;
le ticket donne le nouveau serveur ; \`dig @10.0.0.2 depot.exemple.fr\` le valide **avant** de modifier quoi que ce soit ;
puis \`echo 'nameserver 10.0.0.2' > /etc/resolv.conf\`.

**Pourquoi pas 1.1.1.1** : un DNS public résout \`deb.debian.org\` mais ignore tout de \`depot.exemple.fr\`,
qui n'existe que dans la zone interne. Le symptôme changerait (NXDOMAIN au lieu d'un délai), sans être réglé.

**Pour que ça ne revienne pas** : sur une machine gérée par DHCP, netplan ou systemd-resolved, \`/etc/resolv.conf\`
est régénéré. La correction durable se fait dans la source (bail DHCP, fichier netplan, \`resolvectl\`).`,
  machine: netMachine({
    hostname: 'app02',
    files: {
      '/etc/resolv.conf': { size: 52, content: "# Généré lors de l'installation\nnameserver 10.0.0.53\n" },
      '/etc/network/interfaces': { size: 90, content: 'auto eth0\niface eth0 inet static\n    address 10.0.0.15/24\n    gateway 10.0.0.1\n' },
      '/root/ticket-1287.txt': {
        size: 260,
        content: "Ticket 1287 — Migration DNS (équipe réseau)\nL'ancien serveur DNS 10.0.0.53 est arrêté depuis le 20/11.\nLe serveur DNS interne est désormais 10.0.0.2 : il résout les noms internes (*.exemple.fr) et publics.\n",
      },
    },
    network: {
      interfaces: [{ name: 'eth0', address: '10.0.0.15/24', up: true, mac: '52:54:00:3a:1f:02' }],
      routes: [{ destination: 'default', via: '10.0.0.1', dev: 'eth0' }],
      hosts: {
        '10.0.0.1': { label: 'routeur', respondsToPing: true },
        '10.0.0.2': {
          label: 'DNS interne', respondsToPing: true,
          dns: { 'depot.exemple.fr': '10.0.0.80', 'intranet.exemple.fr': '10.0.0.81', 'deb.debian.org': DEBIAN },
        },
        '10.0.0.80': { label: 'dépôt interne', respondsToPing: true, http: { status: 200, body: '<html><body><h1>Index of /paquets</h1></body></html>' } },
        '1.1.1.1': { label: 'DNS public', respondsToPing: true, dns: { 'deb.debian.org': DEBIAN } },
        [DEBIAN]: { label: 'miroir Debian', respondsToPing: true, http: debianHttp },
      },
    },
  }),
  validators: [
    { description: 'depot.exemple.fr se résout', check: { kind: 'name_resolves', name: 'depot.exemple.fr' } },
    { description: 'Le dépôt interne répond', check: { kind: 'host_reachable', target: 'depot.exemple.fr' } },
    { description: 'L’ancien serveur DNS n’est plus interrogé', check: { kind: 'file_has_line', path: '/etc/resolv.conf', line: 'nameserver 10.0.0.53', expected: false } },
  ],
  walkthrough: [
    'curl https://depot.exemple.fr',
    'ping -c 1 10.0.0.1',
    'cat /etc/resolv.conf',
    'dig depot.exemple.fr',
    'cat /root/ticket-1287.txt',
    'dig @10.0.0.2 depot.exemple.fr',
    "echo 'nameserver 10.0.0.2' > /etc/resolv.conf",
    'curl https://depot.exemple.fr',
  ],
};

const defaultRoute = {
  slug: 'reseau-route-par-defaut',
  title: 'Le réseau local répond, Internet non',
  category: 'network',
  difficulty: 'intermediate',
  ttlMinutes: 45,
  briefMd: `Après une maintenance faite hier par un collègue, **app03** joint toujours les machines du réseau
local, mais plus rien au-delà : les mises à jour depuis \`deb.debian.org\` échouent.

Rétablissez l'accès à Internet, et faites en sorte que la correction **survive au prochain redémarrage**.

> Machine simulée : tapez \`help\` pour voir les commandes disponibles.`,
  objectives: [
    'Lire une table de routage avec ip route',
    'Distinguer « Network is unreachable » (pas de route) d’un délai dépassé (pas de réponse)',
    'Corriger à chaud avec ip route, puis rendre la correction persistante',
  ],
  hints: [
    'Le nom deb.debian.org se résout-il ? Et que dit exactement l’erreur de curl ou de ping vers 1.1.1.1 ?',
    '« Network is unreachable » veut dire « aucune route ». Regardez ip route : où partent les paquets vers Internet ?',
    'La passerelle est dans /etc/network/interfaces. Ajoutez la route à chaud : ip route add default via 10.0.0.1.',
    'Pour le prochain démarrage, décommentez la ligne gateway : sed -i \'s/#    gateway/    gateway/\' /etc/network/interfaces.',
  ],
  solutionMd: `**Cause** : la ligne \`gateway 10.0.0.1\` a été commentée dans \`/etc/network/interfaces\` pendant la
maintenance, puis l'interface a été relancée. La machine n'a plus de **route par défaut** : elle ne sait joindre que
son propre réseau \`10.0.0.0/24\`.

**Démarche** : la résolution fonctionne (le DNS interne est sur le réseau local), mais \`curl\` et \`ping 1.1.1.1\`
répondent « Network is unreachable » : le noyau n'a aucune route. \`ip route\` ne montre que \`10.0.0.0/24\`.
\`ip route add default via 10.0.0.1\` rétablit l'accès **tout de suite** ; décommenter \`gateway\` dans
\`/etc/network/interfaces\` le rend **durable**.

**À retenir** : « Network is unreachable » (pas de route) n'est pas un délai dépassé (la route existe, la réponse
ne revient pas). Une correction faite avec \`ip\` disparaît au redémarrage : il faut toujours reporter le changement
dans la configuration.`,
  machine: netMachine({
    hostname: 'app03',
    files: {
      '/etc/resolv.conf': { size: 20, content: 'nameserver 10.0.0.2\n' },
      '/etc/network/interfaces': {
        size: 120,
        content: '# Interface principale\nauto eth0\niface eth0 inet static\n    address 10.0.0.16/24\n#    gateway 10.0.0.1\n',
      },
    },
    network: {
      interfaces: [{ name: 'eth0', address: '10.0.0.16/24', up: true, mac: '52:54:00:3a:1f:03' }],
      routes: [],
      hosts: {
        '10.0.0.1': { label: 'routeur', respondsToPing: true },
        '10.0.0.2': { label: 'DNS interne', respondsToPing: true, dns: { 'deb.debian.org': DEBIAN, 'depot.exemple.fr': '10.0.0.80' } },
        '10.0.0.80': { label: 'dépôt interne', respondsToPing: true, http: { status: 200, body: '<html><body><h1>Index of /paquets</h1></body></html>' } },
        '1.1.1.1': { label: 'DNS public', respondsToPing: true, dns: { 'deb.debian.org': DEBIAN } },
        [DEBIAN]: { label: 'miroir Debian', respondsToPing: true, http: debianHttp },
      },
    },
  }),
  validators: [
    { description: 'Internet répond (1.1.1.1)', check: { kind: 'host_reachable', target: '1.1.1.1' } },
    { description: 'deb.debian.org est joignable', check: { kind: 'host_reachable', target: 'deb.debian.org' } },
    { description: 'La passerelle est configurée pour le prochain démarrage', check: { kind: 'file_has_line', path: '/etc/network/interfaces', line: 'gateway 10.0.0.1', expected: true } },
  ],
  walkthrough: [
    'curl -I http://deb.debian.org',
    'ping -c 1 10.0.0.1',
    'ip route',
    'cat /etc/network/interfaces',
    'ip route add default via 10.0.0.1',
    "sed -i 's/#    gateway/    gateway/' /etc/network/interfaces",
    'ping -c 2 1.1.1.1',
  ],
};

// ---------------------------------------------------------------- Docker ----
function dockerMachine({ hostname, dirs, files, docker }) {
  return {
    hostname,
    cwd: '/root',
    clock: '2026-11-24T11:05:00.000Z',
    nextPid: 3100,
    dirs: ['/etc', '/home', '/root', '/srv', '/tmp', '/usr', '/var', '/var/lib', '/var/lib/docker', '/var/log', ...dirs],
    files: { '/var/log/syslog': { size: 3 * M, content: syslogTail.replaceAll('web01', hostname) }, ...files },
    mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 40 * G, baseUsedBytes: Math.round(11.3 * G) }],
    services: {
      docker: {
        description: 'Docker Application Container Engine', active: 'active', enabled: true, process: 'dockerd', pid: 811, ports: [],
        journal: [`nov. 24 08:58:07 ${hostname} systemd[1]: Started docker.service - Docker Application Container Engine.`],
      },
      ssh: {
        description: 'OpenBSD Secure Shell server', active: 'active', enabled: true, process: 'sshd', pid: 702, ports: [22],
        journal: [`nov. 24 08:58:04 ${hostname} systemd[1]: Started ssh.service - OpenBSD Secure Shell server.`],
      },
    },
    docker,
  };
}

const facturationCompose = `services:
  app:
    image: registre.exemple.fr/facturation:2.4
    restart: unless-stopped
    ports:
      - "8080:8000"
    environment:
      - DB_HOST=db.exemple.fr
      - DB_USER=facturation
      - TZ=Europe/Paris
`;

const crashLines = (t) => [
  `${t} Traceback (most recent call last):`,
  `${t}   File "/app/config.py", line 12, in <module>`,
  `${t}     DATABASE = os.environ["DATABASE_HOST"]`,
  `${t} KeyError: 'DATABASE_HOST'`,
  `${t} ERREUR : variable d'environnement obligatoire manquante : DATABASE_HOST`,
];

const dockerVariable = {
  slug: 'docker-variable-renommee',
  title: 'Le conteneur redémarre en boucle après la mise à jour',
  category: 'docker',
  difficulty: 'beginner',
  ttlMinutes: 45,
  briefMd: `L'application de facturation de **srv-app** est passée hier soir de la version 2.3 à la 2.4.
Depuis, \`http://localhost:8080\` ne répond plus et le conteneur ne cesse de redémarrer.

Remettez l'application en ligne **en version 2.4** (revenir à la 2.3 n'est pas une option : elle corrige une faille).
Le projet compose est dans \`/srv/facturation\`.

> Machine simulée : tapez \`help\` pour voir les commandes disponibles.`,
  objectives: [
    'Reconnaître une boucle de redémarrage avec docker ps et lire la cause dans docker logs',
    'Comprendre qu’un docker restart ne relit pas la configuration du fichier compose',
    'Corriger le fichier compose et recréer le conteneur avec docker compose up -d',
  ],
  hints: [
    'docker ps -a : regardez la colonne STATUS. Puis docker logs facturation-app-1 pour savoir pourquoi le programme s’arrête.',
    'Le programme réclame une variable qui n’existe pas dans le fichier compose. Une note de version (CHANGELOG) accompagne le projet.',
    'Corrigez le nom de la variable dans /srv/facturation/compose.yaml (sed -i), puis recréez le conteneur depuis ce répertoire : docker compose up -d.',
  ],
  solutionMd: `**Cause** : la version 2.4 a renommé la variable \`DB_HOST\` en \`DATABASE_HOST\` (voir \`CHANGELOG.md\`).
Le fichier compose fournit encore l'ancien nom : au démarrage, le programme ne trouve pas \`DATABASE_HOST\` et s'arrête,
et la politique \`restart: unless-stopped\` le relance aussitôt, à l'infini.

**Démarche** : \`docker ps -a\` → « Restarting » ; \`docker logs facturation-app-1\` → \`KeyError: 'DATABASE_HOST'\` ;
\`cat CHANGELOG.md\` → le renommage ; \`sed -i 's/DB_HOST=/DATABASE_HOST=/' compose.yaml\` ; \`docker compose up -d\`
(compose voit que la configuration a changé et **recrée** le conteneur) ; \`curl http://localhost:8080\`.

**Pourquoi \`docker restart\` ne suffit pas** : il relance le même conteneur, avec les variables figées à sa création.
Seule une recréation (\`docker compose up -d\`) applique le fichier modifié.

**Pour que ça ne revienne pas** : lire les notes de version avant une montée de version majeure ou mineure, et
tester la nouvelle image sur un environnement de recette.`,
  machine: dockerMachine({
    hostname: 'srv-app',
    dirs: ['/srv/facturation'],
    files: {
      '/srv/facturation/compose.yaml': { size: facturationCompose.length, content: facturationCompose },
      '/srv/facturation/CHANGELOG.md': {
        size: 400,
        content: "# Facturation — notes de version\n\n## 2.4.0 (21/11/2026)\n- Sécurité : correction d'une faille d'injection dans l'export PDF.\n- **Incompatible** : la variable `DB_HOST` est renommée `DATABASE_HOST`. L'ancien nom n'est plus lu.\n\n## 2.3.2 (02/10/2026)\n- Corrections mineures.\n",
      },
    },
    docker: {
      composeFile: '/srv/facturation/compose.yaml',
      images: {
        'registre.exemple.fr/facturation:2.4': {
          requiredEnv: ['DATABASE_HOST', 'DB_USER'],
          listens: 8000,
          startupLog: ['INFO Connexion à la base db.exemple.fr : OK', 'INFO Facturation 2.4.0 à l’écoute sur 0.0.0.0:8000'],
          http: { status: 200, body: '<html><body><h1>Facturation 2.4.0</h1></body></html>' },
        },
        'registre.exemple.fr/facturation:2.3': {
          requiredEnv: ['DB_HOST', 'DB_USER'],
          listens: 8000,
          startupLog: ['INFO Facturation 2.3.2 à l’écoute sur 0.0.0.0:8000'],
          http: { status: 200, body: '<html><body><h1>Facturation 2.3.2</h1></body></html>' },
        },
      },
      containers: {
        'facturation-app-1': {
          service: 'app',
          image: 'registre.exemple.fr/facturation:2.4',
          status: 'restarting',
          restart: 'unless-stopped',
          restartCount: 214,
          ports: [{ host: 8080, container: 8000 }],
          env: { DB_HOST: 'db.exemple.fr', DB_USER: 'facturation', TZ: 'Europe/Paris' },
          logs: [...crashLines('2026-11-24T11:04:51Z'), ...crashLines('2026-11-24T11:04:58Z')],
        },
      },
    },
  }),
  validators: [
    { description: 'Le conteneur de l’application tourne', check: { kind: 'container_running', name: 'facturation-app-1', expected: true } },
    { description: 'http://localhost:8080 répond en version 2.4', check: { kind: 'http_ok', url: 'http://localhost:8080', contains: 'Facturation 2.4' } },
  ],
  walkthrough: [
    'docker ps -a',
    'docker logs --tail 5 facturation-app-1',
    'cd /srv/facturation',
    'cat CHANGELOG.md',
    "sed -i 's/DB_HOST=/DATABASE_HOST=/' compose.yaml",
    'docker compose up -d',
    'curl http://localhost:8080',
  ],
};

const tableauCompose = `services:
  web:
    image: grafana/grafana:11.3.0
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GF_SERVER_ROOT_URL=http://srv-supervision:3000
`;

const dockerPort = {
  slug: 'docker-port-deja-alloue',
  title: 'docker compose up échoue : port déjà alloué',
  category: 'docker',
  difficulty: 'intermediate',
  ttlMinutes: 45,
  briefMd: `Sur **srv-supervision**, le tableau de bord en version 11 doit remplacer une version 10 lancée « pour tester »
il y a quelques mois. Mais \`docker compose up -d\` échoue, et \`http://localhost:3000\` affiche toujours la version 10.

Mettez la version 11 en service sur le port 3000, et assurez-vous que l'ancienne **ne reviendra pas** au prochain
redémarrage du serveur. Le projet compose est dans \`/srv/tableau\`.

> Machine simulée : tapez \`help\` pour voir les commandes disponibles.`,
  objectives: [
    'Lire « port is already allocated » et trouver quel conteneur occupe le port',
    'Distinguer un conteneur lancé à la main (docker run) d’un service compose',
    'Comprendre les politiques de redémarrage : stop n’empêche pas « always » de revenir',
  ],
  hints: [
    'Lancez docker compose up -d depuis /srv/tableau et lisez l’erreur : quel port est en cause ?',
    'docker ps montre qui publie déjà le port 3000. Ce conteneur ne fait pas partie du projet compose.',
    'docker stop libère le port, mais regardez sa politique de redémarrage (docker inspect) : que se passera-t-il au prochain démarrage ?',
    'Supprimez l’ancien conteneur (docker rm) ou retirez-lui son redémarrage automatique (docker update --restart=no), puis relancez docker compose up -d.',
  ],
  solutionMd: `**Cause** : un conteneur \`grafana-test\`, lancé à la main avec \`docker run --restart=always -p 3000:3000\`,
publie déjà le port 3000. Le conteneur du projet compose est créé mais ne peut pas démarrer :
\`Bind for 0.0.0.0:3000 failed: port is already allocated\`.

**Démarche** : \`docker compose up -d\` → l'erreur ; \`docker ps\` → \`grafana-test\` sur \`0.0.0.0:3000\` ;
\`docker inspect grafana-test\` → \`RestartPolicy: always\` ; \`docker stop grafana-test\` puis \`docker rm grafana-test\` ;
\`docker compose up -d\` ; \`curl http://localhost:3000\` → version 11.

**Le piège** : \`docker stop\` seul libère le port tout de suite, mais avec \`--restart=always\` le conteneur repart
au prochain démarrage du démon Docker, avant ou à la place du service compose. Il faut le supprimer, ou au minimum
\`docker update --restart=no grafana-test\`.

**À retenir** : un conteneur « de test » lancé à la main n'apparaît dans aucun fichier : faites l'inventaire avec
\`docker ps -a\` avant de déployer, et préférez compose pour tout ce qui doit durer.`,
  machine: dockerMachine({
    hostname: 'srv-supervision',
    dirs: ['/srv/tableau'],
    files: { '/srv/tableau/compose.yaml': { size: tableauCompose.length, content: tableauCompose } },
    docker: {
      composeFile: '/srv/tableau/compose.yaml',
      images: {
        'grafana/grafana:11.3.0': {
          listens: 3000,
          startupLog: ['logger=server level=info msg="HTTP Server Listen" address=[::]:3000 protocol=http', 'logger=server level=info msg="Grafana v11.3.0 démarré"'],
          http: { status: 200, body: '<html><head><title>Grafana</title></head><body>Grafana v11.3.0</body></html>' },
        },
        'grafana/grafana:10.0.0': {
          listens: 3000,
          startupLog: ['logger=server level=info msg="Grafana v10.0.0 démarré"'],
          http: { status: 200, body: '<html><head><title>Grafana</title></head><body>Grafana v10.0.0</body></html>' },
        },
      },
      containers: {
        'grafana-test': {
          image: 'grafana/grafana:10.0.0',
          status: 'running',
          restart: 'always',
          restartCount: 0,
          ports: [{ host: 3000, container: 3000 }],
          env: {},
          logs: ['2026-06-12T14:02:10Z logger=server level=info msg="Grafana v10.0.0 démarré"'],
        },
        'tableau-web-1': {
          service: 'web',
          image: 'grafana/grafana:11.3.0',
          status: 'created',
          restart: 'unless-stopped',
          restartCount: 0,
          ports: [{ host: 3000, container: 3000 }],
          env: { GF_SERVER_ROOT_URL: 'http://srv-supervision:3000' },
          logs: [],
        },
      },
    },
  }),
  validators: [
    { description: 'Le conteneur du projet compose tourne', check: { kind: 'container_running', name: 'tableau-web-1', expected: true } },
    { description: 'http://localhost:3000 sert la version 11', check: { kind: 'http_ok', url: 'http://localhost:3000', contains: 'v11.3.0' } },
    { description: 'L’ancien conteneur ne redémarrera pas avec le serveur', check: { kind: 'container_autostart', name: 'grafana-test', expected: false } },
  ],
  walkthrough: [
    'cd /srv/tableau',
    'docker compose up -d',
    'docker ps',
    'docker inspect grafana-test',
    'docker stop grafana-test',
    'docker rm grafana-test',
    'docker compose up -d',
    'curl http://localhost:3000',
  ],
};


// --- Cyber ------------------------------------------------------------------------------

/** Machine d'un serveur exposé à Internet, avec pare-feu ufw. */
function secMachine({ hostname, dirs = [], files, services = {}, firewall }) {
  return {
    hostname,
    cwd: '/root',
    clock: '2026-11-24T09:40:00.000Z',
    nextPid: 4100,
    dirs: ['/etc', '/etc/ssh', '/home', '/root', '/tmp', '/usr', '/var', '/var/log', ...dirs],
    files: {
      '/var/log/syslog': { size: 2 * M, content: syslogTail.replaceAll('web01', hostname) },
      ...files,
    },
    mounts: [{ target: '/', device: '/dev/sda1', sizeBytes: 30 * G, baseUsedBytes: Math.round(6.2 * G) }],
    services: {
      ssh: {
        description: 'OpenBSD Secure Shell server', active: 'active', enabled: true, process: 'sshd', pid: 702, ports: [22],
        needsFiles: ['/etc/ssh/sshd_config'],
        journal: [`nov. 24 08:58:04 ${hostname} systemd[1]: Started ssh.service - OpenBSD Secure Shell server.`],
      },
      ...services,
    },
    ...(firewall ? { firewall } : {}),
  };
}

const ATTACKER = '203.0.113.45';
const SCANNER = '198.51.100.77';
const OFFICE = '192.0.2.10';

/** Journal d'authentification : des centaines d'échecs depuis une adresse, quelques-uns d'un scanner, l'équipe qui se connecte. */
function authLog(host) {
  const out = [];
  let port = 40112;
  const line = (t, msg) => `Nov 24 ${t} ${host} sshd[${1200 + out.length}]: ${msg}`;
  out.push(line('07:58:41', `Accepted publickey for deploy from ${OFFICE} port 52210 ssh2: ED25519 SHA256:q3Lk9vXwz`));
  for (let i = 0; i < 3; i++) out.push(line(`08:0${i}:17`, `Failed password for root from ${SCANNER} port ${port++} ssh2`));
  for (let i = 0; i < 46; i++) {
    const s = String(10 + Math.floor(i / 4)).padStart(2, '0');
    out.push(line(`09:${s}:${String((i * 13) % 60).padStart(2, '0')}`, `Failed password for root from ${ATTACKER} port ${port++} ssh2`));
  }
  out.splice(30, 0, line('09:17:02', `Accepted publickey for deploy from ${OFFICE} port 52388 ssh2: ED25519 SHA256:q3Lk9vXwz`));
  return `${out.join('\n')}\n`;
}

const sshdConfig = `# Configuration du serveur SSH — voir sshd_config(5)
Include /etc/ssh/sshd_config.d/*.conf

Port 22
PermitRootLogin yes
PasswordAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding no
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
`;

const sshBruteForce = {
  slug: 'cyber-ssh-force-brute',
  title: 'Attaque par force brute sur SSH : bloquer sans se couper l’accès',
  category: 'cyber',
  difficulty: 'intermediate',
  ttlMinutes: 45,
  briefMd: `La supervision de **bastion01** signale depuis 9 h 10 un pic de connexions SSH refusées. Le serveur héberge
aussi le site public (ports 80 et 443).

Bloquez l'adresse qui attaque, **sans couper l'accès de l'équipe** (le bureau sort par \`${OFFICE}\`) ni le site
public, et faites en sorte que plus personne ne puisse se connecter **directement en root** par SSH.

> Machine simulée : tapez \`help\` pour voir les commandes disponibles. Le pare-feu est ufw.`,
  objectives: [
    'Lire /var/log/auth.log et compter les échecs par adresse (grep, cut, sort, uniq -c)',
    'Comprendre que ufw applique la première règle qui correspond, dans l’ordre',
    'Durcir SSH (PermitRootLogin no) et recharger le service sans perdre la main',
  ],
  hints: [
    'Les tentatives SSH sont dans /var/log/auth.log. Cherchez les lignes « Failed password ».',
    'Comptez par adresse : grep "Failed password" /var/log/auth.log | cut -d\' \' -f11 | sort | uniq -c',
    'ufw deny from … ajoute la règle À LA FIN : regardez ufw status numbered. Une règle « allow 22 » placée avant laisse encore passer l’attaquant.',
    'ufw insert 1 deny from 203.0.113.45 place l’interdiction en tête. Puis corrigez PermitRootLogin dans /etc/ssh/sshd_config et redémarrez ssh.',
  ],
  solutionMd: `**Constat** : \`/var/log/auth.log\` contient 46 échecs de mot de passe sur \`root\` depuis \`${ATTACKER}\` en quelques
minutes, plus 3 essais isolés d'un scanner (\`${SCANNER}\`). L'équipe (\`${OFFICE}\`) se connecte par clé, sans échec.

**Démarche** : \`grep "Failed password" /var/log/auth.log | cut -d' ' -f11 | sort | uniq -c\` ; \`ufw status numbered\` montre
\`allow 22\` en règle 1 ; \`ufw insert 1 deny from ${ATTACKER}\` ; \`ufw status numbered\` pour vérifier l'ordre ;
\`sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config\` ; \`systemctl restart ssh\`.

**Le piège** : \`ufw deny from ${ATTACKER}\` répond « Rule added »… mais ajoute la règle en dernière position. ufw
s'arrête à la **première** règle qui correspond : \`22/tcp ALLOW Anywhere\` laisse encore passer l'attaquant.
Autre piège : \`ufw default deny\` combiné à la suppression de « allow 22 » coupe aussi l'équipe, et vous avec.

**Pour aller plus loin** : bloquer une adresse ne fait que déplacer le problème (l'attaquant en changera).
La vraie protection est \`PasswordAuthentication no\` (clés uniquement, ce que l'équipe utilise déjà), complétée
par fail2ban qui bannit automatiquement après quelques échecs, et un accès SSH réservé au réseau du bureau.`,
  machine: secMachine({
    hostname: 'bastion01',
    dirs: ['/etc/ssh/sshd_config.d', '/etc/ufw', '/var/www', '/var/www/html'],
    files: {
      '/var/log/auth.log': { size: 18 * 1024, content: authLog('bastion01'), mode: '640', group: 'adm' },
      '/etc/ssh/sshd_config': { size: sshdConfig.length, content: sshdConfig },
      '/var/www/html/index.html': { size: 320, content: '<html><body><h1>Exemple SARL</h1></body></html>\n' },
    },
    services: {
      nginx: {
        description: 'A high performance web server and a reverse proxy server', active: 'active', enabled: true,
        process: 'nginx', pid: 731, ports: [80, 443],
        journal: ['nov. 24 08:58:05 bastion01 systemd[1]: Started nginx.service - A high performance web server and a reverse proxy server.'],
      },
    },
    firewall: {
      active: true,
      defaultIncoming: 'deny',
      rules: [
        { action: 'allow', port: 22 },
        { action: 'allow', port: 80 },
        { action: 'allow', port: 443 },
      ],
    },
  }),
  validators: [
    { description: `L’adresse ${ATTACKER} ne peut plus joindre SSH`, check: { kind: 'firewall_allows', from: ATTACKER, port: 22, expected: false } },
    { description: `L’équipe (${OFFICE}) peut toujours se connecter en SSH`, check: { kind: 'firewall_allows', from: OFFICE, port: 22, expected: true } },
    { description: 'Le site public reste joignable (port 443)', check: { kind: 'firewall_allows', from: '192.0.2.200', port: 443, expected: true } },
    { description: 'La connexion directe en root par SSH est interdite', check: { kind: 'file_has_line', path: '/etc/ssh/sshd_config', line: 'PermitRootLogin no', expected: true } },
    { description: 'Le service SSH tourne', check: { kind: 'service_active', service: 'ssh' } },
  ],
  walkthrough: [
    'tail -n 5 /var/log/auth.log',
    'grep "Failed password" /var/log/auth.log | cut -d\' \' -f11 | sort | uniq -c',
    'ufw status numbered',
    `ufw insert 1 deny from ${ATTACKER}`,
    'ufw status numbered',
    "sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config",
    'systemctl restart ssh',
    'systemctl status ssh',
  ],
};

const boutiqueEnv = `APP_ENV=production
APP_URL=https://boutique.exemple.fr
DB_HOST=10.0.3.20
DB_NAME=boutique
DB_USER=boutique
DB_PASSWORD=Tr0ub4dor-boutique-2026
MAIL_DSN=smtp://relais.exemple.fr:25
`;

const etcGroup = `root:x:0:
adm:x:4:syslog
www-data:x:33:
users:x:100:
deploy:x:1001:
stagiaire:x:1002:
`;

const secretsReadable = {
  slug: 'cyber-secrets-lisibles',
  title: 'Audit : mot de passe et clé lisibles par tous les comptes',
  category: 'cyber',
  difficulty: 'beginner',
  ttlMinutes: 40,
  briefMd: `Un audit interne de **app04**, qui fait tourner la boutique en ligne (PHP-FPM sous le compte \`www-data\`),
relève trois points :

1. le fichier de configuration de la boutique, qui contient le mot de passe de la base, est lisible par **tous** les comptes du serveur (dont \`stagiaire\`) ;
2. une sauvegarde de la base traîne dans le dossier public du site, donc téléchargeable par n'importe qui ;
3. la clé SSH privée du compte \`deploy\` est lisible par tous.

Corrigez les trois points **sans casser la boutique**. Le code est dans \`/var/www/boutique\`.

> Machine simulée : tapez \`help\` pour voir les commandes disponibles.`,
  objectives: [
    'Lire des droits Unix (ls -l, stat) : propriétaire, groupe, autres',
    'Choisir le bon mode (640, 600) selon QUI doit lire le fichier',
    'Vérifier qu’un service démarre encore après un durcissement',
  ],
  hints: [
    'ls -la /var/www/boutique : regardez les trois derniers caractères des droits de .env, ceux des « autres ».',
    'PHP-FPM lit .env sous le compte www-data. Le fichier appartient à root, groupe www-data : qui doit garder la lecture ?',
    'chmod 640 garde la lecture au groupe www-data et la retire aux autres. Un chmod 600 la retirerait aussi à www-data.',
    'La sauvegarde est dans /var/www/boutique/public : supprimez-la. La clé privée doit être en 600. Redémarrez php8.2-fpm pour vérifier.',
  ],
  solutionMd: `**Constat** : \`.env\` est en \`644\` (\`-rw-r--r--\`) : propriétaire root, groupe www-data, et **lecture pour tous**.
N'importe quel compte (ou un script compromis sous un autre compte) lit \`DB_PASSWORD\`. La sauvegarde SQL est sous
\`public/\`, servi tel quel par nginx. La clé \`id_ed25519\` est en \`644\` : tout compte local peut se faire passer pour \`deploy\`.

**Démarche** : \`ls -la /var/www/boutique\` ; \`stat -c '%a %U:%G %n' /var/www/boutique/.env\` ;
\`chmod 640 /var/www/boutique/.env\` (root écrit, www-data lit, les autres rien) ;
\`rm /var/www/boutique/public/backup-2026-11-20.sql\` ; \`chmod 600 /home/deploy/.ssh/id_ed25519\` ;
\`systemctl restart php8.2-fpm\` pour vérifier que la boutique lit toujours sa configuration.

**Le piège** : \`chmod 600 .env\` paraît plus sûr, mais le fichier appartient à root : www-data ne peut plus le lire
et PHP-FPM échoue au redémarrage (\`Permission denied\`). Le bon mode dépend de **qui** doit lire, pas d'un réflexe.
Pour la clé, c'est l'inverse : seul son propriétaire doit la lire, d'où \`600\` (ssh refuse d'ailleurs une clé trop ouverte).

**Pour la suite** : le mot de passe a été exposé : faites-le changer côté base. Placez les sauvegardes hors du
dossier servi par le web, et vérifiez régulièrement avec \`find / -perm -o+r -name "*.env"\` sur un vrai serveur.`,
  machine: secMachine({
    hostname: 'app04',
    dirs: ['/var/www', '/var/www/boutique', '/var/www/boutique/public', '/var/www/boutique/src', '/home/deploy', '/home/deploy/.ssh', '/home/stagiaire', '/etc/php', '/run', '/run/php'],
    files: {
      '/etc/group': { size: etcGroup.length, content: etcGroup },
      '/var/www/boutique/.env': { size: boutiqueEnv.length, content: boutiqueEnv, mode: '644', owner: 'root', group: 'www-data' },
      '/var/www/boutique/composer.json': { size: 412, content: '{\n  "name": "exemple/boutique",\n  "require": { "php": "^8.2" }\n}\n' },
      '/var/www/boutique/src/Kernel.php': { size: 2380, content: '<?php\n// Charge la configuration depuis ../.env\n' },
      '/var/www/boutique/public/index.php': { size: 640, content: "<?php\nrequire __DIR__ . '/../src/Kernel.php';\n" },
      '/var/www/boutique/public/backup-2026-11-20.sql': { size: 48 * M, mode: '644', owner: 'deploy', group: 'deploy' },
      '/home/deploy/.ssh/id_ed25519': { size: 411, content: '-----BEGIN OPENSSH PRIVATE KEY-----\n[clé privée simulée]\n-----END OPENSSH PRIVATE KEY-----\n', mode: '644', owner: 'deploy', group: 'deploy' },
      '/home/deploy/.ssh/id_ed25519.pub': { size: 98, content: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleCleePublique deploy@app04\n', mode: '644', owner: 'deploy', group: 'deploy' },
      '/home/deploy/.ssh/authorized_keys': { size: 98, content: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleCleePublique deploy@poste\n', mode: '600', owner: 'deploy', group: 'deploy' },
    },
    services: {
      nginx: {
        description: 'A high performance web server and a reverse proxy server', active: 'active', enabled: true,
        process: 'nginx', pid: 731, ports: [80, 443],
        journal: ['nov. 24 08:58:05 app04 systemd[1]: Started nginx.service - A high performance web server and a reverse proxy server.'],
      },
      'php8.2-fpm': {
        description: 'The PHP 8.2 FastCGI Process Manager', active: 'active', enabled: true,
        process: 'php-fpm', pid: 744, ports: [9000], user: 'www-data',
        needsFiles: ['/var/www/boutique/.env'],
        journal: ['nov. 24 08:58:06 app04 systemd[1]: Started php8.2-fpm.service - The PHP 8.2 FastCGI Process Manager.'],
      },
    },
  }),
  validators: [
    { description: 'La boutique (www-data) peut lire sa configuration', check: { kind: 'file_readable_by', path: '/var/www/boutique/.env', user: 'www-data', expected: true } },
    { description: 'Les autres comptes ne lisent plus la configuration', check: { kind: 'file_readable_by', path: '/var/www/boutique/.env', user: 'stagiaire', expected: false } },
    { description: 'La sauvegarde n’est plus dans le dossier public', check: { kind: 'path_exists', path: '/var/www/boutique/public/backup-2026-11-20.sql', expected: false } },
    { description: 'La clé privée n’est accessible qu’à son propriétaire', check: { kind: 'file_mode_at_most', path: '/home/deploy/.ssh/id_ed25519', mode: '600' } },
    { description: 'Le compte deploy peut toujours utiliser sa clé', check: { kind: 'file_readable_by', path: '/home/deploy/.ssh/id_ed25519', user: 'deploy', expected: true } },
    { description: 'PHP-FPM tourne', check: { kind: 'service_active', service: 'php8.2-fpm' } },
  ],
  walkthrough: [
    'ls -la /var/www/boutique',
    "stat -c '%a %U:%G %n' /var/www/boutique/.env",
    'chmod 640 /var/www/boutique/.env',
    'ls -l /var/www/boutique/public',
    'rm /var/www/boutique/public/backup-2026-11-20.sql',
    'ls -l /home/deploy/.ssh',
    'chmod 600 /home/deploy/.ssh/id_ed25519',
    'systemctl restart php8.2-fpm',
    'systemctl status php8.2-fpm',
  ],
};

export default [diskFull, portTaken, dnsInterne, defaultRoute, dockerVariable, dockerPort, sshBruteForce, secretsReadable];
