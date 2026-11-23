from dataclasses import dataclass, field
from typing import Literal, Protocol

from app.schemas import DraftAnswer, Usage


@dataclass
class LlmResult:
    draft: DraftAnswer | None
    outcome: Literal["answered", "refused"]
    model: str
    usage: Usage = field(default_factory=Usage)


class Llm(Protocol):
    async def answer(self, system: str, user: str) -> LlmResult: ...
