from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from pydantic import BaseModel

from app.schemas import DraftAnswer, DraftExtraction, DraftQuiz, Usage


@dataclass
class LlmResult[T: BaseModel]:
    draft: T | None
    outcome: Literal["answered", "refused"]
    model: str
    usage: Usage = field(default_factory=Usage)


class Llm(Protocol):
    async def answer(self, system: str, user: str) -> LlmResult[DraftAnswer]: ...

    def answer_stream(self, system: str, user: str) -> AsyncIterator["dict[str, Any] | LlmResult[DraftAnswer]"]:
        """Brouillons partiels (JSON incomplet décodé) au fil de la génération, puis le résultat validé en dernier."""
        ...

    async def extract(self, system: str, user: str) -> LlmResult[DraftExtraction]: ...

    async def generate_quiz(self, system: str, user: str) -> LlmResult[DraftQuiz]: ...
