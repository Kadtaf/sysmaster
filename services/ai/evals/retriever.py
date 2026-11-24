"""Recherche hors ligne sur l'instantané des fiches (evals/fixtures/kb.json).

Approximation volontairement simple de la recherche plein texte de l'API (mots communs, sans
accents) : elle rend l'évaluation rejouable sans base ni réseau. Pour mesurer la vraie recherche,
lancer l'évaluation avec --core-url.
"""

import json
import re
import unicodedata
from pathlib import Path

from app.rag.retriever import Document, _render_command, keywords

KB = Path(__file__).parent / "fixtures" / "kb.json"


def _words(text: str) -> set[str]:
    flat = "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))
    return {w for w in re.findall(r"[\w\-]+", flat) if len(w) >= 3}


class SnapshotRetriever:
    def __init__(self, path: Path = KB):
        self.commands = json.loads(path.read_text(encoding="utf-8"))

    async def search(self, question: str, platform: str | None, limit: int = 4) -> list[Document]:
        query = _words(keywords(question).replace(" or ", " "))
        scored = []
        for c in self.commands:
            if platform and c["platform"] != platform:
                continue
            name = _words(c["name"])
            body = _words(" ".join(str(c.get(k) or "") for k in ("summary", "why", "whenToUse")))
            score = 3 * len(query & name) + len(query & body)
            if score:
                scored.append((score, c["slug"], c))
        scored.sort(key=lambda x: (-x[0], x[1]))
        return [
            Document(
                ref=i,
                kind="kb_command",
                title=f"Fiche SysMaster : {c['name']}",
                url=f"/commandes/{c['slug']}",
                slug=c["slug"],
                text=_render_command(c),
            )
            for i, (_, _, c) in enumerate(scored[:limit], start=1)
        ]
