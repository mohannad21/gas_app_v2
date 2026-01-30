from __future__ import annotations

from conftest import init_inventory


def test_cash_adjustment_correction_and_audit(client) -> None:
    date = "2025-01-02"
    resp = client.post("/cash/init", json={"date": date, "cash_start": 1000, "reason": "start"})
    assert resp.status_code == 201

    create_resp = client.post("/cash/adjust", json={"date": date, "delta_cash": -200, "reason": "mistake"})
    assert create_resp.status_code == 201
    cash_id = create_resp.json()["id"]

    day = client.get("/cash/day", params={"date": date})
    assert day.status_code == 200
    assert day.json()["cash_end"] == 800

    update_resp = client.put(f"/cash/adjust/{cash_id}", json={"delta_cash": -20, "reason": "fix"})
    assert update_resp.status_code == 200

    day = client.get("/cash/day", params={"date": date})
    assert day.status_code == 200
    assert day.json()["cash_end"] == 980

    delete_resp = client.delete(f"/cash/adjust/{cash_id}")
    assert delete_resp.status_code == 204
    adjustments = client.get("/cash/adjustments", params={"date": date, "include_deleted": True})
    assert adjustments.status_code == 200
    row = next(item for item in adjustments.json() if item["id"] == cash_id)
    assert row["is_deleted"] is True


def test_inventory_adjustment_undo_and_audit(client) -> None:
    init_inventory(client, date="2025-01-01", full12=0, empty12=0, full48=0, empty48=0)

    adjust_resp = client.post(
        "/inventory/adjust",
        json={
            "date": "2025-01-02",
            "gas_type": "12kg",
            "delta_full": 10,
            "delta_empty": 0,
            "reason": "count",
        },
    )
    assert adjust_resp.status_code == 201

    day = client.get("/inventory/day", params={"date": "2025-01-02"})
    assert day.status_code == 200
    summary = next(row for row in day.json()["summaries"] if row["gas_type"] == "12kg")
    assert summary["day_end_full"] == 10

    adjustments = client.get("/inventory/adjustments", params={"date": "2025-01-02"})
    assert adjustments.status_code == 200
    item = adjustments.json()[0]
    adjust_id = item["id"]

    delete_resp = client.delete(f"/inventory/adjust/{adjust_id}")
    assert delete_resp.status_code == 204
    day = client.get("/inventory/day", params={"date": "2025-01-02"})
    assert day.status_code == 200
    summary = next(row for row in day.json()["summaries"] if row["gas_type"] == "12kg")
    assert summary["day_end_full"] == 0

    adjustments = client.get("/inventory/adjustments", params={"date": "2025-01-02", "include_deleted": True})
    assert adjustments.status_code == 200
    row = next(entry for entry in adjustments.json() if entry["id"] == adjust_id)
    assert row["is_deleted"] is True
