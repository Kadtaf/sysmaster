"""Fige les fiches publiées de la base de connaissances dans evals/fixtures/kb.json.

    uv run python -m evals.snapshot --core-url http://localhost:4000/api/v1

Pourquoi un instantané : une évaluation doit être rejouable à l'identique. Si les fiches changent
entre deux mesures, on ne sait plus si c'est le prompt ou le contexte qui a fait varier le score.
On régénère l'instantané volontairement, en le disant dans le message de commit.
"""

import argparse
import asyncio
import json
from pathlib import Path

import httpx

OUT = Path(__file__).parent / "fixtures" / "kb.json"
KEEP = ["slug", "name", "platform", "riskLevel", "summary", "syntax", "why", "whenToUse", "context", "risks", "parameters", "examples"]


async def main(core_url: str) -> None:
    async with httpx.AsyncClient(base_url=core_url.rstrip("/"), timeout=10) as client:
        hits = (await client.get("/kb/commands")).json()
        commands = []
        for hit in sorted(hits, key=lambda h: h["slug"]):
            detail = (await client.get(f"/kb/commands/{hit['slug']}")).json()
            commands.append({k: detail.get(k) for k in KEEP})
    OUT.write_text(json.dumps(commands, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(commands)} fiches écrites dans {OUT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--core-url", default="http://localhost:4000/api/v1")
    asyncio.run(main(parser.parse_args().core_url))
