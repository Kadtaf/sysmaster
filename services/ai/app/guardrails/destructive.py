"""Détection des commandes destructives, indépendante du modèle (docs/01 §8.3).

Le modèle annonce un niveau de risque ; ce module ne peut que le **relever**, jamais le baisser.
Une liste de motifs est imparfaite, mais elle est déterministe, testée et auditable, ce qu'un
modèle n'est pas.
"""

import re
from dataclasses import dataclass

from app.schemas import RISK_ORDER, RiskLevel


@dataclass(frozen=True)
class Pattern:
    name: str
    regex: re.Pattern[str]
    risk: RiskLevel


def _p(name: str, pattern: str, risk: RiskLevel) -> Pattern:
    return Pattern(name, re.compile(pattern, re.IGNORECASE | re.MULTILINE), risk)


PATTERNS: list[Pattern] = [
    _p("rm récursif forcé", r"\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r|--recursive\s+--force)\b", "critical"),
    _p("formatage de disque", r"\b(mkfs(\.\w+)?|format\s+[a-z]:)", "critical"),
    _p("écriture brute sur un disque", r"\bdd\b[^|\n]*\bof=/dev/", "critical"),
    _p("nettoyage de disque (diskpart)", r"\bdiskpart\b|^\s*clean(\s+all)?\s*$", "critical"),
    _p("suppression SQL", r"\b(drop\s+(table|database|schema)|truncate\s+table)\b", "critical"),
    _p("DELETE sans WHERE", r"\bdelete\s+from\s+\w+(\.\w+)?\s*;?\s*$", "critical"),
    _p("suppression récursive PowerShell", r"remove-item\b[^\n]*-recurse[^\n]*-force|remove-item\b[^\n]*-force[^\n]*-recurse", "high"),
    _p("suppression récursive cmd", r"\b(del|erase)\b[^\n]*/s\b|\brd\b[^\n]*/s\b|\brmdir\b[^\n]*/s\b", "high"),
    _p("modification du démarrage", r"\bbcdedit\b[^\n]*/(delete|set|deletevalue|import)\b", "high"),
    _p("suppression dans le registre", r"\breg\s+delete\b|remove-itemproperty\b", "high"),
    _p("arrêt forcé de processus", r"\bkill\s+-(9|kill)\b|\btaskkill\b[^\n]*/f\b|\bpkill\s+-9\b", "high"),
    _p("droits ouverts à tous", r"\bchmod\b[^\n]*\b777\b", "medium"),
    _p("changement récursif de propriétaire", r"\bchown\s+-r\b", "high"),
    _p("purge de volumes Docker", r"\bdocker\s+(system|volume)\s+prune\b[^\n]*(--volumes|-a)", "high"),
    _p("exécution d'un script distant", r"\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z)?sh\b|iex\s*\(\s*(iwr|invoke-webrequest)", "high"),
    _p("réinitialisation Git destructive", r"\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\s+[^\n]*--force)\b", "medium"),
]


def max_risk(a: RiskLevel, b: RiskLevel) -> RiskLevel:
    return a if RISK_ORDER.index(a) >= RISK_ORDER.index(b) else b


def classify(command: str) -> tuple[RiskLevel, list[str]]:
    """Risque minimal imposé par la commande, et noms des motifs reconnus."""
    risk: RiskLevel = "none"
    hits: list[str] = []
    for p in PATTERNS:
        if p.regex.search(command):
            risk = max_risk(risk, p.risk)
            hits.append(p.name)
    return risk, hits
