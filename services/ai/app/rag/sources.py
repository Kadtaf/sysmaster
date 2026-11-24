"""Sources officielles ingérées dans le RAG (fichier sources.toml).

Chaque source dit sous quelle licence son contenu est réutilisable et quelle attribution afficher.
Une source sans licence compatible n'entre pas dans le fichier (voir le README : pages de manuel).
"""

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "sources.toml"


@dataclass(frozen=True)
class SourceSpec:
    id: str
    name: str
    platform: str
    licence: str
    attribution: str
    seeds: list[str]
    allow: list[str]
    max_pages: int = 200
    delay_seconds: float = 1.0
    deny: list[str] = field(default_factory=list)

    def allowed(self, url: str) -> bool:
        return any(url.startswith(p) for p in self.allow) and not any(d in url for d in self.deny)


def load_sources(path: Path = DEFAULT_FILE) -> list[SourceSpec]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return [SourceSpec(**s) for s in data["source"]]
