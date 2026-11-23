"""Modèle factice, déterministe et gratuit : développement local sans clé, et tests.
Il construit une réponse plausible à partir des documents fournis, sans rien inventer."""

import re

from app.llm.port import LlmResult
from app.schemas import DraftAnswer, DraftStep


class FakeLlm:
    model = "fake"

    async def answer(self, system: str, user: str) -> LlmResult:
        refs = [int(n) for n in re.findall(r"^\[(\d+)\] ", user, re.MULTILINE)]
        names = re.findall(r"^Commande : (\S+)", user, re.MULTILINE)
        steps = [
            DraftStep(
                title=f"Observer avec {name}",
                why="Comprendre l'état réel avant d'agir.",
                how=f"Lisez la fiche « {name} ».",
                command=None,
                shell=None,
                when="En premier.",
                risk="none",
                risk_note="Aucun : lecture seule.",
            )
            for name in names[:2]
        ]
        draft = DraftAnswer(
            summary="Réponse de démonstration (modèle factice) construite à partir de la base de connaissances.",
            explanation="Configurez AI_LLM=claude et une clé d'API pour obtenir une vraie réponse.",
            steps=steps,
            source_refs=refs[:2],
            check_questions=["Quelle étape est sans risque, et pourquoi ?"],
        )
        return LlmResult(draft=draft, outcome="answered", model=self.model)
