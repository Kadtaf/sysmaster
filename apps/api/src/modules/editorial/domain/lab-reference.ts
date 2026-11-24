import { HELP } from '../../labs/domain/shell';

/**
 * Ce que le générateur de labs doit savoir du simulateur : les commandes réellement interprétées et
 * les vérifications disponibles. Tiré du code (aide du shell) et tenu ici à côté des règles de
 * publication : une nouvelle vérification s'ajoute ici en même temps que dans le domaine.
 */
const CHECKS = `Vérifications (champ « check » de chaque élément de validators_json) :
- {"kind":"service_active","service":"nginx"} : le service est démarré.
- {"kind":"service_enabled","service":"nginx","expected":true} : activé (ou non) au démarrage.
- {"kind":"disk_usage_below","mount":"/","percent":90} : occupation du montage sous le seuil.
- {"kind":"path_exists","path":"/chemin","expected":false} : fichier ou répertoire présent (ou absent).
- {"kind":"file_has_line","path":"/etc/fichier","line":"texte exact","expected":true} : ligne active (non commentée) présente ou absente.
- {"kind":"host_reachable","target":"nom-ou-ip"} et {"kind":"name_resolves","name":"nom"} : exigent « network » dans la machine.
- {"kind":"container_running","name":"projet-app-1","expected":true}, {"kind":"container_autostart","name":"…","expected":false} : exigent « docker ».
- {"kind":"http_ok","url":"http://localhost:8080","contains":"texte"} : l'URL répond en 2xx (port publié par un conteneur, ou hôte du réseau simulé).
- {"kind":"file_mode_at_most","path":"/chemin","mode":"640"} : les droits n'accordent rien de plus que ce mode.
- {"kind":"file_readable_by","path":"/chemin","user":"www-data","expected":true} : lisible (ou non) par ce compte (propriétaire, groupe, /etc/group).
- {"kind":"firewall_allows","from":"203.0.113.45","port":22,"expected":false} : le pare-feu laisse passer (ou bloque) ; exige « firewall ».

Causes génériques d'échec au démarrage d'un service (aucun code à écrire) : un autre service actif écoute déjà
l'un de ses « ports » ; le montage qui porte son fichier « writes » a moins de 50 Mo libres ; un de ses
« needsFiles » est absent, ou illisible pour son compte « user ».
Fichiers : « mode » (octal, ex. "640", 644 par défaut), « owner », « group ». Un fichier sans « content » est
affiché comme des données binaires : donnez un contenu à tout ce que l'apprenant doit lire.`;

export function labReference(): string {
  return `${HELP}\n\n${CHECKS}`;
}
