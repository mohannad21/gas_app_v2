from __future__ import annotations

from datetime import date, timedelta

from conftest import create_customer, init_inventory


def _cash_init(client, *, day: str, amount: float) -> None:
    resp = client.post("/cash/init", json={"date": day, "cash_start": amount, "reason": "open"})
    assert resp.status_code == 201


def test_daily_v2_customer_balances_net_zero(client) -> None:
    day = date(2025, 1, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=0, empty12=0, full48=0, empty48=0)
    _cash_init(client, day=day.isoformat(), amount=0)

    customer_id = create_customer(client, name="Osama")
    adj_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 100,
            "reason": "test",
            "is_inventory_neutral": True,
        },
    )
    assert adj_resp.status_code == 200

    pay_resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
        },
    )
    assert pay_resp.status_code == 201

    report_resp = client.get("/reports/daily_v2", params={"from": day.isoformat(), "to": day.isoformat()})
    assert report_resp.status_code == 200
    row = report_resp.json()[0]
    assert row["customer_money_receivable"] == 0
    assert row["customer_money_payable"] == 0


def test_daily_v2_customer_balances_bilateral(client) -> None:
    day = date(2025, 2, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=0, empty12=0, full48=0, empty48=0)
    _cash_init(client, day=day.isoformat(), amount=0)

    customer_a = create_customer(client, name="Customer A")
    customer_b = create_customer(client, name="Customer B")

    resp_a = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_a,
            "amount_money": 50,
            "count_12kg": 2,
            "reason": "test",
            "is_inventory_neutral": True,
        },
    )
    assert resp_a.status_code == 200
    resp_b = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_b,
            "amount_money": -50,
            "count_12kg": -1,
            "reason": "test",
            "is_inventory_neutral": True,
        },
    )
    assert resp_b.status_code == 200

    report_resp = client.get("/reports/daily_v2", params={"from": day.isoformat(), "to": day.isoformat()})
    assert report_resp.status_code == 200
    row = report_resp.json()[0]
    assert row["customer_money_receivable"] == 50
    assert row["customer_money_payable"] == 50
    assert row["customer_12kg_receivable"] == 2
    assert row["customer_12kg_payable"] == 1
