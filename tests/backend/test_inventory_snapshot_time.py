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
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert isinstance(detail, dict)
    assert detail["code"] == "inventory_not_initialized"


def test_refill_uses_exact_time_for_effective_at(client) -> None:
    day = date(2025, 1, 3)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=5, empty48=1)

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day.isoformat(),
            "time": "13:22",
            "buy12": 1,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
        },
    )
    assert resp.status_code == 201

    refills = client.get("/inventory/refills").json()
    assert refills
    refill_id = refills[0]["refill_id"]

    import app.db as app_db
    from app.models import InventoryDelta
    from app.utils.time import business_date_start_utc

    expected = business_date_start_utc(day) + timedelta(hours=13, minutes=22)
    with Session(app_db.engine) as session:
        rows = session.exec(
            select(InventoryDelta)
            .where(InventoryDelta.source_type == "refill")
            .where(InventoryDelta.source_id == refill_id)
        ).all()
        assert rows
        for row in rows:
            assert row.effective_at == expected
