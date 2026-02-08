from __future__ import annotations

from datetime import date, timedelta

from conftest import init_inventory


def test_company_refill_updates_inventory_and_debt(client) -> None:
    day = date(2025, 10, 6)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 2,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "total_cost": 200,
            "paid_now": 50,
        },
    )
    assert resp.status_code == 200

    balances = client.get("/company/balances")
    assert balances.status_code == 200
    data = balances.json()
    assert data["company_money"] == 150
    assert data["inventory_full_12"] == 12
    assert data["inventory_empty_12"] == 4
