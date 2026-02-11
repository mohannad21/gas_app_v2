from __future__ import annotations

from datetime import date


def test_refill_update_ignores_debt_payload(client) -> None:
    day = date(2025, 10, 7)

    create_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 0,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 200,
            "paid_now": 0,
        },
    )
    assert create_resp.status_code == 200

    refill_id = client.get("/inventory/refills").json()[0]["refill_id"]

    update_resp = client.put(
        f"/inventory/refills/{refill_id}",
        json={
            "buy12": 0,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 200,
            "paid_now": 0,
            "debt_cash": 0,
            "debt_cylinders_12": 0,
            "debt_cylinders_48": 0,
        },
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["debt_cash"] == 200


def test_refill_rejects_new_shells(client) -> None:
    day = date(2025, 10, 8)
    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 0,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 0,
            "paid_now": 0,
            "new12": 1,
        },
    )
    assert resp.status_code == 422
