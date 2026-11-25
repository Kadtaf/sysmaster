/**
 * Partage de scripts et de labs (docs/03 §2.9, P-5). Pures.
 * Un script partagé est lu par des débutants : son niveau de risque ne peut pas être sous-estimé.
 * On reconnaît les motifs dangereux les plus courants et on relève le niveau déclaré si besoin,
 * en disant pourquoi. Ce n'est pas une analyse complète : la relecture humaine reste nécessaire.
 */

export type Risk = 'none' | 'low' | 'medium' | 'high' | 'critical';
const ORDER: Risk[] = ['none', 'low', 'medium', 'high', 'critical'];

const RULES: { level: Risk; pattern: RegExp; why: string }[] = [
  { level: 'critical', pattern: /\brm\s+(?:-\w*\s+)*-\w*[rR]\w*\s+(?:-\w+\s+)*(?:--no-preserve-root\s+)?(?:\/|\/\*|~|\$HOME)(?=\s|;|$)/m, why: 'Supprime récursivement la racine ou le dossier personnel.' },
  { level: 'critical', pattern: /\bmkfs(\.\w+)?\b/, why: 'Formate un système de fichiers : toutes ses données sont perdues.' },
  { level: 'critical', pattern: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|hd|vd|xvd|mmcblk)/, why: 'Écrit directement sur un disque : son contenu est écrasé.' },
  { level: 'critical', pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, why: 'Bombe fork : sature la machine jusqu’au blocage.' },
  { level: 'critical', pattern: /\b(Format-Volume|Clear-Disk|format\s+[a-z]:)/i, why: 'Formate ou efface un volume Windows.' },
  { level: 'critical', pattern: /\bRemove-Item\b[^\n]*-Recurse[^\n]*\s['"]?[A-Z]:\\['"]?(\s|$)/i, why: 'Supprime récursivement la racine d’un lecteur Windows.' },
  { level: 'critical', pattern: /\bDROP\s+(DATABASE|SCHEMA)\b/i, why: 'Supprime une base ou un schéma entier.' },
  { level: 'high', pattern: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/, why: 'Exécute un script téléchargé sans l’avoir lu.' },
  { level: 'high', pattern: /\b(iex|Invoke-Expression)\b[^\n]*\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString)\b/i, why: 'Exécute un script téléchargé sans l’avoir lu.' },
  { level: 'high', pattern: /\bchmod\s+(-\w*R\w*\s+)?0?777\b/, why: 'Donne tous les droits à tout le monde.' },
  { level: 'high', pattern: /\brm\s+(?:-\w+\s+)*-\w*[rR]\w*f|\brm\s+(?:-\w+\s+)*-\w*f\w*[rR]/, why: 'Suppression récursive forcée, sans confirmation.' },
  { level: 'high', pattern: /\b(DROP\s+TABLE|TRUNCATE)\b/i, why: 'Supprime ou vide une table.' },
  { level: 'high', pattern: /\bDELETE\s+FROM\s+[\w."]+\s*(;|$)/im, why: 'DELETE sans WHERE : vide toute la table.' },
  { level: 'high', pattern: /\b(iptables\s+-F|ufw\s+disable|setenforce\s+0|Set-MpPreference\b[^\n]*-Disable)/i, why: 'Désactive une protection (pare-feu, SELinux, antivirus).' },
  { level: 'medium', pattern: /\b(shutdown|reboot|poweroff|Restart-Computer|Stop-Computer)\b/i, why: 'Redémarre ou arrête la machine.' },
  { level: 'medium', pattern: /\bsystemctl\s+(stop|restart|disable|mask)\b|\bStop-Service\b/i, why: 'Arrête ou redémarre un service.' },
  { level: 'medium', pattern: /\bkill(all)?\s+-(9|KILL)\b|\bStop-Process\b[^\n]*-Force/i, why: 'Tue un processus sans lui laisser le temps de s’arrêter proprement.' },
  { level: 'low', pattern: /\bsudo\b|\bRun[Aa]s\b|-Verb\s+RunAs/, why: 'S’exécute avec les droits administrateur.' },
];

export function maxRisk(a: Risk, b: Risk): Risk {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/** Niveau minimal imposé par le code, et les raisons (une par motif reconnu). */
export function detectRisk(code: string): { level: Risk; warnings: string[] } {
  let level: Risk = 'none';
  const warnings: string[] = [];
  for (const r of RULES) {
    if (r.pattern.test(code)) {
      level = maxRisk(level, r.level);
      if (!warnings.includes(r.why)) warnings.push(r.why);
    }
  }
  return { level, warnings };
}

/** Niveau retenu : jamais en dessous de ce que le code laisse voir. */
export function effectiveRisk(declared: Risk, code: string): { level: Risk; warnings: string[]; raised: boolean } {
  const d = detectRisk(code);
  const level = maxRisk(declared, d.level);
  return { level, warnings: d.warnings, raised: level !== declared };
}

/** Rôles qui relisent les scripts (comme les fiches commandes). */
export const SCRIPT_REVIEWER_ROLES = ['reviewer', 'moderator', 'admin'] as const;

/**
 * Partage de lab : la démarche n'est visible que de ceux qui ont résolu le lab, de son auteur et
 * des modérateurs. Les autres voient le sujet, pas la solution.
 */
export function labSpoilerLocked(v: { solved: boolean; isAuthor: boolean; isModerator: boolean }): boolean {
  return !(v.solved || v.isAuthor || v.isModerator);
}
