"""Chaîne d'une question : routage → contexte → modèle → garde-fous."""

import time

from app.agents.profiles import system_prompt
from app.agents.router import route
from app.guardrails.output import enforce
from app.llm.port import Llm
from app.rag.retriever import Document, Retriever
from app.schemas import Answer, AskRequest, AskResponse

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
    parts += [f"[{d.ref}] {d.title}\n{d.text}" for d in documents] or ["(aucun document trouvé)"]
    parts.append("</documents>")
    if req.history:
        parts.append("<historique>")
        parts += [f"Question : {t.question}\nRéponse résumée : {t.summary}" for t in req.history]
        parts.append("</historique>")
    platform = f", plateforme : {req.platform}" if req.platform else ""
    parts.append(f"Niveau de l'apprenant : {LEVELS[req.level]}{platform}.")
    parts.append(f"<question>\n{req.question}\n</question>")
    return "\n\n".join(parts)


async def ask(req: AskRequest, llm: Llm, retriever: Retriever) -> AskResponse:
    started = time.monotonic()
    r = route(req.question, req.platform)
    documents = await retriever.search(req.question, req.platform)
    result = await llm.answer(system_prompt(r.agent, r.domain), build_user_message(req, documents))
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
