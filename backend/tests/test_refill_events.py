from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session, select

from conftest import init_inventory


def test_refill_event_defaults_paid_now_to_total_cost(client) -> None:
    day1 = date(2025, 8, 1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 2,
            "return12": 1,
            "buy48": 1,
            "return48": 0,
            "reason": "restock",
            "total_cost": 200,
        },
    )
    assert resp.status_code == 201

    import app.db as app_db
    from app.models import RefillEvent

    with Session(app_db.engine) as session:
        event = session.exec(select(RefillEvent).order_by(RefillEvent.created_at.desc())).first()
        assert event is not None
        assert event.total_cost == 200
        assert event.paid_now == 200


def test_refill_event_paid_now_zero(client) -> None:
    day1 = date(2025, 8, 2)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "reason": "restock",
            "total_cost": 200,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 201

    import app.db as app_db
    from app.models import RefillEvent

    with Session(app_db.engine) as session:
        event = session.exec(select(RefillEvent).order_by(RefillEvent.created_at.desc())).first()
        assert event is not None
        assert event.total_cost == 200
        assert event.paid_now == 0


def test_refill_event_legacy_payload_works(client) -> None:
    day1 = date(2025, 8, 3)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "reason": "restock",
        },
    )
    assert resp.status_code == 201

    import app.db as app_db
    from app.models import RefillEvent

    with Session(app_db.engine) as session:
        event = session.exec(select(RefillEvent).order_by(RefillEvent.created_at.desc())).first()
        assert event is not None
        assert event.total_cost == 0
        assert event.paid_now == 0


def test_refill_paid_now_affects_cash_and_timeline(client) -> None:
    day1 = date(2025, 9, 1)
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
            "buy48": 1,
            "return48": 0,
            "reason": "restock",
            "total_cost": 200,
        },
    )
    assert resp.status_code == 201

    report = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day1.isoformat()})
    assert report.status_code == 200
    row = report.json()[0]
    assert row["cash_end"] == 800

    timeline = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert timeline.status_code == 200
    refill_event = next(event for event in timeline.json()["events"] if event["event_type"] == "refill")
    assert refill_event["cash_before"] == 1000
    assert refill_event["cash_after"] == 800
    assert refill_event["total_cost"] == 200
    assert refill_event["paid_now"] == 200
    assert refill_event["company_before"] is None
    assert refill_event["company_after"] is None


def test_refill_paid_now_zero_keeps_cash(client) -> None:
    day1 = date(2025, 9, 2)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post("/cash/init", json={"date": day1.isoformat(), "cash_start": 1000, "reason": "open"})
    assert resp.status_code == 201

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "reason": "restock",
            "total_cost": 200,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 201

    report = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day1.isoformat()})
    assert report.status_code == 200
    row = report.json()[0]
    assert row["cash_end"] == 1000

    timeline = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert timeline.status_code == 200
    refill_event = next(event for event in timeline.json()["events"] if event["event_type"] == "refill")
    assert refill_event["cash_before"] == 1000
    assert refill_event["cash_after"] == 1000
    assert refill_event["total_cost"] == 200
    assert refill_event["paid_now"] == 0
    assert refill_event["company_before"] == 0
    assert refill_event["company_after"] == 200


def test_refill_ordering_tie_break_with_order_same_time(client) -> None:
    day1 = date(2025, 9, 3)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)

    resp = client.post("/cash/init", json={"date": day1.isoformat(), "cash_start": 1000, "reason": "open"})
    assert resp.status_code == 201

    refill_resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "reason": "restock",
            "total_cost": 100,
        },
    )
    assert refill_resp.status_code == 201

    from conftest import create_customer, create_system, create_order

    customer_id = create_customer(client, name="TieBreak")
    system_id = create_system(client, customer_id=customer_id)
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=0,
        received=0,
        price_total=50,
        paid_amount=50,
    )

    timeline = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert timeline.status_code == 200
    events = [event for event in timeline.json()["events"] if event["event_type"] in {"refill", "order"}]
    assert len(events) >= 2
    refill_event = events[0]
    order_event = events[1]
    assert refill_event["event_type"] == "refill"
    assert order_event["event_type"] == "order"
    assert refill_event["cash_before"] == 1000
    assert refill_event["cash_after"] == 900
    assert order_event["cash_before"] == 900
    assert order_event["cash_after"] == 950
