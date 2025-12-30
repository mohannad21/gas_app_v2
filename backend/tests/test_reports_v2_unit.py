from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session

from conftest import init_inventory


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
