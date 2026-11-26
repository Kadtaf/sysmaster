// Banques de questions des examens de certification.
// Source de vérité : infra/scripts/build-exam-seed.mjs en tire db/seeds/012_banques_examens.sql.
//
// Format d'une question :
//   key          identifiant stable et lisible (sert à calculer l'UUID ; ne jamais le changer)
//   id           (facultatif) UUID imposé, pour les questions créées avant ce fichier
//   difficulty   beginner | intermediate | advanced | expert
//   type         single (une seule bonne réponse) | multiple (au moins deux)
//   prompt       énoncé (Markdown)
//   choices      quatre propositions ; on les écrit dans n'importe quel ordre
//   answer       lettres des bonnes réponses dans l'ordre d'écriture (a = première proposition)
//   explanation  pourquoi la réponse est juste ET pourquoi les autres ne le sont pas
//
// Le générateur mélange les propositions (ordre fixe, déduit de `key`) : la bonne réponse
// n'est jamais toujours à la même place, et le seed reste identique d'un build à l'autre.
// Ces questions sont publiées relues (reviewed = true) : la relecture humaine est celle de la
// pull request qui les ajoute ou les modifie.
import cyber from './exam-banks/cyber.mjs';
import devops from './exam-banks/devops.mjs';
import docker from './exam-banks/docker.mjs';
import kubernetes from './exam-banks/kubernetes.mjs';
import linuxExpert from './exam-banks/linux-expert.mjs';
import linux from './exam-banks/linux.mjs';
import network from './exam-banks/network.mjs';
import postgresql from './exam-banks/postgresql.mjs';
import windowsAdmin from './exam-banks/windows-admin.mjs';
import windowsTech from './exam-banks/windows-tech.mjs';

/** Banques par plateforme. Une certification tire dans les plateformes de son `exam_platforms`. */
export const banks = {
  linux: [...linux, ...linuxExpert],
  network,
  docker,
  security: cyber,
  windows: [...windowsTech, ...windowsAdmin],
  devops,
  kubernetes,
  postgresql,
};

/**
 * Réglages d'examen : nombre de questions, durée en secondes, et niveaux tirés (`difficulties`,
 * vide = tous). Les niveaux séparent deux certifications d'une même plateforme : Windows
 * Technician tire le poste de travail, Windows Administrator le serveur (plus l'intermédiaire) ;
 * de même pour Linux Administrator et Linux Server Expert.
 * `platforms` reprend exam_platforms (seed 008) : le générateur vérifie que la banque suffit.
 */
export const exams = {
  'LINUX-ADMIN': { platforms: ['linux'], questionCount: 10, timeLimitS: 1200, difficulties: ['beginner', 'intermediate'] },
  'LINUX-EXPERT': { platforms: ['linux'], questionCount: 20, timeLimitS: 1800, difficulties: ['advanced', 'expert'] },
  'NET-SPEC': { platforms: ['network'], questionCount: 15, timeLimitS: 1500, difficulties: [] },
  'DOCKER-SPEC': { platforms: ['docker'], questionCount: 15, timeLimitS: 1500, difficulties: [] },
  'CYBER-SPEC': { platforms: ['security'], questionCount: 15, timeLimitS: 1500, difficulties: [] },
  'WIN-TECH': { platforms: ['windows'], questionCount: 15, timeLimitS: 1500, difficulties: ['beginner', 'intermediate'] },
  'WIN-ADMIN': { platforms: ['windows'], questionCount: 20, timeLimitS: 1800, difficulties: ['intermediate', 'advanced', 'expert'] },
  'DEVOPS-SPEC': { platforms: ['devops', 'kubernetes'], questionCount: 20, timeLimitS: 1800, difficulties: [] },
  'PG-SPEC': { platforms: ['postgresql'], questionCount: 20, timeLimitS: 1800, difficulties: [] },
  // Synthèse : uniquement les questions avancées et expertes des trois plateformes.
  'SYSMASTER-EXPERT': { platforms: ['windows', 'linux', 'network'], questionCount: 40, timeLimitS: 3600, difficulties: ['advanced', 'expert'] },
};

