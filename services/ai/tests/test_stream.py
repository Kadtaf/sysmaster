"""Réponses en flux : texte au fil de l'eau, mais étapes et commandes seulement après les garde-fous."""

import json
from types import SimpleNamespace

from app.llm.claude import ClaudeLlm
from app.llm.fake import FakeLlm
from app.llm.port import LlmResult
from app.orchestrator import ask, ask_stream
from app.schemas import AskRequest, DraftAnswer, DraftStep
from tests.test_api import StaticRetriever, client

USAGE = SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=None, cache_creation_input_tokens=None)


class FakeStream:
    def __init__(self, chunks, final):
        self.chunks, self.final = chunks, final

    async def __aenter__(self):
        async def gen():
            for c in self.chunks:
                yield c

        self.text_stream = gen()
        return self

    async def __aexit__(self, *exc):
        return False

    async def get_final_message(self):
        return self.final


async def test_claude_decode_le_json_partiel() -> None:
    draft = DraftAnswer(summary="Le disque est plein.", explanation="df montre l'espace.")
    text = draft.model_dump_json()
    chunks = [text[i : i + 7] for i in range(0, len(text), 7)]
    seen = {}

    def stream(**kwargs):
        seen.update(kwargs)
        return FakeStream(chunks, SimpleNamespace(stop_reason="end_turn", parsed_output=draft, model="claude-opus-5-5", usage=USAGE))

    llm = ClaudeLlm(
        "claude-opus-5-5", "medium", 8000, client=SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))
    )
    items = [i async for i in llm.answer_stream("S", "Q")]
    partials, final = items[:-1], items[-1]
    assert isinstance(final, LlmResult) and final.draft == draft and final.outcome == "answered"
    summaries = [p["summary"] for p in partials if "summary" in p]
    assert summaries[-1] == draft.summary and any(len(s) < len(draft.summary) for s in summaries)
    # Mêmes paramètres que la requête non diffusée : sortie structurée, cache, repli.
    assert seen["output_format"] is DraftAnswer and seen["fallbacks"] == "default"


class StepLlm(FakeLlm):
    """Brouillon avec une commande destructive mal notée : les garde-fous doivent la relever avant l'envoi."""

    async def answer(self, system, user):
        step = DraftStep(
            title="Nettoyer",
            why="Libérer de la place.",
            how="…",
            command="rm -rf /var/log",
            shell="bash",
            when="…",
            risk="low",
            risk_note="",
        )
        return LlmResult(
            draft=DraftAnswer(summary="Disque plein.", explanation="Les journaux occupent tout.", steps=[step], source_refs=[1]),
            outcome="answered",
            model="fake",
        )


async def test_orchestrateur_texte_puis_reponse_validee() -> None:
    req = AskRequest(question="Mon disque est plein sous Linux")
    events = [e async for e in ask_stream(req, StepLlm(), StaticRetriever())]
    names = [n for n, _ in events]
    assert names[0] == "meta" and names[-1] == "answer" and set(names[1:-1]) == {"delta"}
    assert events[0][1]["consulted"] == [{"ref": 1, "title": "Fiche SysMaster : df", "kind": "kb_command"}]
    text = {"summary": "", "explanation": ""}
    for _, data in events[1:-1]:
        assert set(data) == {"field", "text"}
        text[data["field"]] += data["text"]
    assert text == {"summary": "Disque plein.", "explanation": "Les journaux occupent tout."}
    # Aucune commande avant la réponse finale, où elle arrive relevée et masquée.
    assert "rm -rf" not in json.dumps([d for _, d in events[:-1]])
    step = events[-1][1]["answer"]["steps"][0]
    assert step["risk"] in ("high", "critical") and step["maskedUntilRisksRead"] is True
    # Même réponse que l'appel non diffusé.
    plain = await ask(req, StepLlm(), StaticRetriever())
    assert events[-1][1]["answer"] == plain.model_dump(by_alias=True)["answer"]


def parse_sse(body: str) -> list[tuple[str, dict]]:
    out = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_point_d_entree_sse() -> None:
    c = client()
    assert c.post("/v1/ask/stream", json={"question": "disque plein"}).status_code == 401
    res = c.post("/v1/ask/stream", json={"question": "Mon disque est plein sous Linux"}, headers={"x-ai-token": "dev-only-ai-token"})
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(res.text)
    assert events[0][0] == "meta" and events[-1][0] == "answer"
    assert events[-1][1]["answer"]["verified"] is True


def test_erreur_dans_le_flux() -> None:
    from app.main import app, get_llm

    class Broken(FakeLlm):
        async def answer_stream(self, system, user):
            yield {"summary": "Début"}
            raise RuntimeError("coupure")

    c = client()
    app.dependency_overrides[get_llm] = lambda: Broken()
    events = parse_sse(c.post("/v1/ask/stream", json={"question": "disque plein"}, headers={"x-ai-token": "dev-only-ai-token"}).text)
    assert [n for n, _ in events] == ["meta", "delta", "error"]
