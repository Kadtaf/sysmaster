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


@lru_cache
def settings() -> Settings:
    return Settings()
