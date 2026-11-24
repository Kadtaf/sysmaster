from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.diagnostic.extract import extract, locate, reduce_evidence, system_prompt
from app.llm.claude import ClaudeLlm
from app.llm.fake import FakeLlm
from app.llm.port import LlmResult
from app.main import app, get_llm
from app.schemas import DraftExtraction, DraftLogFinding, DraftSymptom, ExtractRequest

CATALOGUE = [
    {"code": "unexpected_reboot", "label": "redémarre tout seul"},
    {"code": "blue_screen", "label": "écran bleu"},
    {"code": "loud_fans", "label": "ventilateurs bruyants"},
]


def req(description: str, evidence: str = "") -> ExtractRequest:
    return ExtractRequest(platform="windows", description=description, evidence=evidence, catalogue=CATALOGUE)


class Scripted:
    """Modèle qui renvoie un brouillon donné : pour éprouver les garde-fous."""

    def __init__(self, draft: DraftExtraction | None, outcome: str = "answered"):
        self.draft, self.outcome = draft, outcome
        self.calls: list[tuple[str, str]] = []

    async def extract(self, system: str, user: str):
        self.calls.append((system, user))
        return LlmResult(draft=self.draft, outcome=self.outcome, model="scripted")


async def test_codes_inventes_et_citations_absentes_ecartes() -> None:
    llm = Scripted(
        DraftExtraction(
            symptoms=[
                DraftSymptom(code="unexpected_reboot", quote="Mon PC  REDEMARRE tout seul"),  # casse, accents, espaces : toléré
                DraftSymptom(code="overheating", quote="redémarre"),  # code hors catalogue
                DraftSymptom(code="blue_screen", quote="écran bleu de la mort"),  # citation inventée
                DraftSymptom(code="unexpected_reboot", quote="redémarre"),  # doublon
            ],
            log_findings=[
                DraftLogFinding(summary="Arrêt inattendu", quote="Kernel-Power 41"),
                DraftLogFinding(summary="Inventé", quote="Disk 0 failure"),
            ],
        )
    )
    res = await extract(req("Mon PC redémarre tout seul quand je joue.", "Critique Kernel-Power 41 (63)"), llm)
    assert [(s.code, s.source) for s in res.symptoms] == [("unexpected_reboot", "description")]
    assert [f.quote for f in res.log_findings] == ["Kernel-Power 41"]
    assert any("overheating" in n for n in res.notes) and any("blue_screen" in n for n in res.notes)


async def test_citation_trouvee_dans_le_journal() -> None:
    llm = Scripted(DraftExtraction(symptoms=[DraftSymptom(code="blue_screen", quote="BugCheck")]))
    res = await extract(req("Il plante.", "Le système a redémarré après une erreur (BugCheck)."), llm)
    assert res.symptoms[0].source == "evidence"


async def test_refus_du_modele() -> None:
    res = await extract(req("texte"), Scripted(None, outcome="refused"))
    assert res.outcome == "refused" and res.symptoms == []


def test_journal_trop_long_reduit_aux_lignes_utiles_et_a_la_fin() -> None:
    lines = [f"info ligne {i} rien à signaler" for i in range(3000)]
    lines[100] = "ERROR disk 0 has a bad block"
    lines[-1] = "derniere ligne"
    reduced, note = reduce_evidence("\n".join(lines))
    assert len(reduced) <= 20_000 and note
    assert "ERROR disk 0 has a bad block" in reduced and reduced.endswith("derniere ligne")
    assert "info ligne 50 " not in reduced


def test_prompt_stable_quel_que_soit_l_ordre_du_catalogue() -> None:
    a = system_prompt(req("x"))
    b = system_prompt(ExtractRequest(platform="windows", catalogue=list(reversed(CATALOGUE))))
    assert a == b and "- blue_screen : écran bleu" in a


def test_locate_trop_court() -> None:
    assert locate("a", "a b c", "") is None


async def test_modele_factice_repere_les_libelles() -> None:
    res = await extract(req("Depuis hier il redémarre tout seul et les ventilateurs bruyants me gênent", "x\nERROR fan\n"), FakeLlm())
    assert {s.code for s in res.symptoms} == {"unexpected_reboot", "loud_fans"}
    assert res.log_findings[0].quote == "ERROR fan"


def test_point_d_entree_protege_et_en_camel_case() -> None:
    app.dependency_overrides[get_llm] = lambda: FakeLlm()
    client = TestClient(app)
    body = {"platform": "windows", "description": "écran bleu au démarrage", "catalogue": CATALOGUE}
    assert client.post("/v1/diagnostic/extract", json=body).status_code == 401
    res = client.post("/v1/diagnostic/extract", json=body, headers={"x-ai-token": "dev-only-ai-token"})
    assert res.status_code == 200
    data = res.json()
    assert data["symptoms"] == [{"code": "blue_screen", "quote": "écran bleu", "source": "description"}]
    assert "logFindings" in data and "latencyMs" in data
    app.dependency_overrides.clear()


async def test_claude_extraction_effort_bas_et_schema() -> None:
    calls = {}

    async def parse(**kwargs):
        calls.update(kwargs)
        return SimpleNamespace(
            stop_reason="end_turn",
            parsed_output=DraftExtraction(),
            model="claude-opus-5-5",
            usage=SimpleNamespace(input_tokens=1, output_tokens=1, cache_read_input_tokens=0, cache_creation_input_tokens=0),
        )

    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=parse)))
    res = await ClaudeLlm("claude-opus-5-5", "medium", 8000, client=client).extract("S", "U")
    assert res.outcome == "answered"
    assert calls["output_format"] is DraftExtraction and calls["output_config"] == {"effort": "low"}
    assert calls["fallbacks"] == "default"
