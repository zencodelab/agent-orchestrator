"""Application configuration loaded from environment / .env.

A single cached ``Settings`` instance is exposed via :func:`get_settings`.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    openai_api_key: str | None = None
    tavily_api_key: str | None = None

    use_mock_llm: bool = False
    default_model: str = "gpt-4o-mini"
    # Per-token delay for the mock LLM (ms). Tune to make streaming more/less visible.
    mock_token_delay_ms: int = 20

    database_url: str = "sqlite:///./agentforge.db"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def mock_mode(self) -> bool:
        """Run with the deterministic mock LLM when forced or when no key is set."""
        return self.use_mock_llm or not self.openai_api_key

    @property
    def use_real_search(self) -> bool:
        return bool(self.tavily_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
