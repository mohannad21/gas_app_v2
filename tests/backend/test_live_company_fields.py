from __future__ import annotations

from datetime import date, timedelta

from conftest import init_inventory


def test_refill_live_debt_cash_correct_after_creation(client) -> None:
    day = date(2025, 10, 9)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    create_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 5,
            "return12": 3,
            "buy48": 0,
            "return48": 0,
            "total_cost": 500,
            "paid_now": 200,
        },
    )
    assert create_resp.status_code == 200

    refills = client.get("/inventory/refills")
    assert refills.status_code == 200
    entry = refills.json()[0]
    assert entry["live_debt_cash"] == 300
    assert entry["live_debt_cylinders_12"] is not None


def test_refill_live_fields_correct_per_boundary(client) -> None:
    day = date(2025, 10, 10)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    first_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 2,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "total_cost": 400,
            "paid_now": 100,
        },
    )
    assert first_resp.status_code == 200
    first_cash = client.get("/company/balances").json()["company_money"]

    second_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T10:00:00",
            "buy12": 1,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "total_cost": 200,
            "paid_now": 200,
        },
    )
    assert second_resp.status_code == 200

    refills = client.get("/inventory/refills")
    assert refills.status_code == 200
    items = refills.json()
    latest = items[0]
    earlier = items[1]
    assert earlier["live_debt_cash"] == first_cash == 300
    assert latest["live_debt_cash"] == 300


def test_company_payment_live_debt_cash_correct(client) -> None:
    day = date(2025, 10, 11)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    refill_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 5,
            "return12": 3,
            "buy48": 0,
            "return48": 0,
            "total_cost": 500,
            "paid_now": 0,
        },
    )
    assert refill_resp.status_code == 200

    payment_resp = client.post(
        "/company/payments",
        json={
            "happened_at": f"{day.isoformat()}T10:00:00",
            "amount": 200,
        },
    )
    assert payment_resp.status_code == 201
    payment_id = payment_resp.json()["id"]

    payments = client.get("/company/payments")
    assert payments.status_code == 200
    entry = next(item for item in payments.json() if item["id"] == payment_id)
    assert entry["live_debt_cash"] == 300
