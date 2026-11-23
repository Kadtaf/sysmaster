"""Évaluation de l'assistant et de l'extraction de symptômes sur les jeux de référence.

    uv run python -m evals.run                        # modèle factice : contrôles indépendants du modèle
    uv run python -m evals.run --llm claude           # vrai modèle (ANTHROPIC_API_KEY, payant)
    uv run python -m evals.run --llm claude --judge   # + juge par modèle (fidélité, pédagogie)
    uv run python -m evals.run --core-url http://localhost:4000/api/v1   # vraie recherche de l'API

Écrit un rapport dans evals/reports/ et sort en erreur si un seuil de evals/thresholds.toml
n'est pas atteint. Les attentes sont dans evals/golden/ : on ne les ajuste pas pour faire passer
un cas, on corrige le système (ou on documente pourquoi l'attente était fausse).
"""

import argparse
import asyncio
import json
import re
import sys
import tomllib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from app.agents.router import route
from app.llm.claude import ClaudeLlm
from app.llm.fake import FakeLlm
from app.orchestrator import ask
from app.rag.retriever import CoreApiRetriever, Document, Retriever
from app.schemas import RISK_ORDER, AskRequest
from evals.retriever import SnapshotRetriever

HERE = Path(__file__).parent


@dataclass
class CaseResult:
    id: str
    checks: dict[str, bool | None] = field(default_factory=dict)
    details: list[str] = field(default_factory=list)


class Recording:
    """Garde les documents fournis au modèle : le juge doit voir exactement le même contexte."""

    def __init__(self, inner: Retriever):
        self.inner = inner
        self.last: list[Document] = []

    async def search(self, question: str, platform: str | None, limit: int = 4) -> list[Document]:
        self.last = await self.inner.search(question, platform, limit)
        return self.last


def rate(results: list[CaseResult], check: str) -> float | None:
    values = [r.checks[check] for r in results if r.checks.get(check) is not None]
    return round(sum(values) / len(values), 3) if values else None


async def run_assistant(llm, retriever: Retriever, judge=None) -> tuple[dict, list[CaseResult]]:
    cases = tomllib.loads((HERE / "golden" / "assistant.toml").read_text(encoding="utf-8"))["case"]
    rec = Recording(retriever)
    results, pedagogy = [], []
    for case in cases:
        r = CaseResult(case["id"])
        platform = case.get("platform")
        got = route(case["question"], platform)
        r.checks["routing_agent"] = got.agent == case["expect_agent"]
        if "expect_domain" in case:
            r.checks["routing_domain"] = got.domain == case["expect_domain"]
        if not r.checks["routing_agent"] or r.checks.get("routing_domain") is False:
            r.details.append(f"routage : {got.agent}/{got.domain}")

        res = await ask(AskRequest(question=case["question"], platform=platform, level=case.get("level", "beginner")), llm, rec)
        answer = res.answer
        retrieved = {d.slug for d in rec.last}
        cited = {s.slug for s in answer.sources}
        expected = set(case.get("expect_sources", []))
        if expected:
            r.checks["retrieval"] = bool(expected & retrieved)
            r.checks["citation"] = bool(expected & cited)
            if not r.checks["retrieval"]:
                r.details.append(f"aucune fiche attendue retrouvée ({sorted(retrieved)})")
        commands = [s.command for s in answer.steps if s.command]
        bad = [c for c in commands for p in case.get("forbid", []) if re.search(p, c, re.IGNORECASE)]
        r.checks["no_forbidden_command"] = not bad
        if bad:
            r.details.append(f"commande interdite : {bad}")
        if answer.steps:
            # Comprendre avant d'exécuter : chaque commande a son pourquoi, et l'on observe avant de modifier.
            r.checks["why_before_how"] = all(s.why.strip() for s in answer.steps if s.command)
            r.checks["observe_first"] = RISK_ORDER.index(answer.steps[0].risk) <= RISK_ORDER.index("low")
            r.checks["high_risk_masked"] = all(
                s.masked_until_risks_read for s in answer.steps if s.command and s.risk in ("high", "critical")
            )
        if case.get("expect_out_of_scope"):
            r.checks["out_of_scope"] = answer.out_of_scope
        r.checks["verified"] = answer.verified if not case.get("expect_out_of_scope") else None
        r.checks["answered"] = res.outcome == "answered"
        if judge is not None and res.outcome == "answered" and not case.get("expect_out_of_scope"):
            verdict = await judge.judge(case["question"], rec.last, answer)
            if verdict:
                r.checks["judge_grounded"] = verdict.grounded
                r.checks["judge_safe"] = verdict.safe
                pedagogy.append(verdict.pedagogy)
                if verdict.unsupported_claims:
                    r.details.append(f"non appuyé : {verdict.unsupported_claims}")
        results.append(r)

    names = sorted({k for r in results for k in r.checks})
    metrics = {k: rate(results, k) for k in names}
    if pedagogy:
        metrics["judge_pedagogy_mean"] = round(sum(pedagogy) / len(pedagogy), 2)
    return metrics, results


