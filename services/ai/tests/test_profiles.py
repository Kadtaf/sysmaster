"""Profils d'agents publiés : le socle de sécurité reste en tête, l'API peut tomber sans casser les réponses."""

import re
from pathlib import Path

import httpx
import respx

from app.agents.profiles import CORE, DEFAULTS, system_prompt
from app.agents.store import ProfileStore

MIGRATION = Path(__file__).parents[3] / "db" / "migrations" / "009_profils_agents_editables.sql"
URL = "http://core/api/v1/ai/profiles"


def test_textes_integres_identiques_a_la_migration() -> None:
    # Le repli du service et les profils créés en base partent du même texte.
    sql = MIGRATION.read_text(encoding="utf-8")
    found = dict(re.findall(r"\('(\w+)', '[^']*', '(?:[^']|'')*',\s*\$p\$(.*?)\$p\$", sql, re.DOTALL))
    assert found == DEFAULTS


def test_profil_publie_apres_le_socle() -> None:
    published = {"network_expert": "Domaine : réseau. Commence toujours par le lien physique.", "inconnu": "ignoré"}
    prompt = system_prompt("tutor", "network", published)
    assert prompt.startswith(CORE)
    assert prompt.endswith("Commence toujours par le lien physique.")
    assert DEFAULTS["tutor"] in prompt and "ignoré" not in prompt
    assert system_prompt("tutor", "network", {}) == system_prompt("tutor", "network")


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


@respx.mock
async def test_cache_court_et_repli() -> None:
    route = respx.get(URL).mock(
        return_value=httpx.Response(
            200,
            json=[
                {"code": "tutor", "systemPrompt": "Mission : tuteur, version publiée.", "version": 2},
                {"code": "android_expert", "systemPrompt": "Tu es expert Android…", "version": 1},
                {"code": "linux_expert", "systemPrompt": "  ", "version": 3},
            ],
        )
    )
    clock = Clock()
    store = ProfileStore("http://core/api/v1/", "secret", ttl_seconds=60, clock=clock)
    assert await store.get() == {"tutor": "Mission : tuteur, version publiée."}
    assert route.calls[0].request.headers["x-ai-token"] == "secret"

    clock.now = 30
    await store.get()
    assert route.call_count == 1  # encore frais

    # API en panne : on garde les derniers profils connus, et on n'insiste pas avant le délai suivant.
    route.mock(side_effect=httpx.ConnectError("refusé"))
    clock.now = 61
    assert await store.get() == {"tutor": "Mission : tuteur, version publiée."}
    clock.now = 62
    await store.get()
    assert route.call_count == 2


@respx.mock
async def test_api_injoignable_des_le_depart() -> None:
    respx.get(URL).mock(return_value=httpx.Response(401, json={"message": "Jeton de service invalide"}))
    assert await ProfileStore("http://core/api/v1", "mauvais").get() == {}
