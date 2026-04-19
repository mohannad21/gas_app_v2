from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlmodel import Session, select

from conftest import init_inventory
from conftest import create_customer, create_system, create_order
from app.db import engine
from app.models import CashAdjustment, LedgerEntry


def test_cash_replay_ordering_tiebreak(client) -> None:
    day = date(2025, 6, 1)
    first_at = datetime(2025, 6, 1, 9, 0, tzinfo=timezone.utc).isoformat()
    second_at = datetime(2025, 6, 1, 9, 5, tzinfo=timezone.utc).isoformat()

    resp = client.post("/cash/adjust", json={"happened_at": first_at, "delta_cash": 10, "reason": "first"})
    assert resp.status_code == 201
    resp = client.post("/cash/adjust", json={"happened_at": second_at, "delta_cash": 20, "reason": "second"})
    assert resp.status_code == 201

    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200
    events = [event for event in resp.json()["events"] if event["event_type"] == "cash_adjust"]
    assert [event["reason"] for event in events] == ["second", "first"]
    assert events[1]["cash_before"] == 0
    assert events[1]["cash_after"] == 10
    assert events[0]["cash_before"] == 10
    assert events[0]["cash_after"] == 30


def test_cash_adjust_tiebreaker_uses_ledger_id(client) -> None:
    day = date(2025, 6, 2)
    happened_at = datetime(2025, 6, 2, 9, 0, tzinfo=timezone.utc)

    resp = client.post(
        "/cash/adjust",
        json={"happened_at": happened_at.isoformat(), "delta_cash": 10, "reason": "adjust-a"},
    )
    assert resp.status_code == 201
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": happened_at.isoformat(), "delta_cash": 20, "reason": "adjust-b"},
    )
    assert resp.status_code == 201

    with Session(engine) as session:
        rows = session.exec(text("select id, delta_cash from cash_adjustments")).all()
        adj_a_id = next(row[0] for row in rows if row[1] == 10)
        adj_b_id = next(row[0] for row in rows if row[1] == 20)
        session.execute(
            text(
                """
                update cash_adjustments
                set id = :new_id,
                    happened_at = :ts,
                    created_at = :ts,
                    day = :day
                where id = :old_id
                """
            ),
            {"new_id": "adjust-a", "ts": happened_at, "day": happened_at.date(), "old_id": adj_a_id},
        )
        session.execute(
            text(
                """
                update cash_adjustments
                set id = :new_id,
                    happened_at = :ts,
                    created_at = :ts,
                    day = :day
                where id = :old_id
                """
            ),
            {"new_id": "adjust-b", "ts": happened_at, "day": happened_at.date(), "old_id": adj_b_id},
        )

        entry_a_id = session.execute(
            text(
                """
                select id
                from ledger_entries
                where source_type = 'cash_adjust'
                  and source_id = :source_id
                  and account = 'cash'
                """
            ),
            {"source_id": adj_a_id},
        ).first()
        entry_b_id = session.execute(
            text(
                """
                select id
                from ledger_entries
                where source_type = 'cash_adjust'
                  and source_id = :source_id
                  and account = 'cash'
                """
            ),
            {"source_id": adj_b_id},
        ).first()
        assert entry_a_id is not None
        assert entry_b_id is not None

        session.execute(
            text(
                """
                update ledger_entries
                set id = :new_id,
                    source_id = :new_source,
                    happened_at = :ts,
                    created_at = :ts,
                    day = :day
                where id = :old_id
                """
            ),
            {
                "new_id": "ledger-z",
                "new_source": "adjust-a",
                "ts": happened_at,
                "day": happened_at.date(),
                "old_id": entry_a_id[0] if isinstance(entry_a_id, tuple) else entry_a_id,
            },
        )
        session.execute(
            text(
                """
                update ledger_entries
                set id = :new_id,
                    source_id = :new_source,
                    happened_at = :ts,
                    created_at = :ts,
                    day = :day
                where id = :old_id
                """
            ),
            {
                "new_id": "ledger-a",
                "new_source": "adjust-b",
                "ts": happened_at,
                "day": happened_at.date(),
                "old_id": entry_b_id[0] if isinstance(entry_b_id, tuple) else entry_b_id,
            },
        )
        session.commit()

    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200
    events = [event for event in resp.json()["events"] if event["event_type"] == "cash_adjust"]
    assert [event["reason"] for event in events] == ["adjust-a", "adjust-b"]
    assert events[1]["cash_before"] == 0
    assert events[1]["cash_after"] == 20
    assert events[0]["cash_before"] == 20
    assert events[0]["cash_after"] == 30


