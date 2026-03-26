from __future__ import annotations

from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from pydantic import ValidationError

from app.config import Settings
from app.routers.orders import whatsapp_link


def test_settings_require_explicit_sensitive_env(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)

    try:
        Settings(_env_file=None)
        raise AssertionError("Settings should require DATABASE_URL and JWT_SECRET")
    except ValidationError as exc:
        fields = {error["loc"][0] for error in exc.errors()}
        assert fields & {"DATABASE_URL", "database_url"}
        assert fields & {"JWT_SECRET", "jwt_secret"}


def test_settings_reject_wildcard_cors(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:5432/gas_app")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("CORS_ORIGINS", "*")

    try:
        Settings(_env_file=None)
        raise AssertionError("Wildcard CORS origin should be rejected")
    except ValidationError as exc:
        assert "Wildcard CORS origins are not allowed" in str(exc)


def test_settings_parse_explicit_local_origins(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@127.0.0.1:5432/gas_app")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "http://localhost:8081,http://127.0.0.1:19006",
    )

    settings = Settings(_env_file=None)

    assert settings.debug is False
    assert settings.sql_echo is False
    assert settings.database_url == "postgresql://user:pass@127.0.0.1:5432/gas_app"
    assert settings.cors_origins == ["http://localhost:8081", "http://127.0.0.1:19006"]


def test_whatsapp_link_is_url_encoded() -> None:
    order_id = "order-1"
    customer_id = "customer-1"
    session = SimpleNamespace(
        get=lambda model, key: (
            SimpleNamespace(
                id=order_id,
                kind="order",
                is_reversed=False,
                customer_id=customer_id,
                installed=2,
                gas_type="12kg",
                happened_at="2025-01-02T10:00:00",
                received=1,
                paid=100,
                total=120,
            )
            if key == order_id
            else SimpleNamespace(id=customer_id, phone="+49 171 555 0101")
            if key == customer_id
            else None
        )
    )

    url = whatsapp_link(order_id, session)["url"]
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "wa.me"
    assert parsed.path == "/491715550101"
    assert " " not in url
    assert "\n" not in url
    assert query["text"][0].startswith("السلام عليكم")
