from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session, select

from conftest import init_inventory


def test_inventory_snapshot_at_time(client) -> None:
    init_inventory(client, date="2025-01-01", full12=10, empty12=2, full48=5, empty48=1)
    resp = client.get("/inventory/snapshot", params={"date": "2025-01-01", "time": "13:30"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["full12"] == 10
    assert data["empty12"] == 2
    assert data["full48"] == 5
    assert data["empty48"] == 1


def test_inventory_snapshot_not_initialized_returns_structured_error(client) -> None:
    resp = client.get("/inventory/snapshot", params={"date": "2025-01-02", "time": "10:00"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["full12"] == 0
    assert data["empty12"] == 0
    assert data["full48"] == 0
    assert data["empty48"] == 0


def test_refill_uses_exact_time_for_effective_at(client) -> None:
    day = date(2025, 1, 3)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=5, empty48=1)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T13:22:00",
            "buy12": 1,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "note": "test",
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 200

    refills = client.get("/inventory/refills").json()
    assert refills
    refill = refills[0]
    assert refill["effective_at"].startswith(f"{day.isoformat()}T13:22")
