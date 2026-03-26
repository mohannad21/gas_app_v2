from __future__ import annotations

from sqlmodel import Session, select

from app.models import CompanyTransaction, CustomerTransaction
from conftest import create_customer, create_system, init_inventory


def test_order_create_rolls_back_on_posting_failure(client, monkeypatch) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Rollback Order")
    system_id = create_system(client, customer_id=customer_id)

    from app import db as app_db
    from app.routers import orders as orders_router

    def _boom(session, txn):  # noqa: ANN001
        raise RuntimeError("posting failed")

    monkeypatch.setattr(orders_router, "post_customer_transaction", _boom)

    try:
        client.post(
            "/orders",
            json={
                "customer_id": customer_id,
                "system_id": system_id,
                "happened_at": "2025-01-02T10:00:00",
                "gas_type": "12kg",
                "cylinders_installed": 1,
                "cylinders_received": 0,
                "price_total": 100,
                "paid_amount": 0,
            },
        )
    except RuntimeError as exc:
        assert str(exc) == "posting failed"
    else:
        raise AssertionError("Expected order create to fail")

    with Session(app_db.engine) as session:
        txns = session.exec(select(CustomerTransaction)).all()
        assert txns == []

    customer_resp = client.get(f"/customers/{customer_id}")
    assert customer_resp.status_code == 200
    assert customer_resp.json()["money_balance"] == 0


def test_collection_create_rolls_back_on_posting_failure(client, monkeypatch) -> None:
    customer_id = create_customer(client, name="Rollback Collection")

    from app import db as app_db
    from app.routers import collections as collections_router

    def _boom(session, txn):  # noqa: ANN001
        raise RuntimeError("posting failed")

    monkeypatch.setattr(collections_router, "post_customer_transaction", _boom)

    try:
        client.post(
            "/collections",
            json={
                "customer_id": customer_id,
                "action_type": "payment",
                "amount_money": 100,
                "happened_at": "2025-01-02T10:00:00",
            },
        )
    except RuntimeError as exc:
        assert str(exc) == "posting failed"
    else:
        raise AssertionError("Expected collection create to fail")

    with Session(app_db.engine) as session:
        txns = session.exec(select(CustomerTransaction)).all()
        assert txns == []


def test_refill_create_rolls_back_on_posting_failure(client, monkeypatch) -> None:
    init_inventory(client, date="2025-01-01")

    from app import db as app_db
    from app.routers import inventory as inventory_router

    def _boom(session, txn):  # noqa: ANN001
        raise RuntimeError("posting failed")

    monkeypatch.setattr(inventory_router, "post_company_transaction", _boom)

    try:
        client.post(
            "/inventory/refill",
            json={
                "happened_at": "2025-01-02T10:00:00",
                "buy12": 2,
                "return12": 0,
                "buy48": 0,
                "return48": 0,
                "total_cost": 100,
                "paid_now": 50,
            },
        )
    except RuntimeError as exc:
        assert str(exc) == "posting failed"
    else:
        raise AssertionError("Expected refill create to fail")

    with Session(app_db.engine) as session:
        txns = session.exec(select(CompanyTransaction).where(CompanyTransaction.kind == "refill")).all()
        assert txns == []
