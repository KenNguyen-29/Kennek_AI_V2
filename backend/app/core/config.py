from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    groq_api_key: str = Field(validation_alias="GROQ_API_KEY")
    tavily_api_key: str = Field(validation_alias="TAVILY_API_KEY")
    model_name: str = Field(
        default="llama-3.3-70b-versatile",
        validation_alias="MODEL_NAME",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
