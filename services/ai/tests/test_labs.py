"""Générateur de labs : le service décode la machine et les vérifications ; l'API cœur rejoue la démarche."""

import json

from app.labs import build_user_message, check, generate
from app.llm.fake import FakeLlm
from app.llm.port import LlmResult
from app.schemas import DraftLab, LabRequest
from tests.test_api import client

REQ = {"topic": "Un service ne démarre plus après un nettoyage de /etc.", "category": "linux", "example": "{}", "reference": "help"}


def draft(**kw) -> DraftLab:
    base = {
        "slug": " Linux-Exemple ",
        "title": " T ",
        "brief_md": "B",
        "objectives": ["o", " "],
        "hints": ["h"],
        "solution_md": "S",
        "machine_json": '{"hostname": "h"}',
        "validators_json": "[]",
        "walkthrough": [" ls ", ""],
    }
    return DraftLab(**{**base, **kw})


def test_decodage_et_nettoyage() -> None:
    lab, notes = check(draft())
    assert notes == [] and lab.slug == "linux-exemple" and lab.machine == {"hostname": "h"}
    assert lab.objectives == ["o"] and lab.walkthrough == ["ls"]


def test_json_illisible_ou_mal_forme() -> None:
    assert check(draft(machine_json="{oups"))[1][0].startswith("machine_json n'est pas du JSON valide")
    assert check(draft(machine_json="[]"))[1] == ["machine_json doit être un objet JSON."]
    assert check(draft(validators_json="{}"))[1] == ["validators_json doit être un tableau JSON."]


def test_message_premiere_passe_puis_correction() -> None:
    first = build_user_message(LabRequest(**REQ, difficulty="intermediate"))
    assert first.startswith("<reference>\nhelp\n</reference>") and "Catégorie : Linux. Difficulté : intermédiaire." in first
    assert first.endswith("Conçois le lab.") and "<problemes>" not in first
    fix = build_user_message(LabRequest(**REQ, previous='{"slug": "x"}', issues=["La démarche ne répare pas la machine."]))
    assert '<proposition_precedente>\n{"slug": "x"}' in fix and "- La démarche ne répare pas la machine." in fix


class Broken(FakeLlm):
    async def generate_lab(self, system, user):
        return LlmResult(draft=draft(machine_json="pas du json"), outcome="answered", model="fake")


async def test_proposition_illisible_renvoyee_brute() -> None:
    res = await generate(LabRequest(**REQ), Broken())
    assert res.lab is None and res.notes and json.loads(res.raw)["machine_json"] == "pas du json"


def test_point_d_entree() -> None:
    c = client()
    assert c.post("/v1/labs/generate", json=REQ).status_code == 401
    res = c.post("/v1/labs/generate", json={**REQ, "category": "cyber"}, headers={"x-ai-token": "dev-only-ai-token"})
    assert res.status_code == 200
    body = res.json()
    assert (
        body["lab"]["slug"] == "cyber-brouillon-factice"
        and {"briefMd", "solutionMd", "machine", "validators", "walkthrough"} <= body["lab"].keys()
    )
    assert body["notes"] == [] and body["outcome"] == "answered"
