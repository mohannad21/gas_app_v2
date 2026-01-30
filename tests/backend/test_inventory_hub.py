from __future__ import annotations

from datetime import date, timedelta

from conftest import init_inventory


def test_refill_soft_delete_keeps_audit_and_reverts_inventory(client) -> None:
    day1 = date(2025, 10, 1)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=day1.isoformat(), full12=10, empty12=0, full48=0, empty48=0)

    refill_resp = client.post(
        "/inventory/refill",
        json={
            "date": day2.isoformat(),
            "time_of_day": "morning",
            "buy12": 5,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "reason": "test",
        },
    )
    assert refill_resp.status_code == 201

    refills = client.get("/inventory/refills").json()
    assert len(refills) == 1
    refill_id = refills[0]["refill_id"]
    assert refills[0]["buy12"] == 5
    assert refills[0]["is_deleted"] is False

    latest = client.get("/inventory/latest").json()
    assert latest["full12"] == 15

    delete_resp = client.delete(f"/inventory/refills/{refill_id}")
    assert delete_resp.status_code == 204

    remaining = client.get("/inventory/refills").json()
    assert all(row["refill_id"] != refill_id for row in remaining)

    with_deleted = client.get("/inventory/refills", params={"include_deleted": True}).json()
    deleted_entry = next(row for row in with_deleted if row["refill_id"] == refill_id)
    assert deleted_entry["is_deleted"] is True
    assert deleted_entry["buy12"] == 5

    latest_after = client.get("/inventory/latest").json()
    assert latest_after["full12"] == 10
