from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator

from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEFAULT_CORS_ORIGINS = [
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
]
_DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


class Settings(BaseSettings):
  # FastAPI
  app_name: str = "Gas Delivery API"
  environment: str = "development"
  debug: bool = False

  # Database
  database_url: str = Field(..., alias="DATABASE_URL")
  sql_echo: bool = False

  # Auth
  jwt_secret: str = Field(..., alias="JWT_SECRET")
  jwt_algorithm: str = "HS256"
  access_token_expires_minutes: int = 60

  # Inventory
  business_tz: str = "Europe/Berlin"
  allow_negative_admin_ids: str = ""
  DEFAULT_TENANT_ID: str = _DEFAULT_TENANT_ID

  # CORS
  cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: list(_DEFAULT_CORS_ORIGINS))

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

  @field_validator("database_url", mode="before")
  @classmethod
  def _normalize_database_url(cls, value: object) -> object:
    if isinstance(value, str) and value.startswith("postgres://"):
      return value.replace("postgres://", "postgresql://", 1)
    return value

  @field_validator("cors_origins", mode="before")
  @classmethod
  def _coerce_cors_origins(cls, value: object) -> object:
    if isinstance(value, str):
      return [item.strip() for item in value.split(",") if item.strip()]
    return value

  @field_validator("cors_origins")
  @classmethod
  def _validate_cors_origins(cls, value: list[str]) -> list[str]:
    if not value:
      return list(_DEFAULT_CORS_ORIGINS)
    if any(origin == "*" for origin in value):
      raise ValueError("Wildcard CORS origins are not allowed when credentials are enabled")
    return value


@lru_cache
def get_settings() -> Settings:
  return Settings()


DEFAULT_TENANT_ID = _DEFAULT_TENANT_ID

