"""Routage vers un profil d'agent (docs/01 §8.2).

Un seul modèle, plusieurs profils : le routeur choisit la mission (tuteur ou diagnosticien) et le
domaine d'expertise. Il est déterministe et gratuit ; un routage par modèle ne se justifiera que si
ces règles se trompent souvent (à mesurer sur les retours des utilisateurs).
"""

import re
import unicodedata
from dataclasses import dataclass


def _norm(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


PANNE = re.compile(
    r"\b(panne|erreur|plante|crash|bloque|ne (demarre|marche|fonctionne|repond)|redemarre|ecran (bleu|noir)|lent|bsod|"
    r"impossible|echec|failed|refuse|denied|freeze|gele|surchauffe|plus d.?internet|introuvable|plein|sature|no space|ne (se )?(lance|charge|connecte))\b"
)
DOMAINS = {
    "windows": re.compile(r"\b(windows|powershell|cmd|registre|bcdedit|chkdsk|sfc|dism|ipconfig|winre|event ?viewer|observateur)\b"),
    "linux": re.compile(r"\b(linux|ubuntu|debian|fedora|bash|systemd|systemctl|journalctl|chmod|chown|apt|dnf|sudo)\b"),
    "docker": re.compile(r"\b(docker|conteneur|container|image docker|compose|kubernetes|k8s)\b"),
    "network": re.compile(
        r"\b(reseaux?|dns|dhcp|ip|ping|routeurs?|paquets?|traceroute|tracert|wifi|passerelle|vpn|pare-feu|firewall|ports?)\b"
    ),
}
PLATFORM_DOMAIN = {"windows": "windows", "linux": "linux", "docker": "docker", "network": "network"}


@dataclass(frozen=True)
class Route:
    agent: str  # tutor | diagnostician
    domain: str | None


def route(question: str, platform: str | None) -> Route:
    q = _norm(question)
    agent = "diagnostician" if PANNE.search(q) else "tutor"
    domain = PLATFORM_DOMAIN.get(platform or "")
    if domain is None:
        scores = {d: len(r.findall(q)) for d, r in DOMAINS.items()}
        best = max(scores, key=lambda d: scores[d])
        domain = best if scores[best] else None
    return Route(agent, domain)