async def run_extract(llm) -> tuple[dict, list[CaseResult]] | None:
    try:
        from app.diagnostic.extract import extract  # noqa: I001 (module absent avant la PR d'extraction)
        from app.schemas import ExtractRequest
    except ImportError:
        return None  # extraction pas encore présente dans cette version du service
    cases = tomllib.loads((HERE / "golden" / "extract.toml").read_text(encoding="utf-8"))["case"]
    catalogue = json.loads((HERE / "golden" / "catalogue.json").read_text(encoding="utf-8"))
    tp = fp = fn = 0
    results = []
    for case in cases:
        r = CaseResult(case["id"])
        res = await extract(
            ExtractRequest(platform="windows", description=case["description"], evidence=case.get("evidence", ""), catalogue=catalogue), llm
        )
        got, want = {s.code for s in res.symptoms}, set(case["expect"])
        tp, fp, fn = tp + len(got & want), fp + len(got - want), fn + len(want - got)
        r.checks["exact"] = got == want
        if got != want:
            r.details.append(f"en trop : {sorted(got - want)} ; manquants : {sorted(want - got)}")
        results.append(r)
    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3), "exact": rate(results, "exact")}, results


def check_thresholds(report: dict, llm: str) -> list[str]:
    thresholds = tomllib.loads((HERE / "thresholds.toml").read_text(encoding="utf-8"))
    failures = []
    for suite, metrics in thresholds.get(llm, {}).items():
        for name, minimum in metrics.items():
            value = report.get(suite, {}).get("metrics", {}).get(name)
            if value is not None and value < minimum:
                failures.append(f"{suite}.{name} = {value} < {minimum}")
    return failures


def markdown(report: dict) -> str:
    lines = [f"# Évaluation — {report['date']} — modèle {report['llm']}", ""]
    for suite in ("assistant", "extract"):
        if suite not in report:
            continue
        lines += [f"## {suite}", "", "| Mesure | Valeur |", "|---|---|"]
        lines += [f"| {k} | {v} |" for k, v in report[suite]["metrics"].items()]
        failed = [c for c in report[suite]["cases"] if c["details"]]
        if failed:
            lines += ["", "Cas à examiner :", ""] + [f"- `{c['id']}` : {' ; '.join(c['details'])}" for c in failed]
        lines.append("")
    if report["failures"]:
        lines += ["## Seuils non atteints", ""] + [f"- {f}" for f in report["failures"]]
    return "\n".join(lines) + "\n"


async def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--llm", choices=["fake", "claude"], default="fake")
    p.add_argument("--model", default="claude-opus-5-5")
    p.add_argument("--effort", default="medium")
    p.add_argument("--judge", action="store_true", help="juge par modèle (exige --llm claude ; payant)")
    p.add_argument("--core-url", help="utiliser la recherche de l'API cœur au lieu de l'instantané")
    p.add_argument("--suite", choices=["all", "assistant", "extract"], default="all")
    args = p.parse_args(argv)

    llm = ClaudeLlm(args.model, args.effort, 8000) if args.llm == "claude" else FakeLlm()
    retriever = CoreApiRetriever(args.core_url) if args.core_url else SnapshotRetriever()
    judge = None
    if args.judge:
        if args.llm != "claude":
            print("--judge exige --llm claude.", file=sys.stderr)
            return 2
        from evals.judge import ClaudeJudge

        judge = ClaudeJudge(args.model)

    report: dict = {
        "date": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "llm": args.llm if args.llm == "fake" else f"{args.model} ({args.effort})",
    }
    if args.suite in ("all", "assistant"):
        metrics, results = await run_assistant(llm, retriever, judge)
        report["assistant"] = {"metrics": metrics, "cases": [r.__dict__ for r in results]}
    if args.suite in ("all", "extract"):
        out = await run_extract(llm)
        if out is None:
            print("Suite « extract » ignorée : l'extraction de symptômes n'est pas dans cette version du service.")
        else:
            metrics, results = out
            report["extract"] = {"metrics": metrics, "cases": [r.__dict__ for r in results]}
    report["failures"] = check_thresholds(report, args.llm)

    out_dir = HERE / "reports"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    (out_dir / f"{stamp}-{args.llm}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    md = markdown(report)
    (out_dir / f"{stamp}-{args.llm}.md").write_text(md, encoding="utf-8")
    print(md)
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
