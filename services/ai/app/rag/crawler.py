"""Collecte respectueuse : liste blanche de préfixes, robots.txt, pause entre deux pages, limite de pages."""

import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

from app.rag.sources import SourceSpec

log = logging.getLogger("sysmaster.ai.crawler")
USER_AGENT = "SysMasterBot/0.1 (indexation pedagogique de documentation; respecte robots.txt)"


@dataclass(frozen=True)
class Page:
    url: str
    html: str


class Crawler:
    def __init__(self, client: httpx.AsyncClient | None = None, sleep=asyncio.sleep):
        self.client = client or httpx.AsyncClient(timeout=20.0, follow_redirects=True, headers={"user-agent": USER_AGENT})
        self.sleep = sleep
        self._robots: dict[str, RobotFileParser] = {}

    async def _can_fetch(self, url: str) -> bool:
        origin = "{0.scheme}://{0.netloc}".format(urlparse(url))
        if origin not in self._robots:
            rp = RobotFileParser()
            try:
                res = await self.client.get(f"{origin}/robots.txt")
                # Pas de robots.txt (404) : tout est permis ; robots.txt inaccessible (5xx…) : on s'abstient.
                rp.parse(
                    res.text.splitlines() if res.status_code == 200 else [] if res.status_code == 404 else ["User-agent: *", "Disallow: /"]
                )
            except httpx.HTTPError:
                rp.parse(["User-agent: *", "Disallow: /"])
            self._robots[origin] = rp
        return self._robots[origin].can_fetch(USER_AGENT, url)

    async def crawl(self, source: SourceSpec, max_pages: int | None = None) -> AsyncIterator[Page]:
        """Parcours en largeur depuis les pages de départ, sans jamais sortir des préfixes autorisés."""
        limit = max_pages or source.max_pages
        queue = list(dict.fromkeys(source.seeds))
        seen = set(queue)
        fetched = 0
        while queue and fetched < limit:
            url = queue.pop(0)
            if not source.allowed(url) or not await self._can_fetch(url):
                log.info("ignorée (hors périmètre ou robots.txt) : %s", url)
                continue
            try:
                res = await self.client.get(url)
            except httpx.HTTPError as err:
                log.warning("échec %s : %s", url, err)
                continue
            fetched += 1
            final = str(res.url)
            if res.status_code == 200 and "html" in res.headers.get("content-type", "") and source.allowed(final):
                yield Page(final, res.text)
                for a in BeautifulSoup(res.text, "html.parser").find_all("a", href=True):
                    link = urldefrag(urljoin(final, a["href"]))[0]
                    if link not in seen and source.allowed(link):
                        seen.add(link)
                        queue.append(link)
            await self.sleep(source.delay_seconds)
