// Contenu éditorial chargé une seule fois par le seed 006 (voir infra/scripts/build-content-seed.mjs).
// Ensuite, on le fait évoluer dans le back-office (/editorial), avec relecture : le seed ne
// réécrit jamais un contenu déjà présent, pour ne pas écraser une modification relue.
import commandsLinux from './commands-linux.mjs';
import commandsWindows from './commands-windows.mjs';
import coursesLinux from './courses-linux.mjs';
import coursesWindows from './courses-windows.mjs';

export const skills = [
  { code: 'linux.shell', name: 'Ligne de commande Linux', platform: 'linux' },
  { code: 'linux.permissions', name: 'Droits et propriétaires Linux', platform: 'linux' },
  { code: 'linux.processes', name: 'Processus et signaux Linux', platform: 'linux' },
  { code: 'linux.network', name: 'Diagnostic réseau sous Linux', platform: 'linux' },
  { code: 'linux.storage', name: 'Stockage et espace disque Linux', platform: 'linux' },
  { code: 'windows.network', name: 'Diagnostic réseau sous Windows', platform: 'windows' },
  { code: 'windows.disk', name: 'Disques et système de fichiers Windows', platform: 'windows' },
];

export const commands = [...commandsLinux, ...commandsWindows];
export const courses = [...coursesLinux, ...coursesWindows];

/** Ordre complet de chaque parcours (cours existants compris). */
export const paths = [
  { slug: 'administrateur-linux', courses: ['linux-ligne-de-commande', 'linux-systemd', 'linux-reseau', 'linux-stockage'] },
  { slug: 'technicien-informatique', courses: ['windows-fondamentaux', 'windows-reseau', 'windows-disques'] },
];
