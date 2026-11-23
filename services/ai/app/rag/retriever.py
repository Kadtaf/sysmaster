"""Récupération du contexte (RAG v0) : les fiches commandes publiées, via l'API cœur.

Pourquoi l'API et pas la base : le service IA ne dépend pas du schéma interne du cœur, et
profite de la recherche déjà en place (insensible aux accents, ADR-012). La recherche hybride
sur la documentation officielle (Qdrant) arrive dans une PR suivante, derrière ce même port.
"""

import re
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx


@dataclass(frozen=True)
class Document:
    ref: int
    kind: Literal["kb_command"]
    title: str
    url: str
    slug: str | None
    text: str


class Retriever(Protocol):
    async def search(self, question: str, platform: str | None, limit: int = 4) -> list[Document]: ...


def _render_command(c: dict) -> str:
    risks = "; ".join(f"{r['level']} : {r['text']}" for r in c.get("risks", []))
    params = "; ".join(f"{p['flag']} ({p['riskLevel']}) : {p['description']}" for p in c.get("parameters", [])[:8])
    examples = "\n".join(f"- {e['title']} : `{e['code']}` — {e['explanation']}" for e in c.get("examples", [])[:3])
    return (
        f"Commande : {c['name']} ({c['platform']}) — niveau de risque {c['riskLevel']}\n"
        f"Utilité : {c['summary']}\nSyntaxe : {c['syntax']}\nPourquoi : {c['why']}\nQuand : {c['whenToUse']}\n"
        f"Contexte : {c.get('context') or ''}\nRisques : {risks}\nParamètres : {params}\nExemples :\n{examples}"
    )


STOPWORDS = set(
    (
        "avec dans pour sans sous vers chez entre comment pourquoi quand quoi quel quelle quels quelles est sont etre "
        "avoir fait faire mon mes ton tes son ses notre votre leur leurs cette ces celui celle plus moins tres tout "
        "tous toute toutes peux peut veux dois doit fois alors donc mais aussi encore depuis apres avant elle elles "
        "nous vous ils une des les aux par sur que qui the and what how why "
    ).split()
)


def keywords(question: str) -> str:
    """Question libre → requête « mot1 or mot2… » : la recherche plein texte exige sinon tous les mots."""
    words = [w for w in re.findall(r"[\w\-./]+", question.lower()) if len(w) >= 3 and w not in STOPWORDS]
    return " or ".join(dict.fromkeys(words))[:500]


class CoreApiRetriever:
    def __init__(self, base_url: str, public_url: str = "/commandes", client: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.public_url = public_url
        self.client = client or httpx.AsyncClient(timeout=5.0)

    async def search(self, question: str, platform: str | None, limit: int = 4) -> list[Document]:
        query = keywords(question)
        if not query:
            return []
        params = {"q": query}
        if platform:
            params["platform"] = platform
        res = await self.client.get(f"{self.base_url}/kb/commands", params=params)
        res.raise_for_status()
        hits = res.json()[:limit]
        docs: list[Document] = []
        for i, hit in enumerate(hits, start=1):
            detail = await self.client.get(f"{self.base_url}/kb/commands/{hit['slug']}")
            if detail.status_code != 200:
                continue
            c = detail.json()
            docs.append(
                Document(
                    ref=i,
                    kind="kb_command",
                    title=f"Fiche SysMaster : {c['name']}",
                    url=f"{self.public_url}/{c['slug']}",
                    slug=c["slug"],
                    text=_render_command(c),
                )
            )
        return docs
