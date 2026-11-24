from pathlib import Path

import httpx
import pytest
import respx
from qdrant_client import AsyncQdrantClient

from app.rag.chunking import chunk_html
from app.rag.crawler import Crawler
from app.rag.embedder import HashEmbedder
from app.rag.index import DocsIndex, EmbedderMismatchError
from app.rag.ingest import ingest_source
from app.rag.retriever import CompositeRetriever, Document, OfficialDocsRetriever
from app.rag.sources import SourceSpec, load_sources
from app.rag.text import sparse_vector, tokens

HTML = (Path(__file__).parent / "fixtures" / "chkdsk.html").read_text(encoding="utf-8")
BASE = "https://learn.example.com/fr-fr/windows-commands/"
SOURCE = SourceSpec(
    id="test-windows",
    name="Microsoft Learn – Commandes Windows",
    platform="windows",
    licence="CC BY 4.0",
    attribution="© Microsoft, CC BY 4.0",
    seeds=[BASE + "chkdsk"],
    allow=[BASE],
    deny=["/print/"],
    delay_seconds=0,
)


async def no_sleep(_: float) -> None:
    return None


# --------------------------------------------------------------------------- texte
def test_tokens_sans_accents_ni_mots_vides() -> None:
    assert tokens("Comment redémarrer le service sshd ?") == ["redemarrer", "service", "sshd"]
    assert tokens("chkdsk /f") == ["chkdsk"]  # « /f » est trop court : la syntaxe exacte passe par le vecteur dense


def test_vecteur_creux_stable_et_sans_doublon() -> None:
    i1, v1 = sparse_vector("disque disque plein")
    i2, _ = sparse_vector("plein disque")
    assert sorted(i1) == sorted(i2)
    assert len(i1) == len(set(i1)) == 2
    assert max(v1) > 1.0  # « disque » apparaît deux fois


# --------------------------------------------------------------------------- découpage
def test_decoupage_par_sections_avec_ancres_sans_le_bruit() -> None:
    chunks = chunk_html(HTML)
    assert {c.title for c in chunks} == {"chkdsk"}
    by_anchor = {c.anchor: c for c in chunks}
    assert "chkdsk" in by_anchor and "parameters" in by_anchor
    assert by_anchor["parameters"].section == "chkdsk › Paramètres"
    assert "/r inclut les fonctionnalités de /f" in by_anchor["parameters"].text
    joined = " ".join(c.text for c in chunks)
    assert "navigation" not in joined and "Pied de page" not in joined and "var x" not in joined
    # Section courte gardée quand elle contient du code : la syntaxe est ce qu'on cherche le plus souvent.
    assert "[/f]" in by_anchor["syntax"].text
    assert not any(c.text == "" for c in chunks)


def test_section_longue_coupee_avec_recouvrement() -> None:
    long = "<main><h1>T</h1><h2 id='a'>A</h2><p>" + " ".join(f"mot{i}" for i in range(1000)) + "</p></main>"
    parts = [c for c in chunk_html(long) if c.anchor == "a"]
    assert len(parts) == 3
    assert parts[0].text.split()[-1] in parts[1].text.split()


# --------------------------------------------------------------------------- collecte
@respx.mock
async def test_collecte_respecte_perimetre_et_robots() -> None:
    respx.get("https://learn.example.com/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nDisallow: /fr-fr/windows-commands/fsutil\n")
    )
    page = respx.get(BASE + "chkdsk").mock(return_value=httpx.Response(200, text=HTML, headers={"content-type": "text/html"}))
    fsutil = respx.get(BASE + "fsutil").mock(return_value=httpx.Response(200, text=HTML, headers={"content-type": "text/html"}))
    chkntfs = respx.get(BASE + "chkntfs").mock(
        return_value=httpx.Response(200, text="<main><h1>chkntfs</h1></main>", headers={"content-type": "text/html"})
    )
    crawler = Crawler(httpx.AsyncClient(), sleep=no_sleep)

    urls = [p.url async for p in crawler.crawl(SOURCE)]

    assert urls == [BASE + "chkdsk", BASE + "chkntfs"]  # fragment retiré, lien externe et hors préfixe ignorés
    assert page.called and chkntfs.called
    assert not fsutil.called  # interdit par robots.txt


@respx.mock
async def test_robots_inaccessible_on_s_abstient() -> None:
    respx.get("https://learn.example.com/robots.txt").mock(return_value=httpx.Response(503))
    page = respx.get(BASE + "chkdsk").mock(return_value=httpx.Response(200, text=HTML))
    assert [p async for p in Crawler(httpx.AsyncClient(), sleep=no_sleep).crawl(SOURCE)] == []
    assert not page.called


