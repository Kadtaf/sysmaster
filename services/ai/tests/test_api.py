import httpx
import respx
from fastapi.testclient import TestClient

from app.main import app, get_llm, get_retriever
from app.orchestrator import build_user_message
from app.rag.retriever import CoreApiRetriever, Document, keywords
from app.schemas import AskRequest


class StaticRetriever:
    async def search(self, question, platform, limit=4):
        return [
            Document(
                ref=1,
                kind="kb_command",
                title="Fiche SysMaster : df",
                url="/commandes/linux-df",
                slug="linux-df",
                text="Commande : df (linux) — niveau de risque none",
            )
        ]


def client() -> TestClient:
    from app.llm.fake import FakeLlm

    app.dependency_overrides[get_retriever] = lambda: StaticRetriever()
    app.dependency_overrides[get_llm] = lambda: FakeLlm()
    return TestClient(app)


def test_jeton_de_service_obligatoire() -> None:
    assert client().post("/v1/ask", json={"question": "disque plein"}).status_code == 401


def test_reponse_structuree_citee_en_camel_case() -> None:
    res = client().post("/v1/ask", json={"question": "Mon disque est plein sous Linux"}, headers={"x-ai-token": "dev-only-ai-token"})
    assert res.status_code == 200
    body = res.json()
    assert body["agent"] == "diagnostician" and body["domain"] == "linux" and body["outcome"] == "answered"
    assert body["answer"]["verified"] is True
    assert body["answer"]["sources"] == [
        {"ref": 1, "title": "Fiche SysMaster : df", "url": "/commandes/linux-df", "kind": "kb_command", "slug": "linux-df"}
    ]
    step = body["answer"]["steps"][0]
    assert {"maskedUntilRisksRead", "copyAllowed", "riskNote"} <= step.keys()


def test_message_utilisateur_question_en_dernier() -> None:
    msg = build_user_message(AskRequest(question="Pourquoi ?"), [])
    assert msg.endswith("<question>\nPourquoi ?\n</question>")
    assert "(aucun document trouvé)" in msg


def test_mots_cles() -> None:
    assert keywords("Pourquoi mon disque est plein sur Ubuntu ?") == "disque or plein or ubuntu"


@respx.mock
async def test_retriever_interroge_l_api_coeur() -> None:
    respx.get("http://core/api/v1/kb/commands", params={"q": "disque or plein"}).mock(
        return_value=httpx.Response(200, json=[{"slug": "linux-df"}])
    )
    respx.get("http://core/api/v1/kb/commands/linux-df").mock(
        return_value=httpx.Response(
            200,
            json={
                "slug": "linux-df",
                "name": "df",
                "platform": "linux",
                "riskLevel": "none",
                "summary": "Espace libre",
                "syntax": "df -h",
                "why": "…",
                "whenToUse": "…",
                "context": None,
                "risks": [{"level": "none", "text": "Lecture seule."}],
                "parameters": [],
                "examples": [{"title": "t", "code": "df -h", "explanation": "e"}],
            },
        )
    )
    docs = await CoreApiRetriever("http://core/api/v1").search("disque plein", None)
    assert [(d.ref, d.slug, d.url) for d in docs] == [(1, "linux-df", "/commandes/linux-df")]
    assert "Risques : none : Lecture seule." in docs[0].text
