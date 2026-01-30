from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session

from conftest import init_inventory
from conftest import create_customer, create_system, create_order


def test_cash_replay_ordering_tiebreak(client) -> None:
    day = date(2025, 6, 1)
    effective_at = datetime(2025, 6, 1, 9, 0, tzinfo=timezone.utc).replace(tzinfo=None)
    created_at = datetime(2025, 6, 1, 9, 0, tzinfo=timezone.utc).replace(tzinfo=None)

    import app.db as app_db
    from app.models import CashDelta
    from app.services.cash import recompute_cash_summaries

    with Session(app_db.engine) as session:
        session.add(
            CashDelta(
                id="cashd_a",
                effective_at=effective_at,
                source_type="cash_adjust",
                source_id=None,
                delta_cash=10,
                reason="first",
                created_at=created_at,
                created_by=None,
            )
        )
        session.add(
            CashDelta(
                id="cashd_b",
                effective_at=effective_at,
                source_type="cash_adjust",
                source_id=None,
                delta_cash=20,
                reason="second",
                created_at=created_at,
                created_by=None,
            )
        )
        session.commit()
        recompute_cash_summaries(session, day, day)
        session.commit()

    resp = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert resp.status_code == 200
    events = [event for event in resp.json()["events"] if event["event_type"] == "cash_adjust"]
    assert [event["reason"] for event in events] == ["first", "second"]
    assert events[0]["cash_before"] == 0
    assert events[0]["cash_after"] == 10
    assert events[1]["cash_before"] == 10
    assert events[1]["cash_after"] == 30


def test_refill_grouping_by_source_id(client) -> None:
    day1 = date(2025, 7, 1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 2,
            "return12": 1,
            "buy48": 3,
            "return48": 0,
            "reason": "group",
        },
    )
    assert resp.status_code == 201

    report = client.get("/reports/day_v2", params={"date": day1.isoformat()})
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
        price_total=1000.0,
        paid_amount=1000.0,
    )

    resp = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert resp.status_code == 200
    audit = resp.json()["audit_summary"]
    assert audit["cash_in"] == 1000.0
    assert audit["new_debt"] == 0.0
