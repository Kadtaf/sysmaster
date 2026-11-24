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

export default [diskFull, portTaken];
