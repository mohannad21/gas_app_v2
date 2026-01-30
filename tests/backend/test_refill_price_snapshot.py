from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from conftest import init_inventory


def _create_price(client, *, gas_type: str, buying_price: float, effective_from: datetime) -> None:
    resp = client.post(
        "/prices",
        json={
            "gas_type": gas_type,
            "customer_type": "private",
            "selling_price": 0,
            "buying_price": buying_price,
            "effective_from": effective_from.isoformat(),
        },
    )
    assert resp.status_code == 201


def _latest_refill_event() -> "RefillEvent":
    import app.db as app_db
    from app.models import RefillEvent

    with Session(app_db.engine) as session:
        event = session.exec(select(RefillEvent).order_by(RefillEvent.created_at.desc())).first()
        assert event is not None
        return event


def test_refill_autocalc_total_cost_and_snapshots_unit_prices(client) -> None:
    day1 = date(2025, 10, 1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)
    effective_from = datetime(2025, 9, 1, tzinfo=timezone.utc)
    _create_price(client, gas_type="12kg", buying_price=100, effective_from=effective_from)
    _create_price(client, gas_type="48kg", buying_price=300, effective_from=effective_from)

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 2,
            "return12": 0,
            "buy48": 1,
            "return48": 0,
            "reason": "restock",
        },
    )
    assert resp.status_code == 201

    event = _latest_refill_event()
    assert event.unit_price_buy_12 == 100
    assert event.unit_price_buy_48 == 300
    assert event.total_cost == 500
    assert event.paid_now == 500

    refill_id = client.get("/inventory/refills").json()[0]["refill_id"]
    details = client.get(f"/inventory/refills/{refill_id}").json()
    assert details["unit_price_buy_12"] == 100
    assert details["unit_price_buy_48"] == 300
    assert details["total_cost"] == 500
    assert details["paid_now"] == 500


def test_refill_respects_explicit_total_cost_but_snapshots_prices(client) -> None:
    day1 = date(2025, 10, 2)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)
    effective_from = datetime(2025, 9, 1, tzinfo=timezone.utc)
    _create_price(client, gas_type="12kg", buying_price=110, effective_from=effective_from)
    _create_price(client, gas_type="48kg", buying_price=310, effective_from=effective_from)

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 999,
        },
    )
    assert resp.status_code == 201

    event = _latest_refill_event()
    assert event.unit_price_buy_12 == 110
    assert event.unit_price_buy_48 == 310
    assert event.total_cost == 999


def test_refill_update_recalculates_using_snapshot_prices(client) -> None:
    day1 = date(2025, 10, 3)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)
    initial_prices = datetime(2025, 9, 1, tzinfo=timezone.utc)
    _create_price(client, gas_type="12kg", buying_price=100, effective_from=initial_prices)
    _create_price(client, gas_type="48kg", buying_price=300, effective_from=initial_prices)

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 1,
            "return12": 0,
            "buy48": 1,
            "return48": 0,
        },
    )
    assert resp.status_code == 201

    newer_prices = datetime(2025, 10, 4, tzinfo=timezone.utc)
    _create_price(client, gas_type="12kg", buying_price=200, effective_from=newer_prices)
    _create_price(client, gas_type="48kg", buying_price=400, effective_from=newer_prices)

    refill_id = client.get("/inventory/refills").json()[0]["refill_id"]
    update_resp = client.put(
        f"/inventory/refills/{refill_id}",
        json={
            "buy12": 3,
            "return12": 0,
            "buy48": 1,
            "return48": 0,
        },
    )
    assert update_resp.status_code == 200
    details = update_resp.json()
    assert details["unit_price_buy_12"] == 100
    assert details["unit_price_buy_48"] == 300
    assert details["total_cost"] == 600


def test_refill_update_sets_snapshot_when_missing(client) -> None:
    day1 = date(2025, 10, 4)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=10, empty48=0)
    _create_price(client, gas_type="12kg", buying_price=120, effective_from=datetime(2025, 1, 1, tzinfo=timezone.utc))
    _create_price(client, gas_type="48kg", buying_price=320, effective_from=datetime(2025, 1, 1, tzinfo=timezone.utc))

    resp = client.post(
        "/inventory/refill",
        json={
            "date": day1.isoformat(),
            "time_of_day": "morning",
            "buy12": 1,
            "return12": 0,
            "buy48": 1,
            "return48": 0,
        },
    )
    assert resp.status_code == 201

    import app.db as app_db
    from app.models import RefillEvent

    with Session(app_db.engine) as session:
        event = session.exec(select(RefillEvent).order_by(RefillEvent.created_at.desc())).first()
        assert event is not None
        event.unit_price_buy_12 = None
        event.unit_price_buy_48 = None
        session.add(event)
        session.commit()

    refill_id = client.get("/inventory/refills").json()[0]["refill_id"]
    update_resp = client.put(
        f"/inventory/refills/{refill_id}",
        json={
            "buy12": 2,
            "return12": 0,
            "buy48": 1,
            "return48": 0,
        },
    )
    assert update_resp.status_code == 200
    details = update_resp.json()
    assert details["unit_price_buy_12"] == 120
    assert details["unit_price_buy_48"] == 320
    assert details["total_cost"] == 560
