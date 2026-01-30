from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select
from app.models import CashDailySummary, CollectionEvent
from app.services.inventory import inventory_totals_at, inventory_totals_before_source
from app.utils.time import business_date_from_utc
from tests.conftest import create_customer, create_order, create_system, init_inventory


def _post_collection(client, payload: dict) -> dict:
    resp = client.post("/collections", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _delete_collection(client, collection_id: str) -> None:
    resp = client.delete(f"/collections/{collection_id}")
    assert resp.status_code == 204


def test_collection_delete_recomputes_cash_chain(client):
    now = datetime.now(timezone.utc)
    d0 = (now - timedelta(days=31)).date().isoformat()
    d1 = (now - timedelta(days=30)).date().isoformat()
    d2 = (now - timedelta(days=29)).date().isoformat()

    init_inventory(client, date=d0, full12=10, empty12=0, full48=0, empty48=0)
    customer_id = create_customer(client, name="Debt Customer")
    system_id = create_system(client, customer_id=customer_id)

    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{d0}T08:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=200.0,
        paid_amount=0.0,
    )

    first_payment = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100.0,
            "effective_at": f"{d1}T10:00:00",
        },
    )
    _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 50.0,
            "effective_at": f"{d2}T10:00:00",
        },
    )

    from app import db as app_db
    with Session(app_db.engine) as session:
        cash_date = business_date_from_utc(datetime.fromisoformat(f"{d2}T10:00:00"))
        summary = session.exec(
            select(CashDailySummary).where(CashDailySummary.business_date == cash_date)
        ).first()
        assert summary is not None
        assert summary.cash_end == 150.0

    _delete_collection(client, first_payment["id"])

    from app import db as app_db
    with Session(app_db.engine) as session:
        summary = session.exec(
            select(CashDailySummary).where(CashDailySummary.business_date == cash_date)
        ).first()
        assert summary is not None
        assert summary.cash_end == 50.0

    resp = client.get("/customers")
    assert resp.status_code == 200
    updated = next(c for c in resp.json() if c["id"] == customer_id)
    assert updated["money_balance"] == 150.0


def test_collection_snapshot_integrity(client):
    now = datetime.now(timezone.utc)
    d0 = (now - timedelta(days=10)).date().isoformat()
    d1 = (now - timedelta(days=9)).date().isoformat()

    init_inventory(client, date=d0, full12=5, empty12=2, full48=3, empty48=1)
    customer_id = create_customer(client, name="Snapshot Customer")

    _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100.0,
            "effective_at": f"{d0}T09:00:00",
        },
    )
    second = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 50.0,
            "effective_at": f"{d0}T10:00:00",
        },
    )

    from app import db as app_db
    with Session(app_db.engine) as session:
        event = session.exec(
            select(CollectionEvent).where(CollectionEvent.id == second["id"])
        ).first()
        assert event is not None
        assert event.cash_before == 100.0
        assert event.cash_after == 150.0

    ret = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "return",
            "qty_12kg": 2,
            "qty_48kg": 1,
            "effective_at": f"{d1}T10:00:00",
        },
    )
    from app import db as app_db
    with Session(app_db.engine) as session:
        event = session.exec(
            select(CollectionEvent).where(CollectionEvent.id == ret["id"])
        ).first()
        assert event is not None
        before_full12, before_empty12 = inventory_totals_before_source(
            session,
            gas_type="12kg",
            source_type="collection_empty",
            source_id=ret["id"],
        )
        before_full48, before_empty48 = inventory_totals_before_source(
            session,
            gas_type="48kg",
            source_type="collection_empty",
            source_id=ret["id"],
        )
        assert event.inv12_full_before == before_full12
        assert event.inv12_empty_before == before_empty12
        assert event.inv12_empty_after == before_empty12 + 2
        assert event.inv48_full_before == before_full48
        assert event.inv48_empty_before == before_empty48
        assert event.inv48_empty_after == before_empty48 + 1


def test_delete_return_allows_negative_inventory(client):
    now = datetime.now(timezone.utc)
    d0 = (now - timedelta(days=5)).date().isoformat()
    d1 = (now - timedelta(days=4)).date().isoformat()
    d2 = (now - timedelta(days=3)).date().isoformat()

    init_inventory(client, date=d0, full12=2, empty12=0, full48=0, empty48=0)
    customer_id = create_customer(client, name="Negative Customer")

    ret = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "return",
            "qty_12kg": 1,
            "effective_at": f"{d1}T10:00:00",
        },
    )

    refill_payload = {
        "date": d2,
        "time_of_day": "morning",
        "buy12": 0,
        "return12": 1,
        "buy48": 0,
        "return48": 0,
        "reason": "test",
    }
    refill_resp = client.post("/inventory/refill", json=refill_payload)
    assert refill_resp.status_code == 201

    _delete_collection(client, ret["id"])

    latest = client.get("/inventory/latest")
    assert latest.status_code == 200
    data = latest.json()
    assert data["empty12"] == -1
