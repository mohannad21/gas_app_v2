from __future__ import annotations
import importlib
import sys
from pathlib import Path
from typing import Any
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    from app import config as app_config
    app_config.get_settings.cache_clear()
    importlib.reload(app_config)
    from app import db as app_db
    importlib.reload(app_db)
    from app import main as app_main
    importlib.reload(app_main)
    app = app_main.create_app()
    with TestClient(app) as test_client:
        yield test_client

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
    assert resp.status_code == 201

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
        "customer_type": customer_type,
        "notes": "",
        "starting_money": starting_money,
        "starting_12kg": starting_12kg,
        "starting_48kg": starting_48kg,
    }
    resp = client.post("/customers", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]

def create_system(client, *, customer_id: str, name: str = "Main Kitchen") -> str:
    resp = client.post("/systems", json={
        "customer_id": customer_id,
        "name": name,
        "location": None,
        "system_type": "main_kitchen",
        "gas_type": "12kg",
        "system_customer_type": "private",
        "is_active": True,
        "require_security_check": False,
        "security_check_exists": False,
        "security_check_date": None,
    })
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
        "delivered_at": delivered_at,
        "gas_type": gas_type,
        "cylinders_installed": installed, 
        "cylinders_received": received,
        "price_total": price_total, 
        "paid_amount": paid_amount
    }
    resp = client.post("/orders", json=payload)
    if resp.status_code != 201:
        # This will now print the actual validation error (e.g., 'No price found' or 'Negative stock')
        print(f"\n[DEBUG] Order Creation Failed: {resp.status_code}")
        print(f"[DEBUG] Response Body: {resp.text}")
    assert resp.status_code == 201
    return resp.json()["id"]

def get_daily_row(client, date_str: str) -> dict[str, Any]:
    resp = client.get("/reports/daily")
    rows = resp.json()
    row = next((item for item in rows if item["date"] == date_str), None)
    assert row is not None
    return row

def assert_inventory(snapshot: dict[str, Any], *, full12: int, empty12: int, full48: int, empty48: int) -> None:
    # Note: Ensure the keys in snapshot match your API response (e.g., 'full_12kg' vs 'full12')
    assert snapshot["full12"] == full12
    assert snapshot["empty12"] == empty12
    assert snapshot["full48"] == full48
    assert snapshot["empty48"] == empty48
