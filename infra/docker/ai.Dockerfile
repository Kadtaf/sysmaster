# syntax=docker/dockerfile:1
# Service IA (FastAPI). Dépendances figées par uv.lock ; l'image ne contient ni uv ni les outils de dev.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY services/ai/pyproject.toml services/ai/uv.lock ./
# Extra « fastembed » : modèle de plongement multilingue exécuté localement (ONNX), pour le RAG.
RUN uv sync --frozen --no-dev --extra fastembed --no-install-project
# Le modèle est téléchargé à la construction : au démarrage, aucun accès réseau ni écriture disque.
ARG EMBED_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
RUN .venv/bin/python -c "from fastembed import TextEmbedding; TextEmbedding('${EMBED_MODEL}', cache_dir='/app/models')"
COPY services/ai/sources.toml ./
COPY services/ai/app app

FROM python:3.12-slim AS runtime
ARG APP_VERSION=dev
ARG EMBED_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV APP_VERSION=$APP_VERSION PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 \
    AI_EMBEDDER=fastembed EMBED_MODEL=$EMBED_MODEL EMBED_CACHE_DIR=/app/models EMBED_OFFLINE=true HF_HUB_OFFLINE=1
RUN useradd --uid 1000 --create-home ai
WORKDIR /app
COPY --from=build /app /app
USER ai
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
