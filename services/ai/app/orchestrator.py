"""Chaîne d'une question : routage → contexte → modèle → garde-fous."""

import time
from collections.abc import AsyncIterator
from typing import Any

from app.agents.profiles import system_prompt
from app.agents.router import route
from app.guardrails.output import enforce
from app.llm.port import Llm, LlmResult
from app.rag.retriever import Document, Retriever
from app.schemas import Answer, AskRequest, AskResponse

KIND_LABEL = {"kb_command": "Fiche SysMaster", "official_doc": "Documentation officielle"}
LEVELS = {"beginner": "débutant", "intermediate": "intermédiaire", "advanced": "avancé"}

REFUSED = Answer(
    summary="Je ne peux pas répondre à cette demande.",
    explanation="Elle a été déclinée par les règles de sécurité du modèle. Reformulez-la en expliquant votre objectif.",
    steps=[],
    sources=[],
    check_questions=[],
    verified=False,
    out_of_scope=False,
)


def build_user_message(req: AskRequest, documents: list[Document]) -> str:
    """Ordre stable : contexte, historique, puis la question (seule partie qui change toujours)."""
    parts = ["<documents>"]
    parts += [f"[{d.ref}] {KIND_LABEL[d.kind]} — {d.title}\n{d.text}" for d in documents] or ["(aucun document trouvé)"]
    parts.append("</documents>")
    if req.history:
        parts.append("<historique>")
        parts += [f"Question : {t.question}\nRéponse résumée : {t.summary}" for t in req.history]
        parts.append("</historique>")
    platform = f", plateforme : {req.platform}" if req.platform else ""
    parts.append(f"Niveau de l'apprenant : {LEVELS[req.level]}{platform}.")
    parts.append(f"<question>\n{req.question}\n</question>")
    return "\n\n".join(parts)


STREAMED_FIELDS = ("summary", "explanation")


def _response(r, result: LlmResult, documents: list[Document], started: float) -> AskResponse:
    answer = enforce(result.draft, documents) if result.draft else REFUSED
    return AskResponse(
        answer=answer,
        agent=r.agent,
        domain=r.domain,
        model=result.model,
        usage=result.usage,
        latency_ms=int((time.monotonic() - started) * 1000),
        outcome=result.outcome,
    )


async def ask(req: AskRequest, llm: Llm, retriever: Retriever) -> AskResponse:
    started = time.monotonic()
    r = route(req.question, req.platform)
    documents = await retriever.search(req.question, req.platform)
    result = await llm.answer(system_prompt(r.agent, r.domain), build_user_message(req, documents))
    return _response(r, result, documents, started)


async def ask_stream(req: AskRequest, llm: Llm, retriever: Retriever) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Même chaîne que ask(), en événements :

    - « meta » : agent, domaine et documents consultés, dès qu'ils sont connus ;
    - « delta » : morceaux du résumé et de l'explication pendant la génération (texte seul, sans commande) ;
    - « answer » : la réponse complète, une fois passée par les garde-fous.

    Les étapes et leurs commandes ne sont jamais envoyées en avance : elles n'existent pour l'utilisateur
    qu'après validation (risque relevé, masquage, citations vérifiées).
    """
    started = time.monotonic()
    r = route(req.question, req.platform)
    documents = await retriever.search(req.question, req.platform)
    yield (
        "meta",
        {"agent": r.agent, "domain": r.domain, "consulted": [{"ref": d.ref, "title": d.title, "kind": d.kind} for d in documents]},
    )
    sent = dict.fromkeys(STREAMED_FIELDS, "")
    result: LlmResult | None = None
    async for item in llm.answer_stream(system_prompt(r.agent, r.domain), build_user_message(req, documents)):
        if isinstance(item, LlmResult):
            result = item
            break
        for name in STREAMED_FIELDS:
            value = item.get(name)
            # Le texte partiel ne fait que s'allonger ; on n'envoie que la suite.
            if isinstance(value, str) and len(value) > len(sent[name]) and value.startswith(sent[name]):
                yield "delta", {"field": name, "text": value[len(sent[name]) :]}
                sent[name] = value
    if result is None:
        raise RuntimeError("flux du modèle interrompu sans réponse finale")
    yield "answer", _response(r, result, documents, started).model_dump(by_alias=True)
