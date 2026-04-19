from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from tests.backend.conftest import create_customer, create_order, create_system, init_inventory


def test_wallet_to_bank_reduces_wallet_and_appears_in_timeline(client) -> None:
    day1 = date(2025, 11, 1)
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day1.isoformat()}T08:00:00", "delta_cash": 1000, "reason": "open"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": f"{day1.isoformat()}T09:00:00",
            "amount": 200,
            "direction": "wallet_to_bank",
            "note": "transfer out",
        },
    )
    assert resp.status_code == 201
    transfer_id = resp.json()["id"]
    assert resp.json()["direction"] == "wallet_to_bank"

    report = client.get("/reports/daily", params={"from": day1.isoformat(), "to": day1.isoformat()})
    assert report.status_code == 200
    row = report.json()[0]
    assert row["cash_end"] == 800

    timeline = client.get("/reports/day", params={"date": day1.isoformat()})
    assert timeline.status_code == 200
    transfer_event = next(event for event in timeline.json()["events"] if event["event_type"] == "bank_deposit")
    assert transfer_event["source_id"] == transfer_id
    assert transfer_event["cash_before"] == 1000
    assert transfer_event["cash_after"] == 800
    assert transfer_event["bank_before"] == 0
    assert transfer_event["bank_after"] == 200
    assert transfer_event["reason"] == "transfer out"
    assert transfer_event["label"] == "Wallet → Bank"
    assert transfer_event["hero_text"].endswith("to bank")
    assert transfer_event["transfer_direction"] == "wallet_to_bank"
    assert transfer_event["money_direction"] == "none"

    listing = client.get("/cash/bank_deposits", params={"date": day1.isoformat()})
    assert listing.status_code == 200
    rows = listing.json()
    assert rows
    assert rows[0]["id"] == transfer_id
    assert rows[0]["amount"] == 200
    assert rows[0]["direction"] == "wallet_to_bank"


def test_wallet_to_bank_above_wallet_fails(client) -> None:
    day1 = date(2025, 11, 2)
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day1.isoformat()}T08:00:00", "delta_cash": 100, "reason": "open"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": f"{day1.isoformat()}T09:00:00",
            "amount": 150,
            "direction": "wallet_to_bank",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "wallet_insufficient"
    assert resp.json()["detail"]["available"] == 100
    assert resp.json()["detail"]["attempt"] == 150


def test_bank_to_wallet_increases_wallet_and_appears_in_timeline(client) -> None:
    day1 = date(2025, 11, 3)
    resp = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": f"{day1.isoformat()}T09:00:00",
            "amount": 120,
            "direction": "bank_to_wallet",
            "note": "top up",
        },
    )
    assert resp.status_code == 201
    transfer_id = resp.json()["id"]
    assert resp.json()["direction"] == "bank_to_wallet"

    report = client.get("/reports/daily", params={"from": day1.isoformat(), "to": day1.isoformat()})
    assert report.status_code == 200
    row = report.json()[0]
    assert row["cash_end"] == 120

    timeline = client.get("/reports/day", params={"date": day1.isoformat()})
    assert timeline.status_code == 200
    transfer_event = next(event for event in timeline.json()["events"] if event["event_type"] == "bank_deposit")
    assert transfer_event["source_id"] == transfer_id
    assert transfer_event["cash_before"] == 0
    assert transfer_event["cash_after"] == 120
    assert transfer_event["bank_before"] == 0
    assert transfer_event["bank_after"] == -120
    assert transfer_event["label"] == "Bank → Wallet"
    assert transfer_event["hero_text"].endswith("to wallet")
    assert transfer_event["transfer_direction"] == "bank_to_wallet"


def test_bank_deposit_ordering_vs_expense_same_day(client) -> None:
    day1 = datetime.now(timezone.utc).date()
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day1.isoformat()}T08:00:00", "delta_cash": 500, "reason": "open"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": f"{day1.isoformat()}T09:00:00",
            "amount": 50,
            "direction": "wallet_to_bank",
            "note": "deposit",
        },
    )
    assert resp.status_code == 201

    expense = client.post(
        "/expenses",
        json={"date": day1.isoformat(), "expense_type": "fuel", "amount": 10, "note": "fuel"},
    )
    assert expense.status_code == 201

    timeline = client.get("/reports/day", params={"date": day1.isoformat()})
    assert timeline.status_code == 200
    events = [event for event in timeline.json()["events"] if event["event_type"] in {"bank_deposit", "expense"}]
    assert len(events) == 2
    assert {event["event_type"] for event in events} == {"bank_deposit", "expense"}


def test_wallet_to_bank_delete_cascades_cash_forward(client) -> None:
    day1 = date(2025, 11, 4)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat())
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day1.isoformat()}T08:00:00", "delta_cash": 1000, "reason": "open"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": f"{day1.isoformat()}T09:00:00",
            "amount": 200,
            "direction": "wallet_to_bank",
            "note": "transfer out",
        },
    )
    assert resp.status_code == 201
    transfer_id = resp.json()["id"]

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

    timeline_before = client.get("/reports/day", params={"date": day2.isoformat()})
    assert timeline_before.status_code == 200
    order_before = next(event for event in timeline_before.json()["events"] if event["event_type"] == "order")
    assert order_before["cash_before"] == 800
    assert order_before["cash_after"] == 900

    delete_resp = client.delete(f"/cash/bank_deposit/{transfer_id}")
    assert delete_resp.status_code == 204

    timeline_after = client.get("/reports/day", params={"date": day2.isoformat()})
    assert timeline_after.status_code == 200
    order_after = next(event for event in timeline_after.json()["events"] if event["event_type"] == "order")
    assert order_after["cash_before"] == 1000
    assert order_after["cash_after"] == 1100


def test_bank_to_wallet_delete_restores_balances(client) -> None:
    day1 = date(2025, 11, 5)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat())

    resp = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": f"{day1.isoformat()}T09:00:00",
            "amount": 200,
            "direction": "bank_to_wallet",
            "note": "top up",
        },
    )
    assert resp.status_code == 201
    transfer_id = resp.json()["id"]

    customer_id = create_customer(client, name="TopUpFlow")
    system_id = create_system(client, customer_id=customer_id)
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day2.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=0,
        received=0,
        price_total=50,
        paid_amount=50,
    )

    timeline_before = client.get("/reports/day", params={"date": day2.isoformat()})
    assert timeline_before.status_code == 200
    order_before = next(event for event in timeline_before.json()["events"] if event["event_type"] == "order")
    assert order_before["cash_before"] == 200
    assert order_before["cash_after"] == 250

    delete_resp = client.delete(f"/cash/bank_deposit/{transfer_id}")
    assert delete_resp.status_code == 204

    timeline_after = client.get("/reports/day", params={"date": day2.isoformat()})
    assert timeline_after.status_code == 200
    order_after = next(event for event in timeline_after.json()["events"] if event["event_type"] == "order")
    assert order_after["cash_before"] == 0
    assert order_after["cash_after"] == 50