def test_fichier_des_sources_valide() -> None:
    sources = load_sources()
    assert len({s.id for s in sources}) == len(sources) >= 5
    for s in sources:
        assert s.licence and s.attribution and s.seeds
        assert all(s.allowed(seed) for seed in s.seeds), s.id


# --------------------------------------------------------------------------- index
@pytest.fixture
async def index() -> DocsIndex:
    idx = DocsIndex(AsyncQdrantClient(location=":memory:"), HashEmbedder(), "test_docs", min_similarity=0.0)
    await idx.ensure_collection()
    return idx


async def test_indexation_idempotente_et_remplacement(index: DocsIndex) -> None:
    chunks = chunk_html(HTML)
    assert await index.upsert_page(SOURCE, BASE + "chkdsk", chunks) == len(chunks)
    assert await index.upsert_page(SOURCE, BASE + "chkdsk", chunks) == 0  # inchangée : rien n'est réencodé

    await index.upsert_page(SOURCE, BASE + "chkdsk", chunks[:1])
    count = await index.client.count("test_docs", exact=True)
    assert count.count == 1  # les anciens passages de la page ont disparu


async def test_recherche_hybride_filtree_par_plateforme(index: DocsIndex) -> None:
    await index.upsert_page(SOURCE, BASE + "chkdsk", chunk_html(HTML))
    linux = SourceSpec(**{**SOURCE.__dict__, "id": "lx", "platform": "linux", "name": "Ubuntu Server"})
    await index.upsert_page(
        linux,
        "https://ubuntu.example.com/fsck",
        chunk_html(
            "<main><h1>fsck</h1><h2 id='repair'>Réparer</h2><p>fsck vérifie et répare un système de fichiers Linux démonté. "
            "Ne lancez jamais fsck sur un système de fichiers monté en écriture : vous risquez de corrompre les données du disque.</p></main>"
        ),
    )

    hits = await index.search("secteurs défectueux sur le disque", "windows")
    assert hits and all(h.platform == "windows" for h in hits)
    assert hits[0].url == BASE + "chkdsk#parameters"
    assert hits[0].attribution == "© Microsoft, CC BY 4.0"

    assert {h.platform for h in await index.search("système de fichiers disque", None, limit=10)} == {"windows", "linux"}


async def test_changer_de_modele_impose_de_reindexer(index: DocsIndex) -> None:
    other = DocsIndex(index.client, HashEmbedder(dim=64), "test_docs")
    with pytest.raises(EmbedderMismatchError, match="réindexer"):
        await other.ensure_collection()


@respx.mock
async def test_ingestion_de_bout_en_bout(index: DocsIndex) -> None:
    respx.get("https://learn.example.com/robots.txt").mock(return_value=httpx.Response(404))
    respx.get(url__startswith=BASE).mock(return_value=httpx.Response(200, text=HTML, headers={"content-type": "text/html"}))
    crawler = Crawler(httpx.AsyncClient(), sleep=no_sleep)

    first = await ingest_source(index, crawler, SOURCE, max_pages=3)
    assert first.pages == 3 and first.passages > 0
    again = await ingest_source(index, Crawler(httpx.AsyncClient(), sleep=no_sleep), SOURCE, max_pages=3)
    assert again.unchanged == 3 and again.passages == 0


# --------------------------------------------------------------------------- composition
class Fixed:
    def __init__(self, docs: list[Document] | Exception):
        self.docs = docs

    async def search(self, question, platform, limit=4):
        if isinstance(self.docs, Exception):
            raise self.docs
        return self.docs[:limit]


def doc(ref: int, kind: str = "kb_command") -> Document:
    return Document(ref=ref, kind=kind, title=f"T{ref}", url=f"/u{ref}", slug=None, text="…")


async def test_composition_renumerote_et_tolere_une_panne(index: DocsIndex) -> None:
    await index.upsert_page(SOURCE, BASE + "chkdsk", chunk_html(HTML))
    composite = CompositeRetriever([(Fixed([doc(1), doc(2)]), 3), (OfficialDocsRetriever(index), 2)])
    docs = await composite.search("chkdsk secteurs défectueux", "windows")
    assert [d.ref for d in docs] == [1, 2, 3, 4]
    assert [d.kind for d in docs] == ["kb_command", "kb_command", "official_doc", "official_doc"]
    assert docs[2].attribution and docs[2].url.startswith(BASE)

    degraded = CompositeRetriever([(Fixed(httpx.ConnectError("API cœur injoignable")), 3), (OfficialDocsRetriever(index), 2)])
    assert [d.ref for d in await degraded.search("chkdsk", "windows")] == [1, 2]
