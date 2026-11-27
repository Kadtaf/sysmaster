"""Enveloppe d'un Llm : masque données personnelles et secrets (app.guardrails.pii) dans tout ce
qui part vers le modèle. Placée autour de l'adaptateur dans get_llm, elle couvre chaque appel,
présent ou futur, sans que les agents aient à y penser."""

import logging
from collections.abc import AsyncIterator
from typing import Any

from app.guardrails.pii import redact
from app.llm.port import Llm, LlmResult
from app.schemas import DraftAnswer, DraftExtraction, DraftLab, DraftQuiz

log = logging.getLogger("sysmaster.ai.pii")


class RedactingLlm:
    def __init__(self, inner: Llm):
        self.inner = inner

    def _clean(self, kind: str, user: str) -> str:
        r = redact(user)
        if r.counts:
            # Seulement les nombres : le texte masqué n'est jamais journalisé.
            log.info("pii masquée avant %s : %s", kind, ",".join(f"{k}={v}" for k, v in sorted(r.counts.items())))
        return r.text

    async def answer(self, system: str, user: str) -> LlmResult[DraftAnswer]:
        return await self.inner.answer(system, self._clean("answer", user))

    async def answer_stream(self, system: str, user: str) -> AsyncIterator[dict[str, Any] | LlmResult[DraftAnswer]]:
        async for item in self.inner.answer_stream(system, self._clean("answer_stream", user)):
            yield item

    async def extract(self, system: str, user: str) -> LlmResult[DraftExtraction]:
        return await self.inner.extract(system, self._clean("extract", user))

    async def generate_quiz(self, system: str, user: str) -> LlmResult[DraftQuiz]:
        return await self.inner.generate_quiz(system, self._clean("generate_quiz", user))

    async def generate_lab(self, system: str, user: str) -> LlmResult[DraftLab]:
        return await self.inner.generate_lab(system, self._clean("generate_lab", user))
