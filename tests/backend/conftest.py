from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine as _sa_create_engine, text
from sqlalchemy.pool import NullPool

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

BACKEND_ROOT = ROOT / "backend"
ENV_TEST = BACKEND_ROOT / ".env.test"
if ENV_TEST.exists():
    load_dotenv(ENV_TEST, override=True)

database_url_test = os.getenv("DATABASE_URL_TEST")
if database_url_test:
    os.environ["DATABASE_URL"] = database_url_test

_TEST_PERMISSIONS = [
    "customers:write", "collections:write", "company:write",
    "orders:write", "inventory:write", "expenses:write",
    "settings:write", "workers:manage", "prices:write",
]

_AUTH_TABLES = frozenset({
    "plans",
    "tenants",
    "users",
    "roles",
    "role_permissions",
    "tenant_memberships",
    "tenant_plan_subscriptions",
})

_SEED_IDS = {
    "plans": "test-plan",
    "tenants": None,
    "users": "test-user",
    "roles": "test-role",
}


def _seed_test_auth(engine) -> None:
    from app.config import DEFAULT_TENANT_ID
    from app.models import Plan, Role, RolePermission, Tenant, TenantMembership, TenantPlanSubscription, User
    from datetime import datetime, timezone
    from sqlmodel import Session, delete

    with Session(engine) as seed:
        # merge() upserts by PK — safe to call even if rows already exist
        seed.merge(Plan(id="test-plan", name="Test Plan"))
        seed.merge(Tenant(id=DEFAULT_TENANT_ID, name="Test Tenant", status="active"))
        seed.merge(User(id="test-user"))
        seed.merge(Role(id="test-role", name="Test Admin"))
        seed.flush()

        # auto-ID rows: delete first so we can re-insert cleanly
        seed.exec(delete(TenantMembership).where(TenantMembership.user_id == "test-user"))
        seed.exec(delete(RolePermission).where(RolePermission.role_id == "test-role"))
        seed.exec(delete(TenantPlanSubscription).where(TenantPlanSubscription.tenant_id == DEFAULT_TENANT_ID))
        seed.flush()

        seed.add(TenantPlanSubscription(
            tenant_id=DEFAULT_TENANT_ID, plan_id="test-plan",
            status="active", started_at=datetime.now(timezone.utc),
        ))
        for code in _TEST_PERMISSIONS:
            seed.add(RolePermission(role_id="test-role", permission_code=code))
        seed.add(TenantMembership(
            tenant_id=DEFAULT_TENANT_ID, user_id="test-user",
            role_id="test-role", is_active=True,
        ))
        seed.commit()


@pytest.fixture(scope="session")
def client() -> TestClient:
    db_url = os.getenv("DATABASE_URL_TEST") or os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL_TEST is not set. Tests require a Postgres database.")
    if db_url.startswith("sqlite"):
        pytest.fail("SQLite is not supported. Set DATABASE_URL to a Postgres URL.")
    if "test" not in db_url.lower() and os.getenv("ALLOW_TEST_DB_DROP") != "1":
        pytest.fail(
            "Refusing to run tests against a non-test database. "
            "Set DATABASE_URL_TEST or ALLOW_TEST_DB_DROP=1 if you really intend to wipe it."
        )

    os.environ["DATABASE_URL"] = db_url

    from app import config as app_config
    app_config.get_settings.cache_clear()
    from app import db as app_db
    from app import main as app_main
    import app.models  # noqa: F401 — registers all models in SQLModel.metadata before create_all

    app_db.engine.dispose()
    schema_engine = app_db.engine.execution_options(isolation_level="AUTOCOMMIT")
    with schema_engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(5951042)"))
        try:
            conn.execute(text("""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = current_database()
                AND pid <> pg_backend_pid()
            """))
            conn.execute(text("SELECT pg_sleep(0.1)"))
            conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(5951042)"))

    # NullPool: each session gets a fresh connection that closes immediately after use.
    # This eliminates pool-held connections that deadlock against TRUNCATE in teardown.
    app_db.engine.dispose()
    app_db.engine = _sa_create_engine(db_url, poolclass=NullPool)
    app_db.SQLModel.metadata.create_all(bind=app_db.engine)

    _seed_test_auth(app_db.engine)

    app_factory = getattr(app_main, "create_app", None)
    app = app_factory() if callable(app_factory) else app_main.app
    with TestClient(app) as test_client:
        from app.auth import create_access_token

        test_client.headers.update({"Authorization": f"Bearer {create_access_token('test-user')}"})
        yield test_client

    app_db.engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables(request) -> None:
    if "client" not in request.fixturenames:
        yield
        return
    if "shared_world" in request.fixturenames or "shared_baseline" in request.fixturenames:
        yield
        return
    _ = request.getfixturevalue("client")
    import app.db as app_db
    from app.config import DEFAULT_TENANT_ID

    def clean_data() -> None:
        data_tables = ", ".join(
            t.name
            for t in app_db.SQLModel.metadata.sorted_tables
            if t.name not in _AUTH_TABLES
        )
        with app_db.engine.begin() as conn:
            if data_tables:
                conn.execute(text(f"TRUNCATE TABLE {data_tables} CASCADE"))
            # Clean up any extra auth rows created by cross-tenant tests.
            conn.execute(text("DELETE FROM tenants WHERE id != :id"), {"id": DEFAULT_TENANT_ID})
            conn.execute(text("DELETE FROM users WHERE id != :id"), {"id": "test-user"})
            conn.execute(text("DELETE FROM roles WHERE id != :id"), {"id": "test-role"})
            conn.execute(text("DELETE FROM plans WHERE id != :id"), {"id": "test-plan"})

    if "world" in request.fixturenames and request.node.path.name == "test_fixture_sanity.py":
        clean_data()
    yield
    clean_data()
    # Auth seed rows survive, so no per-test reseed is needed.


