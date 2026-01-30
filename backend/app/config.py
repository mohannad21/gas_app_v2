from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_DEFAULT_DB_PATH = (Path(__file__).resolve().parent.parent / "gas_app.db").as_posix()
_DEFAULT_DATABASE_URL = f"sqlite:///{_DEFAULT_DB_PATH}"


class Settings(BaseSettings):
  # FastAPI
  app_name: str = "Gas Delivery API"
  environment: str = "development"
  debug: bool = True

  # Database
  database_url: str = _DEFAULT_DATABASE_URL

  # Auth
  jwt_secret: str = "dev-secret"
  jwt_algorithm: str = "HS256"
  access_token_expires_minutes: int = 60

  # Inventory
  business_tz: str = "Europe/Berlin"
  allow_negative_admin_ids: str = ""

  # CORS
  cors_origins: list[str] = ["*"]

  model_config = SettingsConfigDict(
    env_file=".env",
    env_file_encoding="utf-8",
    extra="ignore",
  )


@lru_cache
def get_settings() -> Settings:
  return Settings()
