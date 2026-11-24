"""Récupération du contexte : fiches SysMaster (API cœur) puis documentation officielle (Qdrant).

Pourquoi les fiches passent par l'API et pas par la base : le service IA ne dépend pas du schéma
interne du cœur, et profite de la recherche déjà en place (insensible aux accents, ADR-012). Elles
sont donc toujours à jour, sans réindexation.
"""

import logging
import re
from dataclasses import dataclass, replace
from typing import Literal, Protocol

import httpx

from app.rag.index import DocsIndex
from app.rag.text import STOPWORDS

log = logging.getLogger("sysmaster.ai.retriever")


@dataclass(frozen=True)
class Document:
    ref: int
    kind: Literal["kb_command", "official_doc"]
    title: str
    url: str
    slug: str | None
    text: str
    attribution: str | None = None


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


class OfficialDocsRetriever:
    def __init__(self, index: DocsIndex):
        self.index = index

    async def search(self, question: str, platform: str | None, limit: int = 3) -> list[Document]:
        passages = await self.index.search(question, platform, limit)
        return [
            Document(
                ref=i,
                kind="official_doc",
                title=f"{p.source_name} : {p.section}",
                url=p.url,
                slug=None,
                text=p.text,
                attribution=p.attribution,
            )
            for i, p in enumerate(passages, start=1)
        ]


class CompositeRetriever:
    """Fiches d'abord (pédagogie maison, relue), puis documentation officielle (référence exacte).

    Une source en panne n'empêche pas de répondre avec l'autre : la réponse sera simplement moins
    étayée, et « non vérifiée » si plus rien n'est cité.
    """

    def __init__(self, parts: list[tuple[Retriever, int]]):
        self.parts = parts

    async def search(self, question: str, platform: str | None, limit: int = 6) -> list[Document]:
        docs: list[Document] = []
        for retriever, n in self.parts:
            try:
                found = await retriever.search(question, platform, n)
            except Exception as err:  # noqa: BLE001 — une source indisponible ne doit pas bloquer la réponse
                log.warning("source de contexte indisponible (%s) : %s", type(retriever).__name__, err)
                continue
            docs += [replace(d, ref=len(docs) + i) for i, d in enumerate(found, start=1)]
        return docs[:limit]