# --- SHARED HELPERS ---

def init_inventory(
    client,
    *,
    date: str,
    full12: int = 50,
    empty12: int = 10,
    full48: int = 20,
    empty48: int = 5,
) -> None:
    payload = {
        "date": date,
        "full12": full12,
        "empty12": empty12,
        "full48": full48,
        "empty48": empty48,
        "reason": "initial",
    }
    resp = client.post("/inventory/init", json=payload)
    assert resp.status_code in (200, 201)

def create_customer(
    client,
    *,
    name: str = "Alice",
    customer_type: str = "private",
    starting_money: float = 0.0,
    starting_12kg: int = 0,
    starting_48kg: int = 0,
) -> str:
    payload = {
        "name": name,
        "phone": None,
        "address": None,
        "note": "",
    }
    resp = client.post("/customers", json=payload)
    assert resp.status_code == 201
    customer_id = resp.json()["id"]

    if starting_money or starting_12kg or starting_48kg:
        adjustment_payload = {
            "customer_id": customer_id,
            "money_balance": int(starting_money),
            "cylinder_balance_12kg": int(starting_12kg),
            "cylinder_balance_48kg": int(starting_48kg),
            "reason": "opening_balance",
        }
        adj_resp = client.post("/customer-adjustments", json=adjustment_payload)
        assert adj_resp.status_code == 201

    return customer_id

def create_system(client, *, customer_id: str, name: str = "Main Kitchen") -> str:
    resp = client.post(
        "/systems",
        json={
            "customer_id": customer_id,
            "name": name,
            "gas_type": "12kg",
            "is_active": True,
            "requires_security_check": False,
            "security_check_exists": False,
            "last_security_check_at": None,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]

def create_order(
    client,
    *,
    customer_id: str,
    system_id: str,
    delivered_at: str = "2025-01-02T10:00:00",
    gas_type: str = "12kg",
    installed: int = 0,
    received: int = 0,
    price_total: float = 0.0,
    paid_amount: float = 0.0,
) -> str:
    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "happened_at": delivered_at,
        "gas_type": gas_type,
        "cylinders_installed": installed,
        "cylinders_received": received,
        "price_total": int(price_total),
        "paid_amount": int(paid_amount),
    }
    resp = client.post("/orders", json=payload)
    if resp.status_code != 201:
        print(f"\n[DEBUG] Order Creation Failed: {resp.status_code}")
        print(f"[DEBUG] Response Body: {resp.text}")
    assert resp.status_code == 201
    return resp.json()["id"]

def get_daily_row(client, date_str: str) -> dict[str, Any]:
    resp = client.get("/reports/daily", params={"from": date_str, "to": date_str})
    assert resp.status_code == 200
    rows = resp.json()
    row = next((item for item in rows if item["date"] == date_str), None)
    assert row is not None
    return row

def assert_inventory(snapshot: dict[str, Any], *, full12: int, empty12: int, full48: int, empty48: int) -> None:
    assert snapshot["full12"] == full12
    assert snapshot["empty12"] == empty12
    assert snapshot["full48"] == full48
    assert snapshot["empty48"] == empty48


def iso_at(date_str: str, time_of_day: str = "morning") -> str:
    if time_of_day == "evening":
        return f"{date_str}T18:00:00"
    if time_of_day == "morning":
        return f"{date_str}T09:00:00"
    return f"{date_str}T12:00:00"
