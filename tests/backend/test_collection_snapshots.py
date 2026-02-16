from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select
from app.models import CustomerTransaction, LedgerEntry
from app.services.ledger import sum_ledger
from app.utils.time import business_date_from_utc
from conftest import create_customer, create_order, create_system, init_inventory


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
            "amount_money": 100,
            "happened_at": f"{d1}T10:00:00",
        },
    )
    _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 50,
            "happened_at": f"{d2}T10:00:00",
        },
    )

    from app import db as app_db
    with Session(app_db.engine) as session:
        cash_total = sum_ledger(session, account="cash", unit="money")
        assert cash_total == 150

    _delete_collection(client, first_payment["id"])

    from app import db as app_db
    with Session(app_db.engine) as session:
        cash_total = sum_ledger(session, account="cash", unit="money")
        assert cash_total == 50

    resp = client.get("/customers")
    assert resp.status_code == 200
    updated = next(c for c in resp.json() if c["id"] == customer_id)
    assert updated["money_balance"] == 150


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
            "amount_money": 100,
            "happened_at": f"{d0}T09:00:00",
        },
    )
    second = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 50,
            "happened_at": f"{d0}T10:00:00",
        },
    )

    from app import db as app_db
    with Session(app_db.engine) as session:
        cash_total = sum_ledger(session, account="cash", unit="money")
        assert cash_total == 150

    ret = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "return",
            "qty_12kg": 2,
            "qty_48kg": 1,
            "happened_at": f"{d1}T10:00:00",
        },
    )
    from app import db as app_db
    with Session(app_db.engine) as session:
        group_id = ret["id"]
        txns = session.exec(
            select(CustomerTransaction).where(CustomerTransaction.group_id == group_id)
        ).all()
        assert len(txns) == 2
        gas_types = {txn.gas_type for txn in txns}
        assert gas_types == {"12kg", "48kg"}
        entries = session.exec(
            select(LedgerEntry).where(
                LedgerEntry.source_type == "customer_txn",
                LedgerEntry.source_id.in_([txn.id for txn in txns]),
            )
        ).all()
        inv_empty_12 = sum(
            entry.amount
            for entry in entries
            if entry.account == "inv" and entry.gas_type == "12kg" and entry.state == "empty"
        )
        inv_empty_48 = sum(
            entry.amount
            for entry in entries
            if entry.account == "inv" and entry.gas_type == "48kg" and entry.state == "empty"
        )
        cust_cyl_12 = sum(
            entry.amount
            for entry in entries
            if entry.account == "cust_cylinders_debts" and entry.gas_type == "12kg"
        )
        cust_cyl_48 = sum(
            entry.amount
            for entry in entries
            if entry.account == "cust_cylinders_debts" and entry.gas_type == "48kg"
        )
        assert inv_empty_12 == 2
        assert inv_empty_48 == 1
        assert cust_cyl_12 == -2
        assert cust_cyl_48 == -1


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
            "happened_at": f"{d1}T10:00:00",
        },
    )

    refill_payload = {
        "happened_at": f"{d2}T09:00:00",
        "buy12": 0,
        "return12": 1,
        "buy48": 0,
        "return48": 0,
        "total_cost": 0,
        "paid_now": 0,
        "note": "test",
    }
    refill_resp = client.post("/inventory/refill", json=refill_payload)
    assert refill_resp.status_code == 200

    _delete_collection(client, ret["id"])

    latest = client.get("/inventory/latest")
    assert latest.status_code == 200
    data = latest.json()
    assert data["empty12"] == -1
