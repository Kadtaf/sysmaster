"""Profils d'agents publiés dans le back-office, lus auprès de l'API cœur (le service ne lit pas la base).

Cache court : une publication prend effet en une minute au plus, sans redémarrage, et une question
ne coûte pas un appel de plus. Si l'API ne répond pas, on garde les derniers profils connus (ou les
textes intégrés) : un profil indisponible ne doit jamais empêcher de répondre.
"""

import logging
import time
from collections.abc import Callable

import httpx

from app.agents.profiles import DEFAULTS

log = logging.getLogger("sysmaster.ai.profiles")


class ProfileStore:
    def __init__(
        self,
        base_url: str,
        token: str,
        ttl_seconds: float = 60.0,
        client: httpx.AsyncClient | None = None,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.url = f"{base_url.rstrip('/')}/ai/profiles"
        self.token = token
        self.ttl = ttl_seconds
        self.client = client or httpx.AsyncClient(timeout=3.0)
        self.clock = clock
        self.profiles: dict[str, str] = {}
        self.versions: dict[str, int] = {}
        self.fetched_at: float | None = None

    async def get(self) -> dict[str, str]:
        now = self.clock()
        if self.fetched_at is not None and now - self.fetched_at < self.ttl:
            return self.profiles
        # Même en cas d'échec, on attend le délai suivant avant de réessayer : pas de rafale vers l'API.
        self.fetched_at = now
        try:
            res = await self.client.get(self.url, headers={"x-ai-token": self.token})
            res.raise_for_status()
            rows = res.json()
            # Seuls les profils que le routeur sait choisir ; un texte vide ne remplace rien.
            published = [r for r in rows if r["code"] in DEFAULTS and r["systemPrompt"].strip()]
            changed = {r["code"]: r["version"] for r in published} != self.versions
            self.profiles = {r["code"]: r["systemPrompt"].strip() for r in published}
            self.versions = {r["code"]: r["version"] for r in published}
            if changed:
                log.info("profils publiés : %s", ", ".join(f"{c}@v{v}" for c, v in sorted(self.versions.items())) or "aucun")
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as err:
            log.warning("profils indisponibles (%s) : derniers profils connus conservés", type(err).__name__)
        return self.profiles
