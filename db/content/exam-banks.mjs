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
import docker from './exam-banks/docker.mjs';
import linux from './exam-banks/linux.mjs';
import network from './exam-banks/network.mjs';

/** Banques par plateforme. Une certification tire dans les plateformes de son `exam_platforms`. */
export const banks = { linux, network, docker, security: cyber };

/** Réglages d'examen des certifications dont la banque est prête (nombre de questions, durée en secondes). */
export const exams = {
  'LINUX-ADMIN': { questionCount: 10, timeLimitS: 1200 },
  'NET-SPEC': { questionCount: 15, timeLimitS: 1500 },
  'DOCKER-SPEC': { questionCount: 15, timeLimitS: 1500 },
  'CYBER-SPEC': { questionCount: 15, timeLimitS: 1500 },
};