def test_refill_grouping_by_source_id(client) -> None:
    day1 = date(2025, 7, 1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day1.isoformat()}T09:00:00",
            "buy12": 2,
            "return12": 1,
            "buy48": 3,
            "return48": 0,
            "note": "group",
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 200

    report = client.get("/reports/day", params={"date": day1.isoformat()})
    assert report.status_code == 200
    events = [event for event in report.json()["events"] if event["event_type"] == "refill"]
    assert len(events) == 1
    refill = events[0]
    assert refill["inventory_before"]["full12"] is not None
    assert refill["inventory_before"]["empty12"] is not None
    assert refill["inventory_before"]["full48"] is not None
    assert refill["inventory_before"]["empty48"] is not None
    assert refill["inventory_after"]["full12"] is not None
    assert refill["inventory_after"]["empty12"] is not None
    assert refill["inventory_after"]["full48"] is not None
    assert refill["inventory_after"]["empty48"] is not None


def test_daily_audit_summary_cash_in_net_zero(client) -> None:
    day = date(2025, 8, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)
    customer_id = create_customer(client, name="Audit Customer")
    system_id = create_system(client, customer_id=customer_id, name="Audit System")

    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=1000,
        paid_amount=1000,
    )

    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200
    audit = resp.json()["audit_summary"]
    assert audit["cash_in"] == 1000
    assert audit["new_debt"] == 0


def test_customer_adjust_is_grouped_and_reported_as_customer_event(client) -> None:
    day = date(2025, 9, 1)
    customer_id = create_customer(client, name="Adjust Customer")

    resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 100,
            "count_12kg": 2,
            "count_48kg": 0,
            "reason": "manual adjust",
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )
    assert resp.status_code == 201
    adjustment = resp.json()

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    events = [event for event in report.json()["events"] if event["event_type"] == "customer_adjust"]
    assert len(events) == 1
    event = events[0]
    assert event["source_id"] == adjustment["id"]
    assert event["counterparty"]["type"] == "customer"
    assert event["customer_name"] == "Adjust Customer"
    assert event["hero_text"] == "Adjusted customer balance"
    assert event["status_mode"] == "settlement"
    assert event["status"] == "needs_action"
    assert isinstance(event["cash_before"], int)
    assert isinstance(event["cash_after"], int)
    assert event["cash_before"] == event["cash_after"]
    assert "inventory_before" in event
    assert "inventory_after" in event
    transitions = {row["component"]: row for row in event["balance_transitions"]}
    assert transitions["money"]["before"] == 0
    assert transitions["money"]["after"] == 100
    assert transitions["cyl_12"]["before"] == 0
    assert transitions["cyl_12"]["after"] == 2
    assert transitions["money"]["intent"] == "customer_adjust"
    assert transitions["cyl_12"]["intent"] == "customer_adjust"


def test_day_orders_feed_by_effective_then_created_then_tiebreaker(client) -> None:
    day = date(2025, 9, 2)
    customer_id = create_customer(client, name="Lina")

    payment_resp = client.post(
        "/company/payments",
        json={
            "amount": 500,
            "note": "company payment",
            "happened_at": f"{day.isoformat()}T10:42:00",
        },
    )
    assert payment_resp.status_code == 201

    adjust_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "count_12kg": -1,
            "reason": "manual adjust",
            "happened_at": f"{day.isoformat()}T09:46:00",
        },
    )
    assert adjust_resp.status_code == 201

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    events = report.json()["events"]
    company_payment = next(index for index, event in enumerate(events) if event["event_type"] == "company_payment")
    customer_adjust = next(index for index, event in enumerate(events) if event["event_type"] == "customer_adjust")

    # Newest-first display order is based on effective_at first; created_at only breaks ties.
    assert company_payment < customer_adjust
    assert events[company_payment]["time_display"] == "10:42"
    assert events[customer_adjust]["time_display"] == "09:46"


def test_daily_customer_adjust_problem_transitions_are_marked_neutral(client) -> None:
    day = date(2025, 9, 3)
    customer_id = create_customer(client, name="Lina")

    resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "count_12kg": -1,
            "reason": "manual adjust",
            "happened_at": f"{day.isoformat()}T09:46:00",
        },
    )
    assert resp.status_code == 201

    report = client.get("/reports/daily", params={"from": day.isoformat(), "to": day.isoformat()})
    assert report.status_code == 200
    [row] = report.json()
    cyl12 = next(item for item in row["problem_transitions"] if item["component"] == "cyl_12")
    assert cyl12["intent"] == "customer_adjust"


