from __future__ import annotations

from datetime import date


def _init_payload(**overrides):
    payload = {
        "sell_price_12": 100,
        "sell_price_48": 200,
        "buy_price_12": 0,
        "buy_price_48": 0,
        "full_12": 10,
        "empty_12": 5,
        "full_48": 4,
        "empty_48": 2,
        "cash_start": 100,
        "company_payable_money": 0,
        "company_full_12kg": 0,
        "company_full_48kg": 0,
        "company_empty_12kg": 0,
        "company_empty_48kg": 0,
        "customer_owe_money": 0,
        "customer_credit_money": 0,
        "customer_owe_12kg": 0,
        "customer_owe_48kg": 0,
        "customer_credit_12kg": 0,
        "customer_credit_48kg": 0,
    }
    payload.update(overrides)
    return payload


def test_system_initialize_company_only_creates_no_customers(client) -> None:
    today = date.today().isoformat()
    payload = _init_payload(company_payable_money=500, customer_owe_money=100, customer_credit_money=50)

    resp = client.post("/system/initialize", json=payload)
    assert resp.status_code == 201

    customers = client.get("/customers").json()
    assert customers == []

    report = client.get("/reports/daily_v2", params={"from": today, "to": today}).json()
    assert report
    row = report[0]
    assert row["company_end"] == 500


def test_company_payable_zeroes_after_payment(client) -> None:
    today = date.today().isoformat()
    payload = _init_payload(company_payable_money=500)

    resp = client.post("/system/initialize", json=payload)
    assert resp.status_code == 201

    payment = client.post(
        "/company/payments",
        json={
            "date": today,
            "amount": 500,
            "note": "settle",
        },
    )
    assert payment.status_code == 201

    report = client.get("/reports/daily_v2", params={"from": today, "to": today}).json()
    assert report
    row = report[0]
    assert row["company_end"] == 0
    assert row.get("company_give_end", 0) == 0
