"""Index de la documentation officielle dans Qdrant : vecteur dense (sens) + vecteur creux (mots exacts).

Pourquoi les deux : « chkdsk /f » doit retrouver la page qui contient exactement « /f » (mots), et
« mon disque fait des erreurs » doit la retrouver aussi sans le mot « chkdsk » (sens). La fusion
RRF classe les passages bien placés dans l'une ou l'autre liste.
"""

import asyncio
import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from qdrant_client import AsyncQdrantClient
from qdrant_client import models as m

from app.rag.chunking import Chunk
from app.rag.embedder import Embedder
from app.rag.sources import SourceSpec
from app.rag.text import sparse_vector


@dataclass(frozen=True)
class Passage:
    url: str
    title: str
    section: str
    text: str
    source_name: str
    attribution: str
    platform: str


class EmbedderMismatchError(RuntimeError):
    pass


class DocsIndex:
    def __init__(self, client: AsyncQdrantClient, embedder: Embedder, collection: str = "official_docs", min_similarity: float = 0.3):
        self.client = client
        self.embedder = embedder
        self.collection = collection
        self.min_similarity = min_similarity

    async def ensure_collection(self) -> None:
        if await self.client.collection_exists(self.collection):
            info = await self.client.get_collection(self.collection)
            size = info.config.params.vectors["dense"].size
            if size != self.embedder.dim:
                raise EmbedderMismatchError(
                    f"La collection {self.collection} a des vecteurs de taille {size}, le modèle {self.embedder.name} en produit "
                    f"{self.embedder.dim}. Changer de modèle impose de réindexer : supprimez la collection puis relancez l'ingestion."
                )
            return
        await self.client.create_collection(
            self.collection,
            vectors_config={"dense": m.VectorParams(size=self.embedder.dim, distance=m.Distance.COSINE)},
            sparse_vectors_config={"sparse": m.SparseVectorParams(modifier=m.Modifier.IDF)},
        )
        for key in ("platform", "source_id", "page_url"):
            await self.client.create_payload_index(self.collection, key, m.PayloadSchemaType.KEYWORD)

    @staticmethod
    def page_hash(chunks: list[Chunk]) -> str:
        return hashlib.sha256("\x00".join(f"{c.section}\x01{c.text}" for c in chunks).encode()).hexdigest()

    async def indexed_hash(self, page_url: str) -> str | None:
        points, _ = await self.client.scroll(
            self.collection,
            scroll_filter=m.Filter(must=[m.FieldCondition(key="page_url", match=m.MatchValue(value=page_url))]),
            limit=1,
            with_payload=["page_hash"],
        )
        return points[0].payload["page_hash"] if points else None

    async def upsert_page(self, source: SourceSpec, page_url: str, chunks: list[Chunk]) -> int:
        """Remplace les passages d'une page. Renvoie le nombre de passages écrits (0 si la page n'a pas changé)."""
        digest = self.page_hash(chunks)
        if await self.indexed_hash(page_url) == digest:
            return 0
        await self.delete_page(page_url)
        if not chunks:
            return 0
        # Le titre de section aide la recherche : « Paramètres de chkdsk » vaut plus que le paragraphe seul.
        texts = [f"{c.section}\n{c.text}" for c in chunks]
        dense = await asyncio.to_thread(self.embedder.embed, texts, "passage")
        now = datetime.now(UTC).isoformat()
        points = []
        for i, (c, vec, text) in enumerate(zip(chunks, dense, texts, strict=True)):
            idx, val = sparse_vector(text)
            points.append(
                m.PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{page_url}#{i}")),
                    vector={"dense": vec, "sparse": m.SparseVector(indices=idx, values=val)},
                    payload={
                        "source_id": source.id,
                        "source_name": source.name,
                        "platform": source.platform,
                        "licence": source.licence,
                        "attribution": source.attribution,
                        "page_url": page_url,
                        "url": f"{page_url}#{c.anchor}" if c.anchor else page_url,
                        "title": c.title,
                        "section": c.section,
                        "text": c.text,
                        "page_hash": digest,
                        "embedder": self.embedder.name,
                        "indexed_at": now,
                    },
                )
            )
        await self.client.upsert(self.collection, points)
        return len(points)

    async def delete_page(self, page_url: str) -> None:
        await self.client.delete(
            self.collection,
            points_selector=m.FilterSelector(filter=m.Filter(must=[m.FieldCondition(key="page_url", match=m.MatchValue(value=page_url))])),
        )

    async def search(self, question: str, platform: str | None, limit: int = 3) -> list[Passage]:
        [dense] = await asyncio.to_thread(self.embedder.embed, [question], "query")
        idx, val = sparse_vector(question)
        where = m.Filter(must=[m.FieldCondition(key="platform", match=m.MatchAny(any=[platform, "cross_platform"]))]) if platform else None
        prefetch = [m.Prefetch(query=dense, using="dense", limit=20, filter=where, score_threshold=self.min_similarity)]
        if idx:
            prefetch.append(m.Prefetch(query=m.SparseVector(indices=idx, values=val), using="sparse", limit=20, filter=where))
        res = await self.client.query_points(self.collection, prefetch=prefetch, query=m.FusionQuery(fusion=m.Fusion.RRF), limit=limit)
        return [
            Passage(
                url=p.payload["url"],
                title=p.payload["title"],
                section=p.payload["section"],
                text=p.payload["text"],
                source_name=p.payload["source_name"],
                attribution=p.payload["attribution"],
                platform=p.payload["platform"],
            )
            for p in res.points
        ]
