"""Masquage des données personnelles et des secrets avant tout envoi à un modèle externe
(docs/01 §15, RGPD). Le texte collé par un administrateur contient souvent un e-mail, un mot de
passe dans une chaîne de connexion ou un jeton dans un en-tête : rien de cela n'aide à
diagnostiquer, et rien de cela ne doit quitter la plateforme.

Ce qui reste volontairement visible : adresses IP, noms d'hôtes, chemins et noms de comptes
système (root@srv01), indispensables au diagnostic et qui n'identifient pas une personne seule.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field


def _luhn(digits: str) -> bool:
    total, parity = 0, len(digits) % 2
    for i, ch in enumerate(digits):
        d = int(ch)
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _card(m: re.Match[str]) -> str:
    digits = re.sub(r"\D", "", m.group(0))
    return "[carte masquée]" if 13 <= len(digits) <= 19 and _luhn(digits) else m.group(0)


_SECRET_KEY = r"(?:password|passwd|pwd|pass|secret|client_secret|token|api[_-]?key|access[_-]?key|mot[ _]de[ _]passe|mdp)"

# Ordre important : les blocs entiers d'abord, puis les jetons, puis les motifs génériques.
_RULES: list[tuple[str, re.Pattern[str], str | Callable[[re.Match[str]], str]]] = [
    (
        "private_key",
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|\Z)", re.S),
        "[clé privée masquée]",
    ),
    ("auth_header", re.compile(r"(?i)\b(authorization\s*:\s*(?:bearer|basic|token)\s+)[^\s\"']+"), r"\1[jeton masqué]"),
    ("jwt", re.compile(r"\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}"), "[jeton masqué]"),
    (
        "api_key",
        re.compile(
            r"\b(?:sk-ant-[\w-]{10,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}"
            r"|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|AIza[\w-]{35}|glpat-[\w-]{20,})"
        ),
        "[clé masquée]",
    ),
    # postgres://user:motdepasse@hôte → le mot de passe seul disparaît.
    ("url_password", re.compile(r"\b([a-z][a-z0-9+.-]*://[^\s:/@]+:)[^\s@/]+@", re.I), r"\1[masqué]@"),
    (
        "assignment",
        re.compile(rf"(?i)(\b{_SECRET_KEY}\b[\"']?\s*[=:]\s*)(?:\"[^\"\n]*\"|'[^'\n]*'|[^\s,;\"']+)"),
        r"\1[masqué]",
    ),
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b"), "[e-mail masqué]"),
    ("iban", re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b"), "[IBAN masqué]"),
    ("card", re.compile(r"\b\d(?:[ -]?\d){12,18}\b"), _card),
    ("phone", re.compile(r"(?<![\w.])(?:\+33 ?|0)[1-9](?:[ .-]?\d{2}){4}(?![\w.])"), "[téléphone masqué]"),
]


@dataclass
class Redaction:
    text: str
    counts: dict[str, int] = field(default_factory=dict)


def redact(text: str) -> Redaction:
    counts: dict[str, int] = {}
    for name, pattern, repl in _RULES:
        hits = 0

        def count(m: re.Match[str], repl=repl) -> str:
            nonlocal hits
            out = repl(m) if callable(repl) else m.expand(repl)
            hits += out != m.group(0)  # un numéro qui échoue au test de Luhn reste tel quel
            return out

        text = pattern.sub(count, text)
        n = hits
        if n:
            counts[name] = counts.get(name, 0) + n
    return Redaction(text, counts)
