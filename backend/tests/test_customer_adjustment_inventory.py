from __future__ import annotations

from datetime import datetime, timezone

from conftest import create_customer, init_inventory
from app.utils.time import business_date_from_utc


def _get_day_summary(client, date_str: str, gas_type: str) -> dict:
    resp = client.get("/inventory/day", params={"date": date_str})
    assert resp.status_code == 200
    data = resp.json()
    summaries = data["summaries"]
    return next(item for item in summaries if item["gas_type"] == gas_type)


def _list_deltas(client, date_str: str) -> list[dict]:
    resp = client.get("/inventory/deltas", params={"from": date_str})
    assert resp.status_code == 200
    return resp.json()["items"]


def test_customer_adjustment_inventory_lifecycle(client) -> None:
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

    # Use negative count to add full inventory (delta_full = -count).
    create_payload = {
        "customer_id": customer_id,
        "amount_money": 0,
        "count_12kg": -10,
        "count_48kg": 0,
        "reason": "test_adjustment",
        "is_inventory_neutral": False,
    }
    create_resp = client.post("/customer-adjustments", json=create_payload)
    assert create_resp.status_code == 200
    adjustment_id = create_resp.json()["id"]

    summary = _get_day_summary(client, business_date, "12kg")
    assert summary["day_end_full"] == 10

    update_resp = client.put(
        f"/customer-adjustments/{adjustment_id}",
        json={"count_12kg": -5, "is_inventory_neutral": False},
    )
    assert update_resp.status_code == 200
    summary = _get_day_summary(client, business_date, "12kg")
    assert summary["day_end_full"] == 5

    update_resp = client.put(
        f"/customer-adjustments/{adjustment_id}",
        json={"is_inventory_neutral": True},
    )
    assert update_resp.status_code == 200
    summary = _get_day_summary(client, business_date, "12kg")
    assert summary["day_end_full"] == 0

    delete_resp = client.delete(f"/customer-adjustments/{adjustment_id}")
    assert delete_resp.status_code == 204
    summary = _get_day_summary(client, business_date, "12kg")
    assert summary["day_end_full"] == 0

    deltas = _list_deltas(client, business_date)
    orphaned = [
        item
        for item in deltas
        if item["source_type"] == "customer_adjustment" and item["source_id"] == adjustment_id
    ]
    assert orphaned == []
