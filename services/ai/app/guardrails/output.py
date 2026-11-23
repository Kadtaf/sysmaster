"""Validateur de sortie : transforme le brouillon du modèle en réponse sûre et citée."""

from app.guardrails.destructive import classify, max_risk
from app.rag.retriever import Document
from app.schemas import Answer, DraftAnswer, Source, Step

HIGH = ("high", "critical")


def enforce(draft: DraftAnswer, documents: list[Document]) -> Answer:
    notes: list[str] = []

    # Citations : seulement des documents réellement fournis au modèle (aucune URL inventée possible).
    by_ref = {d.ref: d for d in documents}
    sources: list[Source] = []
    for ref in dict.fromkeys(draft.source_refs):
        doc = by_ref.get(ref)
        if doc is None:
            notes.append(f"Citation [{ref}] ignorée : ce document n'a pas été fourni.")
            continue
        sources.append(Source(ref=ref, title=doc.title, url=doc.url, kind=doc.kind, slug=doc.slug))

    steps: list[Step] = []
    for s in draft.steps:
        command = (s.command or "").strip() or None
        risk = s.risk
        flagged: list[str] = []
        if command:
            floor, flagged = classify(command)
            raised = max_risk(risk, floor)
            if raised != risk:
                notes.append(f"Étape « {s.title} » : risque relevé de {risk} à {raised} ({', '.join(flagged)}).")
                risk = raised
            if not s.why.strip():
                # Pas de commande sans pourquoi : on la retire plutôt que de la laisser copier.
                notes.append(f"Étape « {s.title} » : commande retirée, faute d'explication.")
                command = None
        risk_note = s.risk_note.strip() or (
            "Aucun : lecture seule." if risk == "none" else "Risque non décrit : vérifiez avant d'exécuter."
        )
        steps.append(
            Step(
                title=s.title,
                why=s.why,
                how=s.how,
                command=command,
                shell=s.shell if command else None,
                when=s.when,
                risk=risk,
                risk_note=risk_note,
                alternatives=s.alternatives,
                masked_until_risks_read=bool(command) and risk in HIGH,
                copy_allowed=bool(command) and risk not in HIGH,
                flagged_by=flagged,
            )
        )

    return Answer(
        summary=draft.summary,
        explanation=draft.explanation,
        steps=steps,
        sources=sources,
        check_questions=draft.check_questions[:3],
        verified=bool(sources),
        out_of_scope=draft.out_of_scope,
        notes=notes,
    )
