from __future__ import annotations

from datetime import datetime, timezone, date, timedelta

from conftest import init_inventory, iso_at


def test_price_create_and_list(client) -> None:
    resp = client.post(
        "/prices",
        json={
            "gas_type": "12kg",
            "selling_price": 120,
            "buying_price": 80,
            "effective_from": datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
        },
    )
    assert resp.status_code == 201

    resp = client.post(
        "/prices",
        json={
            "gas_type": "48kg",
            "selling_price": 220,
            "buying_price": 180,
            "effective_from": datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
        },
    )
    assert resp.status_code == 201

    listing = client.get("/prices")
    assert listing.status_code == 200
    rows = listing.json()
    assert any(row["gas_type"] == "12kg" for row in rows)
    assert any(row["gas_type"] == "48kg" for row in rows)


def test_refill_persists_totals_from_payload(client) -> None:
    day1 = date(2025, 10, 1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day1.isoformat(), "morning"),
            "buy12": 2,
            "return12": 0,
            "buy48": 1,
            "return48": 0,
            "note": "restock",
            "total_cost": 500,
            "paid_now": 300,
        },
    )
    assert resp.status_code == 200

    refill_id = client.get("/inventory/refills").json()[0]["refill_id"]
    details = client.get(f"/inventory/refills/{refill_id}").json()
    assert details["total_cost"] == 500
    assert details["paid_now"] == 300


def test_refill_update_overwrites_totals(client) -> None:
    day1 = date(2025, 10, 2)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day1.isoformat(), "morning"),
            "buy12": 1,
            "return12": 0,
            "buy48": 1,
            "return48": 0,
            "note": "restock",
            "total_cost": 200,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 200

    refill_id = client.get("/inventory/refills").json()[0]["refill_id"]
    update_resp = client.put(
        f"/inventory/refills/{refill_id}",
        json={
            "buy12": 3,
            "return12": 0,
            "buy48": 1,
            "return48": 0,
            "total_cost": 600,
            "paid_now": 100,
            "note": "edit",
        },
    )
    assert update_resp.status_code == 200
    details = update_resp.json()
    assert details["total_cost"] == 600
    assert details["paid_now"] == 100
