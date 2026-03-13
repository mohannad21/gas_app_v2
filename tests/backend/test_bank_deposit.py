from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from tests.backend.conftest import create_customer, create_order, create_system, init_inventory


def test_bank_deposit_reduces_cash_and_appears_in_timeline(client) -> None:
    day1 = date(2025, 11, 1)
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day1.isoformat()}T08:00:00", "delta_cash": 1000, "reason": "open"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/cash/bank_deposit",
        json={"happened_at": f"{day1.isoformat()}T09:00:00", "amount": 200, "note": "deposit"},
    )
    assert resp.status_code == 201
    deposit_id = resp.json()["id"]

    report = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day1.isoformat()})
    assert report.status_code == 200
    row = report.json()[0]
    assert row["cash_end"] == 800

    timeline = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert timeline.status_code == 200
    deposit_event = next(event for event in timeline.json()["events"] if event["event_type"] == "bank_deposit")
    assert deposit_event["source_id"] == deposit_id
    assert deposit_event["cash_before"] == 1000
    assert deposit_event["cash_after"] == 800
    assert deposit_event["bank_before"] == 0
    assert deposit_event["bank_after"] == 200
    assert deposit_event["reason"] == "deposit"
    assert deposit_event["hero_text"] == "Transferred ₪200 to bank"
    assert deposit_event["money_direction"] == "none"

    listing = client.get("/cash/bank_deposits", params={"date": day1.isoformat()})
    assert listing.status_code == 200
    rows = listing.json()
    assert rows
    assert rows[0]["id"] == deposit_id
    assert rows[0]["amount"] == 200


def test_bank_deposit_ordering_vs_expense_same_day(client) -> None:
    day1 = datetime.now(timezone.utc).date()
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day1.isoformat()}T08:00:00", "delta_cash": 500, "reason": "open"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/cash/bank_deposit",
        json={"happened_at": f"{day1.isoformat()}T09:00:00", "amount": 50, "note": "deposit"},
    )
    assert resp.status_code == 201

    expense = client.post(
        "/expenses",
        json={"date": day1.isoformat(), "expense_type": "fuel", "amount": 10, "note": "fuel"},
    )
    assert expense.status_code == 201

    timeline = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert timeline.status_code == 200
    events = [event for event in timeline.json()["events"] if event["event_type"] in {"bank_deposit", "expense"}]
    assert len(events) == 2
    assert events[0]["event_type"] == "bank_deposit"
    assert events[1]["event_type"] == "expense"


def test_bank_deposit_delete_cascades_cash_forward(client) -> None:
    day1 = date(2025, 11, 3)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat())
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day1.isoformat()}T08:00:00", "delta_cash": 1000, "reason": "open"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/cash/bank_deposit",
        json={"happened_at": f"{day1.isoformat()}T09:00:00", "amount": 200, "note": "deposit"},
    )
    assert resp.status_code == 201
    deposit_id = resp.json()["id"]

    customer_id = create_customer(client, name="DepositFlow")
    system_id = create_system(client, customer_id=customer_id)
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day2.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=0,
        received=0,
        price_total=100,
        paid_amount=100,
    )

    timeline_before = client.get("/reports/day_v2", params={"date": day2.isoformat()})
    assert timeline_before.status_code == 200
    order_before = next(event for event in timeline_before.json()["events"] if event["event_type"] == "order")
    assert order_before["cash_before"] == 800
    assert order_before["cash_after"] == 900

    delete_resp = client.delete(f"/cash/bank_deposit/{deposit_id}")
    assert delete_resp.status_code == 204

    timeline_after = client.get("/reports/day_v2", params={"date": day2.isoformat()})
    assert timeline_after.status_code == 200
    order_after = next(event for event in timeline_after.json()["events"] if event["event_type"] == "order")
    assert order_after["cash_before"] == 1000
    assert order_after["cash_after"] == 1100
