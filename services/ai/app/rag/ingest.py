"""Ingestion de la documentation officielle dans Qdrant.

    python -m app.rag.ingest                       # toutes les sources de sources.toml
    python -m app.rag.ingest --source postgresql   # une seule source
    python -m app.rag.ingest --max-pages 20        # essai rapide

Idempotent : une page inchangée n'est ni réencodée ni réécrite ; une page modifiée remplace ses
anciens passages. Prévu pour tourner chaque semaine (CronJob du chart Helm).
"""

import argparse
import asyncio
import logging
import sys
from dataclasses import dataclass

from app.config import docs_index, settings
from app.rag.chunking import chunk_html
from app.rag.crawler import Crawler
from app.rag.index import DocsIndex
from app.rag.sources import SourceSpec, load_sources

log = logging.getLogger("sysmaster.ai.ingest")


@dataclass
class Report:
    pages: int = 0
    unchanged: int = 0
    passages: int = 0


async def ingest_source(index: DocsIndex, crawler: Crawler, source: SourceSpec, max_pages: int | None = None) -> Report:
    report = Report()
    async for page in crawler.crawl(source, max_pages):
        report.pages += 1
        written = await index.upsert_page(source, page.url, chunk_html(page.html))
        if written:
            report.passages += written
        else:
            report.unchanged += 1
    log.info("%s : %d pages, %d inchangées, %d passages écrits", source.id, report.pages, report.unchanged, report.passages)
    return report


async def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", action="append", help="identifiant d'une source (répétable)")
    parser.add_argument("--max-pages", type=int, help="limite de pages par source")
    args = parser.parse_args(argv)

    index = docs_index()
    if index is None:
        print("QDRANT_URL n'est pas défini : rien à indexer.", file=sys.stderr)
        return 2
    sources = [s for s in load_sources() if not args.source or s.id in args.source]
    unknown = set(args.source or []) - {s.id for s in sources}
    if unknown:
        print(f"Sources inconnues : {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2
    log.info("modèle de plongement : %s ; collection : %s", index.embedder.name, settings().qdrant_collection)
    await index.ensure_collection()
    crawler = Crawler()
    failed = 0
    for source in sources:
        try:
            await ingest_source(index, crawler, source, args.max_pages)
        except Exception:  # noqa: BLE001 — une source en échec ne bloque pas les autres
            log.exception("échec de la source %s", source.id)
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    sys.exit(asyncio.run(main(sys.argv[1:])))
