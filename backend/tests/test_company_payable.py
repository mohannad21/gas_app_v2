from __future__ import annotations

from datetime import date, timedelta

from conftest import create_customer, create_order, create_system, init_inventory


def test_company_payable_partial_refill(client) -> None:
    day1 = date(2025, 10, 1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post("/cash/init", json={"date": day1.isoformat(), "cash_start": 1000, "reason": "open"})
    assert resp.status_code == 201

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 2,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "reason": "restock",
            "total_cost": 200,
            "paid_now": 150,
        },
    )
    assert resp.status_code == 201

    report = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day1.isoformat()})
    assert report.status_code == 200
    row = report.json()[0]
    assert row["company_end"] == 50


def test_company_payment_affects_cash_and_company(client) -> None:
    day1 = date(2025, 10, 2)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post("/cash/init", json={"date": day1.isoformat(), "cash_start": 1000, "reason": "open"})
    assert resp.status_code == 201

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 2,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "reason": "restock",
            "total_cost": 200,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 201

    resp = client.post(
        "/company/payments",
        json={
            "date": day1.isoformat(),
            "amount": 50,
            "note": "pay supplier",
            "time_of_day": "evening",
        },
    )
    assert resp.status_code == 201

    day = client.get("/reports/day_v2", params={"date": day1.isoformat()}).json()
    payment = next(event for event in day["events"] if event["event_type"] == "company_payment")
    assert payment["cash_before"] == 1000
    assert payment["cash_after"] == 950
    assert payment["company_before"] == 200
    assert payment["company_after"] == 150


def test_option_b_cascade_with_company_payable(client) -> None:
    day1 = date(2025, 10, 3)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post("/cash/init", json={"date": day1.isoformat(), "cash_start": 1000, "reason": "open"})
    assert resp.status_code == 201

    customer_id = create_customer(client, name="Cascade Company")
    system_id = create_system(client, customer_id=customer_id)
    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T08:00:00",
        gas_type="12kg",
        installed=0,
        received=0,
        price_total=100,
        paid_amount=100,
    )

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 2,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "reason": "restock",
            "total_cost": 200,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 201

    resp = client.post(
        "/company/payments",
        json={
            "date": day2.isoformat(),
            "amount": 50,
            "note": "pay supplier",
        },
    )
    assert resp.status_code == 201

    before = client.get("/reports/day_v2", params={"date": day2.isoformat()}).json()
    before_payment = next(event for event in before["events"] if event["event_type"] == "company_payment")

    delete_resp = client.delete(f"/orders/{order_id}")
    assert delete_resp.status_code in {200, 204}

    after = client.get("/reports/day_v2", params={"date": day2.isoformat()}).json()
    after_payment = next(event for event in after["events"] if event["event_type"] == "company_payment")

    assert after_payment["cash_before"] == before_payment["cash_before"] - 100
    assert after_payment["cash_after"] == before_payment["cash_after"] - 100
    assert after_payment["company_before"] == before_payment["company_before"]
    assert after_payment["company_after"] == before_payment["company_after"]
