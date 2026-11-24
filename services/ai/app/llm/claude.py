"""Adaptateur Claude (Anthropic). Sortie structurée validée par Pydantic : le modèle ne peut pas
renvoyer autre chose que le schéma demandé (DraftAnswer, DraftExtraction), que les garde-fous
vérifient ensuite."""

import anthropic
from pydantic import BaseModel

from app.llm.port import LlmResult
from app.schemas import DraftAnswer, DraftExtraction, Usage


class ClaudeLlm:
    def __init__(self, model: str, effort: str, max_tokens: int, client: anthropic.AsyncAnthropic | None = None):
        self.model = model
        self.effort = effort
        self.max_tokens = max_tokens
        self.client = client or anthropic.AsyncAnthropic()

    async def answer(self, system: str, user: str) -> LlmResult[DraftAnswer]:
        return await self._parse(system, user, DraftAnswer, self.effort)

    async def extract(self, system: str, user: str) -> LlmResult[DraftExtraction]:
        # Repérer des symptômes dans un texte est une tâche simple : effort « low » suffit et répond plus vite.
        return await self._parse(system, user, DraftExtraction, "low")

    async def _parse[T: BaseModel](self, system: str, user: str, schema: type[T], effort: str) -> LlmResult[T]:
        response = await self.client.beta.messages.parse(
            model=self.model,
            max_tokens=self.max_tokens,
            # Prompt système stable : mis en cache d'une requête à l'autre (le contexte variable est dans le message).
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_format=schema,
            output_config={"effort": effort},
            # Si le modèle décline par prudence, l'API rejoue la requête sur un modèle de repli adapté.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        u = response.usage
        usage = Usage(
            input_tokens=u.input_tokens,
            output_tokens=u.output_tokens,
            cache_read_tokens=u.cache_read_input_tokens or 0,
            cache_write_tokens=u.cache_creation_input_tokens or 0,
        )
        if response.stop_reason == "refusal" or response.parsed_output is None:
            return LlmResult(draft=None, outcome="refused", model=response.model, usage=usage)
        return LlmResult(draft=response.parsed_output, outcome="answered", model=response.model, usage=usage)
