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


def test_company_balance_adjustment_updates_balances(client) -> None:
    day = date(2025, 10, 7)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    refill = client.post(
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
    assert refill.status_code == 200

    adjust = client.post(
        "/company/balances/adjust",
        json={
            "happened_at": f"{day.isoformat()}T10:00:00",
            "money_balance": 80,
            "cylinder_balance_12": -3,
            "cylinder_balance_48": 4,
            "note": "manual correction",
        },
    )
    assert adjust.status_code == 201

    balances = client.get("/company/balances")
    assert balances.status_code == 200
    data = balances.json()
    assert data["company_money"] == 80
    assert data["company_cyl_12"] == -3
    assert data["company_cyl_48"] == 4


def test_company_payment_delete_recomputes_balance_and_hides_payment(client) -> None:
    day = date(2025, 10, 8)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    refill = client.post(
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
    assert refill.status_code == 200

    payment = client.post(
        "/company/payments",
        json={
            "happened_at": f"{day.isoformat()}T10:00:00",
            "amount": 40,
            "note": "partial payment",
        },
    )
    assert payment.status_code == 201
    payment_id = payment.json()["id"]

    balances = client.get("/company/balances")
    assert balances.status_code == 200
    assert balances.json()["company_money"] == 110

    delete_resp = client.delete(f"/company/payments/{payment_id}")
    assert delete_resp.status_code == 204

    balances = client.get("/company/balances")
    assert balances.status_code == 200
    assert balances.json()["company_money"] == 150

    payments = client.get("/company/payments")
    assert payments.status_code == 200
    assert all(row["id"] != payment_id for row in payments.json())

    second_delete = client.delete(f"/company/payments/{payment_id}")
    assert second_delete.status_code == 404