def test_day_uses_created_at_as_tiebreak_when_effective_time_matches(client) -> None:
    day = date(2025, 9, 4)
    happened_at = f"{day.isoformat()}T10:00:00"
    customer_id = create_customer(client, name="Lina")

    first = client.post("/cash/adjust", json={"happened_at": happened_at, "delta_cash": 10, "reason": "first"})
    assert first.status_code == 201

    second = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 50,
            "reason": "later create",
            "happened_at": happened_at,
        },
    )
    assert second.status_code == 201

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    events = report.json()["events"]
    customer_adjust = next(index for index, event in enumerate(events) if event["event_type"] == "customer_adjust")
    cash_adjust = next(index for index, event in enumerate(events) if event["event_type"] == "cash_adjust")

    assert customer_adjust < cash_adjust


def test_day_formats_report_times_in_business_timezone_for_entry_flows(client) -> None:
    day = date(2025, 1, 10)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=8, empty48=1)

    refill_at = datetime(2025, 1, 10, 17, 18, tzinfo=timezone.utc).isoformat()
    cash_adjust_at = datetime(2025, 1, 10, 17, 19, tzinfo=timezone.utc).isoformat()
    inventory_adjust_at = datetime(2025, 1, 10, 17, 20, tzinfo=timezone.utc).isoformat()
    company_payment_at = datetime(2025, 1, 10, 17, 21, tzinfo=timezone.utc).isoformat()

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": refill_at,
            "buy12": 1,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "note": "tz refill",
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 200

    resp = client.post(
        "/cash/adjust",
        json={"happened_at": cash_adjust_at, "delta_cash": 100, "reason": "tz cash"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/inventory/adjust",
        json={
            "happened_at": inventory_adjust_at,
            "gas_type": "12kg",
            "delta_full": 1,
            "delta_empty": 0,
            "reason": "tz inventory",
        },
    )
    assert resp.status_code == 200

    resp = client.post(
        "/company/payments",
        json={"happened_at": company_payment_at, "amount": 50, "note": "tz company"},
    )
    assert resp.status_code == 201

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    events = report.json()["events"]

    refill = next(event for event in events if event["event_type"] == "refill" and event["reason"] == "tz refill")
    cash_adjust = next(event for event in events if event["event_type"] == "cash_adjust" and event["reason"] == "tz cash")
    inventory_adjust = next(
        event for event in events if event["event_type"] == "adjust" and event["reason"] == "tz inventory"
    )
    company_payment = next(
        event for event in events if event["event_type"] == "company_payment" and event["reason"] == "tz company"
    )

    assert refill["time_display"] == "18:18"
    assert cash_adjust["time_display"] == "18:19"
    assert inventory_adjust["time_display"] == "18:20"
    assert company_payment["time_display"] == "18:21"
    assert "18:18" in refill["context_line"]


def test_day_payment_wording_is_direction_aware(client) -> None:
    day = date(2025, 1, 11)
    customer_id = create_customer(client, name="Direction Customer")

    resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 45600,
            "happened_at": f"{day.isoformat()}T09:00:00",
        },
    )
    assert resp.status_code == 201

    resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payout",
            "amount_money": 12300,
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )
    assert resp.status_code == 201

    resp = client.post(
        "/company/payments",
        json={"amount": 500, "note": "pay company", "happened_at": f"{day.isoformat()}T11:00:00"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/company/payments",
        json={"amount": -200, "note": "receive company", "happened_at": f"{day.isoformat()}T12:00:00"},
    )
    assert resp.status_code == 201

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    events = report.json()["events"]

    customer_payment = next(
        event for event in events if event["event_type"] == "collection_money" and event["money_amount"] == 45600
    )
    customer_payout = next(
        event for event in events if event["event_type"] == "collection_payout" and event["money_amount"] == 12300
    )
    company_payment = next(
        event for event in events if event["event_type"] == "company_payment" and event["reason"] == "pay company"
    )
    company_receive = next(
        event for event in events if event["event_type"] == "company_payment" and event["reason"] == "receive company"
    )

    assert customer_payment["label"] == "Payment from customer"
    assert customer_payment["hero"]["text"] == "Payment from customer"
    assert customer_payment["hero_text"] == "Payment from customer ₪456"

    assert customer_payout["label"] == "Payment to customer"
    assert customer_payout["hero"]["text"] == "Payment to customer"
    assert customer_payout["hero_text"] == "Payment to customer ₪123"

    assert company_payment["label"] == "Payment to company"
    assert company_payment["hero"]["text"] == "Payment to company"
    assert company_payment["hero_text"] == "Payment to company ₪5"

    assert company_receive["label"] == "Payment from company"
    assert company_receive["hero"]["text"] == "Payment from company"
    assert company_receive["hero_text"] == "Payment from company ₪2"
