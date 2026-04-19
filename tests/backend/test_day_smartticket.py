from datetime import date, timedelta, datetime, timezone

from sqlmodel import Session, select

import app.db as app_db
from app.config import DEFAULT_TENANT_ID
from app.models import CompanyTransaction, CustomerTransaction
from app.services.posting import derive_day, post_company_transaction
from conftest import create_customer, create_system, init_inventory, iso_at


def _post_order(
    client,
    *,
    customer_id: str,
    system_id: str,
    happened_at: str,
    order_mode: str = "replacement",
    gas_type: str = "12kg",
    installed: int = 0,
    received: int = 0,
    total: int = 0,
    paid: int = 0,
) -> str:
    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": happened_at,
            "order_mode": order_mode,
            "gas_type": gas_type,
            "cylinders_installed": installed,
            "cylinders_received": received,
            "price_total": total,
            "paid_amount": paid,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_day_smart_ticket_order_fields(client) -> None:
    day = date(2025, 10, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)
    customer_id = create_customer(client, name="Ticket Orders")
    system_id = create_system(client, customer_id=customer_id)

    rep_bal_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        installed=1,
        received=1,
        total=100,
        paid=100,
    )
    rep_unbal_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "evening"),
        order_mode="replacement",
        installed=2,
        received=1,
        total=200,
        paid=150,
    )
    sell_bal_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="sell_iron",
        installed=2,
        received=0,
        total=120,
        paid=120,
    )
    sell_unbal_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "evening"),
        order_mode="sell_iron",
        installed=2,
        received=0,
        total=120,
        paid=100,
    )
    buy_bal_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="buy_iron",
        installed=2,
        received=0,
        total=200,
        paid=200,
    )
    buy_unbal_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "evening"),
        order_mode="buy_iron",
        installed=2,
        received=0,
        total=200,
        paid=150,
    )

    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200
    events = {event["source_id"]: event for event in resp.json()["events"] if event["event_type"] == "order"}

    rep_bal = events[rep_bal_id]
    assert rep_bal["label"] == "Replacement"
    assert rep_bal["is_balanced"] is True
    assert rep_bal["action_lines"] == []

    rep_unbal = events[rep_unbal_id]
    assert rep_unbal["label"] == "Replacement"
    assert rep_unbal["is_balanced"] is False
    assert rep_unbal["action_lines"] == ["Return 1x12kg", "Collect 50"]

    sell_bal = events[sell_bal_id]
    assert sell_bal["label"] == "Sell Full"
    assert sell_bal["is_balanced"] is True
    assert sell_bal["action_lines"] == []

    sell_unbal = events[sell_unbal_id]
    assert sell_unbal["label"] == "Sell Full"
    assert sell_unbal["is_balanced"] is False
    assert sell_unbal["action_lines"] == ["Collect 20"]

    buy_bal = events[buy_bal_id]
    assert buy_bal["label"] == "Buy Empty"
    assert buy_bal["is_balanced"] is True
    assert buy_bal["action_lines"] == []

    buy_unbal = events[buy_unbal_id]
    assert buy_unbal["label"] == "Buy Empty"
    assert buy_unbal["is_balanced"] is False
    assert buy_unbal["action_lines"] == ["Pay customer 50"]


def test_day_smart_ticket_refill_fields(client) -> None:
    day = date(2025, 10, 2)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "buy12": 2,
            "return12": 2,
            "buy48": 1,
            "return48": 1,
            "note": "balanced-refill",
            "total_cost": 200,
            "paid_now": 200,
        },
    )
    assert resp.status_code == 200

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day.isoformat(), "evening"),
            "buy12": 5,
            "return12": 3,
            "buy48": 4,
            "return48": 1,
            "note": "unbalanced-refill",
            "total_cost": 500,
            "paid_now": 400,
        },
    )
    assert resp.status_code == 200

    with Session(app_db.engine) as session:
        balanced_txn = session.exec(
            select(CompanyTransaction).where(CompanyTransaction.note == "balanced-refill")
        ).first()
        unbalanced_txn = session.exec(
            select(CompanyTransaction).where(CompanyTransaction.note == "unbalanced-refill")
        ).first()
        assert balanced_txn is not None
        assert unbalanced_txn is not None
        balanced_id = balanced_txn.id
        unbalanced_id = unbalanced_txn.id

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    refill_events = {
        event["source_id"]: event for event in report.json()["events"] if event["event_type"] == "refill"
    }

    balanced = refill_events[balanced_id]
    assert balanced["label"] == "Refill"
    assert balanced["is_balanced"] is True
    assert balanced["action_lines"] == []

    unbalanced = refill_events[unbalanced_id]
    assert unbalanced["label"] == "Refill"
    assert unbalanced["is_balanced"] is False
    assert unbalanced["action_lines"] == [
        "Return 2x12kg to company",
        "Return 3x48kg to company",
        "Pay company 100",
    ]


def test_day_refill_does_not_merge_new_shells(client) -> None:
    day = date(2025, 10, 3)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)

    happened_at = datetime(2025, 10, 3, 9, 0, tzinfo=timezone.utc)
    with Session(app_db.engine) as session:
        txn = CompanyTransaction(
            tenant_id=DEFAULT_TENANT_ID,
            happened_at=happened_at,
            day=derive_day(happened_at),
            kind="refill",
            buy12=2,
            return12=1,
            buy48=0,
            return48=0,
            new12=5,
            new48=0,
            total=0,
            paid=0,
            note="legacy-new-shells",
            is_reversed=False,
        )
        session.add(txn)
        session.flush()
        post_company_transaction(session, txn)
        session.commit()
        txn_id = txn.id

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = next(event for event in report.json()["events"] if event["source_id"] == txn_id)
    assert event["event_type"] == "refill"
    assert event["buy12"] == 2
    assert event["return12"] == 1
    assert event["buy48"] == 0
    assert event["return48"] == 0


def test_day_ordering_tie_breaker_source_id(client) -> None:
    day = date(2025, 10, 4)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)
    customer_id = create_customer(client, name="Ordering")
    system_id = create_system(client, customer_id=customer_id)

    happened_at = iso_at(day.isoformat(), "morning")
    order_a = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=happened_at,
        order_mode="replacement",
        installed=1,
        received=1,
        total=10,
        paid=10,
    )
    order_b = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=happened_at,
        order_mode="replacement",
        installed=1,
        received=1,
        total=20,
        paid=20,
    )

    fixed = datetime(2025, 10, 4, 9, 0, tzinfo=timezone.utc)
    with Session(app_db.engine) as session:
        for order_id in [order_a, order_b]:
            txn = session.get(CustomerTransaction, order_id)
            assert txn is not None
            txn.created_at = fixed
            txn.happened_at = fixed
            txn.day = derive_day(fixed)
            session.add(txn)
        session.commit()

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    events = [event for event in report.json()["events"] if event["event_type"] == "order"]
    assert [event["source_id"] for event in events] == sorted([order_a, order_b], reverse=True)
