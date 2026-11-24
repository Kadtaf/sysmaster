from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration lue dans l'environnement (voir .env.example à la racine du dépôt)."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    # « claude » en production ; « fake » pour le développement et les tests, sans clé ni coût.
    ai_llm: str = "fake"
    ai_model: str = "claude-opus-5-5"
    # Réponses pédagogiques courtes : « medium » suffit ; à mesurer avant de monter.
    ai_effort: str = "medium"
    ai_max_tokens: int = 8000
    # API cœur, interrogée pour la base de connaissances (le service IA ne lit pas la base directement).
    core_api_url: str = "http://localhost:4000/api/v1"
    # Jeton partagé avec l'API cœur : le service n'est pas exposé publiquement.
    ai_service_token: str = "dev-only-ai-token"
    # Profils d'agents publiés dans le back-office : relus au plus tard après ce délai (secondes).
    profiles_ttl_seconds: float = 60.0
    # Documentation officielle (Qdrant). Vide : seules les fiches SysMaster servent de contexte.
    qdrant_url: str = ""
    qdrant_collection: str = "official_docs"
    # « fastembed » (modèle multilingue local, inclus dans l'image) ; « hash » pour les tests.
    ai_embedder: str = "hash"
    embed_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embed_cache_dir: str | None = None
    embed_offline: bool = False
    # Similarité minimale d'un passage (cosinus) : en dessous, il ferait plus de bruit que de bien.
    rag_min_similarity: float = 0.3
    rag_kb_documents: int = 3
    rag_official_documents: int = 3


@lru_cache
def settings() -> Settings:
    return Settings()


@lru_cache
def embedder():
    """Un seul modèle chargé par processus (plusieurs centaines de Mo en mémoire)."""
    from app.rag.embedder import FastEmbedder, HashEmbedder

    cfg = settings()
    if cfg.ai_embedder == "fastembed":
        return FastEmbedder(cfg.embed_model, cfg.embed_cache_dir, cfg.embed_offline)
    return HashEmbedder()


@lru_cache
def docs_index():
    from qdrant_client import AsyncQdrantClient

    from app.rag.index import DocsIndex

    cfg = settings()
    if not cfg.qdrant_url:
        return None
    return DocsIndex(AsyncQdrantClient(url=cfg.qdrant_url), embedder(), cfg.qdrant_collection, cfg.rag_min_similarity)


@lru_cache
def profile_store():
    from app.agents.store import ProfileStore

    cfg = settings()
    return ProfileStore(cfg.core_api_url, cfg.ai_service_token, cfg.profiles_ttl_seconds)
