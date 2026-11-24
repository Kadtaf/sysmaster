"""Génération de quiz : forme vérifiée par le service, avant la relecture humaine."""

from app.llm.fake import FakeLlm
from app.llm.port import LlmResult
from app.quiz import build_user_message, check, generate
from app.schemas import DraftChoice, DraftQuestion, DraftQuiz, QuizRequest
from tests.test_api import client

TEXT = "Commande : df (linux). Pourquoi : voir l'espace libre. Risque : aucun, lecture seule. " * 2


def q(**kw) -> DraftQuestion:
    base = {
        "type": "single",
        "prompt": "Pourquoi lancer df avant de supprimer des fichiers ?",
        "choices": [DraftChoice(id="A", text="Mesurer"), DraftChoice(id="b", text="Effacer"), DraftChoice(id="c", text="Redémarrer")],
        "answer": ["a"],
        "explanation": "On mesure avant d'agir.",
        "difficulty": "beginner",
    }
    return DraftQuestion(**{**base, **kw})


def test_question_valide_normalisee() -> None:
    out, note = check(q(), 1)
    assert note is None and out.answer == ["a"] and [c.id for c in out.choices] == ["a", "b", "c"]


def test_identifiants_reecrits_dans_l_ordre() -> None:
    out, _ = check(q(choices=[DraftChoice(id="x", text="Un"), DraftChoice(id="y", text="Deux")], answer=["y"]), 1)
    assert [c.id for c in out.choices] == ["a", "b"] and out.answer == ["b"]


def test_questions_rejetees() -> None:
    assert check(q(answer=["z"]), 1)[1].endswith("aucun choix.")
    assert check(q(answer=["a", "b"]), 1)[1].endswith("une seule bonne réponse attendue.")
    assert check(q(type="multiple", answer=["a", "b", "c"]), 1)[1].endswith("tous les choix sont justes.")
    assert check(q(explanation="  "), 1)[1].endswith("vide.")
    assert check(q(choices=[DraftChoice(id="a", text="Seul")]), 1)[1].endswith("choix distincts.")
    # Doublons d'identifiant : un seul choix gardé.
    assert check(q(choices=[DraftChoice(id="a", text="Un"), DraftChoice(id="a", text="Bis")]), 1)[1].endswith("choix distincts.")


class Mixed(FakeLlm):
    async def generate_quiz(self, system, user):
        return LlmResult(draft=DraftQuiz(questions=[q(), q(answer=["z"]), q(), q()]), outcome="answered", model="fake")


async def test_generation_ecarte_et_plafonne() -> None:
    res = await generate(QuizRequest(title="df", text=TEXT, count=3), Mixed())
    assert len(res.questions) == 2 and len(res.notes) == 1 and res.outcome == "answered"


def test_message_contenu_puis_consigne() -> None:
    msg = build_user_message(QuizRequest(title='la "fiche"', text=TEXT, count=2, level="intermediate", platform="linux"))
    assert msg.startswith("<contenu titre=\"la 'fiche'\">") and msg.endswith("Rédige 2 question(s).")


def test_point_d_entree() -> None:
    c = client()
    assert c.post("/v1/quiz/generate", json={"title": "df", "text": TEXT}).status_code == 401
    res = c.post("/v1/quiz/generate", json={"title": "df", "text": TEXT, "count": 2}, headers={"x-ai-token": "dev-only-ai-token"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["questions"]) == 2 and {"promptMd", "choices", "answer", "explanation"} <= body["questions"][0].keys()
