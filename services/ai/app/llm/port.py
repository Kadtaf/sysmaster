from dataclasses import dataclass, field
from typing import Literal, Protocol

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

    async def extract(self, system: str, user: str) -> LlmResult[DraftExtraction]: ...

    async def generate_quiz(self, system: str, user: str) -> LlmResult[DraftQuiz]: ...
