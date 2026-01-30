from __future__ import annotations

from datetime import datetime, timezone

from conftest import init_inventory
from app.utils.time import business_date_from_utc


def test_customer_opening_balances_do_not_change_inventory(client) -> None:
    business_date = business_date_from_utc(datetime.now(timezone.utc)).isoformat()
    init_inventory(
        client,
        date=business_date,
        full12=20,
        empty12=5,
        full48=7,
        empty48=3,
    )

    create_payload = {
        "name": "Opening Balance User",
        "phone": None,
        "customer_type": "private",
        "notes": "",
        "starting_money": 200,
        "starting_12kg": 5,
        "starting_48kg": 0,
        "starting_reason": "Opening Balance (App Setup)",
    }
    resp = client.post("/customers", json=create_payload)
    assert resp.status_code == 201
    customer = resp.json()
    customer_id = customer["id"]

    fetched = client.get(f"/customers/{customer_id}")
    assert fetched.status_code == 200
    data = fetched.json()
    assert data["money_balance"] == 200
    assert data["cylinder_balance_12kg"] == 5

    latest = client.get("/inventory/latest")
    assert latest.status_code == 200
    snapshot = latest.json()
    assert snapshot["full12"] == 20
    assert snapshot["empty12"] == 5
    assert snapshot["full48"] == 7
    assert snapshot["empty48"] == 3

    adjustments = client.get(f"/customers/{customer_id}/adjustments")
    assert adjustments.status_code == 200
    items = adjustments.json()
    assert items
    assert any(item["reason"] == "Opening Balance (App Setup)" for item in items)
