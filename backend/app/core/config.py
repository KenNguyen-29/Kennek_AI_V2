from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str = Field(validation_alias="DATABASE_URL")
    groq_api_key: str = Field(validation_alias="GROQ_API_KEY")
    tavily_api_key: str = Field(validation_alias="TAVILY_API_KEY")
    # Default / fallback chat model (text path). Router may override per request.
    model_name: str = Field(
        default="llama-3.3-70b-versatile",
        validation_alias="MODEL_NAME",
    )
    enable_content_moderation: bool = Field(
        default=False,
        validation_alias="ENABLE_CONTENT_MODERATION",
    )

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
