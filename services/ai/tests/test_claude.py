from types import SimpleNamespace

from app.llm.claude import ClaudeLlm
from app.schemas import DraftAnswer


class FakeMessages:
    def __init__(self, response):
        self.response = response
        self.kwargs = None

    async def parse(self, **kwargs):
        self.kwargs = kwargs
        return self.response


def fake_client(response):
    messages = FakeMessages(response)
    return SimpleNamespace(beta=SimpleNamespace(messages=messages)), messages


USAGE = SimpleNamespace(input_tokens=1200, output_tokens=300, cache_read_input_tokens=900, cache_creation_input_tokens=None)


async def test_requete_sortie_structuree_cache_et_repli() -> None:
    draft = DraftAnswer(summary="s", explanation="e")
    client, messages = fake_client(SimpleNamespace(stop_reason="end_turn", parsed_output=draft, model="claude-opus-5-5", usage=USAGE))
    res = await ClaudeLlm("claude-opus-5-5", "medium", 8000, client=client).answer("SYSTEME", "QUESTION")
    assert res.outcome == "answered" and res.draft == draft
    assert res.usage.cache_read_tokens == 900 and res.usage.cache_write_tokens == 0
    k = messages.kwargs
    assert k["output_format"] is DraftAnswer
    assert k["system"] == [{"type": "text", "text": "SYSTEME", "cache_control": {"type": "ephemeral"}}]
    assert k["output_config"] == {"effort": "medium"}
    assert k["fallbacks"] == "default" and k["betas"] == ["server-side-fallback-2026-07-01"]
    assert "thinking" not in k and "temperature" not in k


async def test_refus() -> None:
    client, _ = fake_client(SimpleNamespace(stop_reason="refusal", parsed_output=None, model="claude-opus-5-5", usage=USAGE))
    res = await ClaudeLlm("claude-opus-5-5", "medium", 8000, client=client).answer("S", "Q")
    assert res.outcome == "refused" and res.draft is None


async def test_lab_plafond_de_sortie_releve() -> None:
    from app.schemas import DraftLab

    client, messages = fake_client(SimpleNamespace(stop_reason="end_turn", parsed_output=None, model="claude-opus-5-5", usage=USAGE))
    await ClaudeLlm("claude-opus-5-5", "medium", 8000, client=client).generate_lab("S", "U")
    assert messages.kwargs["output_format"] is DraftLab and messages.kwargs["max_tokens"] == 16_000
