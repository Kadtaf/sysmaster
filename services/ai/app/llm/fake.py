"""Modèle factice, déterministe et gratuit : développement local sans clé, et tests.
Il construit une réponse plausible à partir des documents fournis, sans rien inventer."""

import re
from collections.abc import AsyncIterator
from typing import Any

from app.llm.port import LlmResult
from app.schemas import DraftAnswer, DraftExtraction, DraftLogFinding, DraftStep, DraftSymptom


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

    async def answer_stream(self, system: str, user: str) -> AsyncIterator[dict[str, Any] | LlmResult]:
        """Rejoue la réponse factice mot à mot, comme un vrai flux (résumé puis explication)."""
        result = await self.answer(system, user)
        partial: dict[str, Any] = {}
        for field in ("summary", "explanation"):
            words = getattr(result.draft, field).split(" ")
            for i in range(1, len(words) + 1):
                partial[field] = " ".join(words[:i])
                yield dict(partial)
        yield result

    async def extract(self, system: str, user: str) -> LlmResult[DraftExtraction]:
        """Repère les libellés du catalogue présents tels quels dans le texte (sans accents ni casse)."""
        from app.diagnostic.extract import unaccent

        catalogue = re.findall(r"^- (\S+) : (.+)$", system, re.MULTILINE)
        text = user
        flat = unaccent(text).lower()
        symptoms = []
        for code, label in catalogue:
            i = flat.find(unaccent(label).lower())
            if i >= 0:
                symptoms.append(DraftSymptom(code=code, quote=text[i : i + len(label)]))
        journal = re.search(r"<journal>\n(.*)\n</journal>", user, re.DOTALL)
        findings = [
            DraftLogFinding(summary="Ligne d'erreur relevée (modèle factice).", quote=line.strip())
            for line in (journal.group(1).splitlines() if journal else [])
            if re.search(r"error|erreur|critical|critique|fail", line, re.IGNORECASE)
        ][:5]
        return LlmResult(draft=DraftExtraction(symptoms=symptoms, log_findings=findings), outcome="answered", model=self.model)
