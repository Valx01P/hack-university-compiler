"""Settings: every value the app reads from the environment, checked once at startup.

Precedence, highest first: real environment variables, then `.env`, then the defaults
below. A value that does not validate stops the app before it serves a request.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import AwareDatetime, BeforeValidator, Field, SecretStr
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def parse_list(value: object) -> object:
    """Reads a list from a JSON array (`["a", "b"]`) or a comma-separated string (`a,b`)."""
    if not isinstance(value, str):
        return value
    text = value.strip()
    if text.startswith("["):
        return json.loads(text)
    return [item.strip() for item in text.split(",") if item.strip()]


StrList = Annotated[list[str], NoDecode, BeforeValidator(parse_list)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Taskboard API"
    environment: Literal["development", "test", "production"] = "development"

    database_url: str = "postgresql+psycopg://taskboard:taskboard@db:5432/taskboard"
    test_database_url: str = "postgresql+psycopg://taskboard:taskboard@db:5432/taskboard_test"
    db_pool_size: int = Field(default=5, ge=1)
    db_max_overflow: int = Field(default=5, ge=0)

    jwt_secret: SecretStr = Field(min_length=32)
    access_token_minutes: int = Field(default=24 * 60, ge=1)

    cors_origins: StrList = []
    internal_api_key: SecretStr = Field(min_length=16)

    hu_fixed_time: AwareDatetime | None = None
    mail_log: Path = Path("var/mail.log")

    default_page_size: int = Field(default=20, ge=1)
    max_page_size: int = Field(default=100, ge=1)

    @property
    def docs_enabled(self) -> bool:
        return self.environment != "production"


@lru_cache
def get_settings() -> Settings:
    # jwt_secret and internal_api_key have no defaults, so they must come from .env
    # or the environment.
    return Settings()  # type: ignore[call-arg]
