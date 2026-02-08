from __future__ import annotations

from datetime import datetime, timezone

from conftest import create_customer, init_inventory
from app.utils.time import business_date_from_utc


def test_customer_adjustment_updates_customer_balances(client) -> None:
    business_date = business_date_from_utc(datetime.now(timezone.utc)).isoformat()
    init_inventory(
        client,
        date=business_date,
        full12=0,
        empty12=0,
        full48=0,
        empty48=0,
    )
    customer_id = create_customer(client, name="Adj Test")

    create_payload = {
        "customer_id": customer_id,
        "amount_money": 150,
        "count_12kg": -10,
        "count_48kg": 0,
        "reason": "test_adjustment",
    }
    create_resp = client.post("/customer-adjustments", json=create_payload)
    assert create_resp.status_code == 201

    customer = client.get(f"/customers/{customer_id}").json()
    assert customer["money_balance"] == 150
    assert customer["cylinder_balance_12kg"] == -10

    adjustments = client.get(f"/customer-adjustments/{customer_id}")
    assert adjustments.status_code == 200
    items = adjustments.json()
    assert items
    assert items[0]["amount_money"] == 150
    assert items[0]["count_12kg"] == -10
