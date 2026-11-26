import hmac
import json
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse

from app.config import Settings, docs_index, profile_store, settings
from app.diagnostic.extract import extract
from app.labs import generate as generate_lab
from app.llm.claude import ClaudeLlm
from app.llm.fake import FakeLlm
from app.llm.port import Llm
from app.llm.redacting import RedactingLlm
from app.orchestrator import ask, ask_stream
from app.quiz import generate as generate_quiz
from app.rag.retriever import CompositeRetriever, CoreApiRetriever, OfficialDocsRetriever, Retriever
from app.schemas import AskRequest, AskResponse, ExtractRequest, ExtractResponse, LabRequest, LabResponse, QuizRequest, QuizResponse

logging.basicConfig(level=logging.INFO, format='{"level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}')
log = logging.getLogger("sysmaster.ai")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Charge le modèle de plongement au démarrage plutôt qu'à la première question (plusieurs secondes).
    if docs_index() is not None:
        log.info("index de documentation officielle activé (%s)", settings().qdrant_collection)
    yield


app = FastAPI(title="SysMaster AI", version="0.1.0", docs_url="/docs", lifespan=lifespan)


def get_llm(cfg: Settings = Depends(settings)) -> Llm:
    # Le masquage s'applique aussi au modèle factice : les tests voient ce que verrait Claude.
    if cfg.ai_llm == "claude":
        return RedactingLlm(ClaudeLlm(cfg.ai_model, cfg.ai_effort, cfg.ai_max_tokens))
    return RedactingLlm(FakeLlm())


def get_retriever(cfg: Settings = Depends(settings)) -> Retriever:
    parts: list[tuple[Retriever, int]] = [(CoreApiRetriever(cfg.core_api_url), cfg.rag_kb_documents)]
    index = docs_index()
    if index is not None:
        parts.append((OfficialDocsRetriever(index), cfg.rag_official_documents))
    return CompositeRetriever(parts)


async def get_profiles() -> dict[str, str]:
    return await profile_store().get()


def require_token(x_ai_token: str = Header(default=""), cfg: Settings = Depends(settings)) -> None:
    """Le service n'est appelé que par l'API cœur, qui authentifie l'utilisateur et applique les quotas."""
    if not hmac.compare_digest(x_ai_token, cfg.ai_service_token):
        raise HTTPException(status_code=401, detail="Jeton de service invalide")


@app.get("/health")
def health(cfg: Settings = Depends(settings)) -> dict:
    return {
        "status": "ok",
        "llm": cfg.ai_llm,
        "model": cfg.ai_model if cfg.ai_llm == "claude" else "fake",
        "officialDocs": "qdrant" if cfg.qdrant_url else "disabled",
    }


@app.post("/v1/ask", response_model=AskResponse, response_model_by_alias=True, dependencies=[Depends(require_token)])
async def ask_endpoint(
    req: AskRequest,
    llm: Llm = Depends(get_llm),
    retriever: Retriever = Depends(get_retriever),
    profiles: dict[str, str] = Depends(get_profiles),
) -> AskResponse:
    res = await ask(req, llm, retriever, profiles)
    log.info(
        "ask agent=%s domain=%s outcome=%s latency_ms=%s sources=%s",
        res.agent,
        res.domain,
        res.outcome,
        res.latency_ms,
        len(res.answer.sources),
    )
    return res


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/v1/ask/stream", dependencies=[Depends(require_token)])
async def ask_stream_endpoint(
    req: AskRequest,
    llm: Llm = Depends(get_llm),
    retriever: Retriever = Depends(get_retriever),
    profiles: dict[str, str] = Depends(get_profiles),
) -> StreamingResponse:
    """Server-Sent Events : meta, delta…, puis answer (même contenu que /v1/ask) ou error."""

    async def events():
        try:
            async for event, data in ask_stream(req, llm, retriever, profiles):
                if event == "answer":
                    log.info(
                        "ask(stream) agent=%s domain=%s outcome=%s latency_ms=%s",
                        data["agent"],
                        data["domain"],
                        data["outcome"],
                        data["latencyMs"],
                    )
                yield sse(event, data)
        except Exception as err:  # l'en-tête 200 est déjà parti : l'erreur voyage dans le flux
            log.exception("ask(stream) interrompu")
            yield sse("error", {"message": f"{type(err).__name__}"})

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/v1/diagnostic/extract", response_model=ExtractResponse, response_model_by_alias=True, dependencies=[Depends(require_token)])
async def extract_endpoint(req: ExtractRequest, llm: Llm = Depends(get_llm)) -> ExtractResponse:
    res = await extract(req, llm)
    log.info(
        "extract symptoms=%s findings=%s dropped=%s latency_ms=%s", len(res.symptoms), len(res.log_findings), len(res.notes), res.latency_ms
    )
    return res


@app.post("/v1/quiz/generate", response_model=QuizResponse, response_model_by_alias=True, dependencies=[Depends(require_token)])
async def quiz_endpoint(req: QuizRequest, llm: Llm = Depends(get_llm)) -> QuizResponse:
    res = await generate_quiz(req, llm)
    log.info("quiz questions=%s dropped=%s latency_ms=%s outcome=%s", len(res.questions), len(res.notes), res.latency_ms, res.outcome)
    return res


@app.post("/v1/labs/generate", response_model=LabResponse, response_model_by_alias=True, dependencies=[Depends(require_token)])
async def lab_endpoint(req: LabRequest, llm: Llm = Depends(get_llm)) -> LabResponse:
    res = await generate_lab(req, llm)
    log.info(
        "lab ok=%s notes=%s repair=%s latency_ms=%s outcome=%s",
        res.lab is not None,
        len(res.notes),
        bool(req.previous),
        res.latency_ms,
        res.outcome,
    )
    return res
