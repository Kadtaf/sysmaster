"""Le banc d'évaluation lui-même : jeux de référence valides, seuils, rapport, exécution hors ligne."""

import tomllib
from pathlib import Path

from app.llm.fake import FakeLlm
from evals import run
from evals.retriever import SnapshotRetriever

GOLDEN = Path(run.HERE) / "golden"


def test_jeux_de_reference_bien_formes() -> None:
    cases = tomllib.loads((GOLDEN / "assistant.toml").read_text(encoding="utf-8"))["case"]
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)), "identifiants en double"
    slugs = {c["slug"] for c in SnapshotRetriever().commands}
    for c in cases:
        assert c["expect_agent"] in ("tutor", "diagnostician"), c["id"]
        # Une source attendue doit exister dans l'instantané, sinon le cas ne peut jamais passer.
        assert set(c.get("expect_sources", [])) <= slugs, c["id"]


async def test_recherche_hors_ligne_filtre_la_plateforme() -> None:
    docs = await SnapshotRetriever().search("voir les journaux d'un service avec journalctl", "linux")
    assert docs and docs[0].slug == "linux-journalctl"
    assert all(d.slug.startswith("linux-") for d in docs)


def test_seuils() -> None:
    report = {"assistant": {"metrics": {"retrieval": 0.5, "routing_agent": 1.0}}}
    failures = run.check_thresholds(report, "fake")
    assert failures == ["assistant.retrieval = 0.5 < 0.8"]
    # Une mesure absente (suite non jouée) n'est pas un échec.
    assert run.check_thresholds({}, "fake") == []


def test_rapport_markdown() -> None:
    report = {
        "date": "2026-11-23 10:00 UTC",
        "llm": "fake",
        "assistant": {"metrics": {"retrieval": 0.9}, "cases": [{"id": "x", "checks": {}, "details": ["aucune fiche"]}]},
        "failures": [],
    }
    md = run.markdown(report)
    assert "| retrieval | 0.9 |" in md and "`x` : aucune fiche" in md


async def test_evaluation_factice_complete() -> None:
    metrics, results = await run.run_assistant(FakeLlm(), SnapshotRetriever())
    assert len(results) >= 20
    # Les garde-fous ne dépendent pas du modèle : ils doivent tenir à 100 %.
    assert metrics["no_forbidden_command"] == 1.0
    assert metrics["high_risk_masked"] == 1.0
    assert not run.check_thresholds({"assistant": {"metrics": metrics}}, "fake")


async def test_suite_extraction_executable() -> None:
    # Le modèle factice ne repère rien : précision parfaite par convention, rappel nul.
    metrics, results = await run.run_extract(FakeLlm())
    assert len(results) == 10
    assert metrics["recall"] == 0.0 and metrics["precision"] == 1.0
