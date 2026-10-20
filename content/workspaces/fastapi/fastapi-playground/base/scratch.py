"""A place to try things without a server: run it with `uv run python scratch.py`.

It reads DATABASE_URL (from .env, or the environment), connects to this workspace's own
PostgreSQL database, and asks the server for its version.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str


engine = create_engine(Settings().database_url)

with engine.connect() as connection:
    version = connection.execute(text("SELECT version()")).scalar_one()
    print(version)
