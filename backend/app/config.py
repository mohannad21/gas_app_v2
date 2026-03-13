from functools import lru_cache

from pydantic import field_validator

from pydantic_settings import BaseSettings, SettingsConfigDict


_DEFAULT_DATABASE_URL = "postgresql://postgres:password@localhost:5432/gas_db"


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

  @field_validator("debug", mode="before")
  @classmethod
  def _coerce_debug(cls, value: object) -> object:
    if isinstance(value, str):
      normalized = value.strip().lower()
      if normalized in {"release", "prod", "production"}:
        return False
      if normalized in {"debug", "dev", "development"}:
        return True
    return value


@lru_cache
def get_settings() -> Settings:
  return Settings()

