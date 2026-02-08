from __future__ import annotations

from datetime import datetime, timezone

from conftest import init_inventory
from app.utils.time import business_date_from_utc


def test_debt_lifecycle_collection_return_moves_assets(client) -> None:
    business_date = business_date_from_utc(datetime.now(timezone.utc)).isoformat()
    init_inventory(
        client,
        date=business_date,
        full12=10,
        empty12=0,
        full48=0,
        empty48=0,
    )

    create_payload = {
        "name": "Customer A",
        "phone": None,
        "address": None,
        "note": "",
    }
    resp = client.post("/customers", json=create_payload)
    assert resp.status_code == 201
    customer_id = resp.json()["id"]

    adj_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "count_12kg": 5,
            "reason": "Opening Balance (App Setup)",
        },
    )
    assert adj_resp.status_code == 201

    customer = client.get(f"/customers/{customer_id}").json()
    assert customer["cylinder_balance_12kg"] == 5
    inventory = client.get("/inventory/latest").json()
    assert inventory["full12"] + inventory["empty12"] == 10
    assert inventory["full12"] + inventory["empty12"] + customer["cylinder_balance_12kg"] == 15

    collection_resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "return",
            "qty_12kg": 2,
        },
    )
    assert collection_resp.status_code == 201

    customer = client.get(f"/customers/{customer_id}").json()
    assert customer["cylinder_balance_12kg"] == 3
    inventory = client.get("/inventory/latest").json()
    assert inventory["full12"] + inventory["empty12"] == 12
    assert inventory["full12"] + inventory["empty12"] + customer["cylinder_balance_12kg"] == 15
