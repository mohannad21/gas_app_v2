from __future__ import annotations

from datetime import date

from tests.backend.conftest import create_customer, init_inventory


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
    }
    payload.update(overrides)
    return payload


def test_system_initialize_company_only_creates_no_customers(client) -> None:
    today = date.today().isoformat()
    payload = _init_payload(company_payable_money=500)

    resp = client.post("/system/initialize", json=payload)
    assert resp.status_code == 200

    customers = client.get("/customers").json()
    assert customers == []

    report = client.get("/reports/daily", params={"from": today, "to": today}).json()
    assert report
    row = report[0]
    assert row["company_end"] == 500


def test_company_payable_zeroes_after_payment(client) -> None:
    today = date.today().isoformat()
    payload = _init_payload(company_payable_money=500)

    resp = client.post("/system/initialize", json=payload)
    assert resp.status_code == 200

    payment = client.post(
        "/company/payments",
        json={
            "date": today,
            "amount": 500,
            "note": "settle",
        },
    )
    assert payment.status_code == 201

    report = client.get("/reports/daily", params={"from": today, "to": today}).json()
    assert report
    row = report[0]
    assert row["company_end"] == 0
    assert row.get("company_give_end", 0) == 0


def test_system_initialize_day_feed_shows_opening_events(client) -> None:
    today = date.today().isoformat()
    customer_id = create_customer(client, name="Opening Customer")
    payload = _init_payload(
        company_payable_money=500,
        company_full_48kg=3,
        customer_debts=[
            {
                "customer_id": customer_id,
                "money": 200,
                "cyl_12": -1,
                "cyl_48": 2,
            }
        ],
    )

    resp = client.post("/system/initialize", json=payload)
    assert resp.status_code == 200

    report = client.get("/reports/day", params={"date": today})
    assert report.status_code == 200
    init_events = [event for event in report.json()["events"] if event["event_type"] == "init"]
    assert len(init_events) == 2

    system_event = next(event for event in init_events if event["customer_id"] is None)
    assert system_event["hero_text"] == "System Init"
    system_transitions = {row["component"]: row for row in system_event["balance_transitions"]}
    assert system_transitions["money"]["scope"] == "company"
    assert system_transitions["money"]["before"] == 0
    assert system_transitions["money"]["after"] == 500
    assert system_transitions["cyl_48"]["before"] == 0
    assert system_transitions["cyl_48"]["after"] == 3

    customer_event = next(event for event in init_events if event["customer_id"] == customer_id)
    assert customer_event["customer_name"] == "Opening Customer"
    assert customer_event["counterparty"]["type"] == "customer"
    customer_transitions = {row["component"]: row for row in customer_event["balance_transitions"]}
    assert customer_transitions["money"]["before"] == 0
    assert customer_transitions["money"]["after"] == 200
    assert customer_transitions["cyl_12"]["before"] == 0
    assert customer_transitions["cyl_12"]["after"] == -1
    assert customer_transitions["cyl_48"]["before"] == 0
    assert customer_transitions["cyl_48"]["after"] == 2


def test_inventory_init_is_visible_in_day_feed(client) -> None:
    today = date.today().isoformat()
    init_inventory(client, date=today, full12=10, empty12=4, full48=6, empty48=2)

    report = client.get("/reports/day", params={"date": today})
    assert report.status_code == 200
    adjust_events = [event for event in report.json()["events"] if event["event_type"] == "adjust"]
    assert adjust_events
    assert any(event["reason"] == "initial" for event in adjust_events)


def test_system_initialize_init_visibility_survives_daily_range(client) -> None:
    today = date.today().isoformat()
    payload = _init_payload(company_payable_money=300)

    resp = client.post("/system/initialize", json=payload)
    assert resp.status_code == 200

    daily = client.get("/reports/daily", params={"from": today, "to": today})
    assert daily.status_code == 200
    assert len(daily.json()) == 1

    day = client.get("/reports/day", params={"date": today})
    assert day.status_code == 200
    assert any(event["event_type"] == "init" for event in day.json()["events"])
