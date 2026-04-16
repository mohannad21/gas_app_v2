from __future__ import annotations

from sqlmodel import Session, select

from conftest import create_customer
from app.models import CustomerTransaction


def test_customer_adjustment_updates_customer_balances(client) -> None:
    customer_id = create_customer(client, name="Adj Test")

    create_payload = {
        "customer_id": customer_id,
        "amount_money": 150,
        "count_12kg": -10,
        "count_48kg": 0,
        "reason": "test_adjustment",
    }
    create_resp = client.post("/customer-adjustments", json=create_payload)
    assert create_resp.status_code == 201

    customer = client.get(f"/customers/{customer_id}").json()
    assert customer["money_balance"] == 150
    assert customer["cylinder_balance_12kg"] == -10

    adjustments = client.get(f"/customer-adjustments/{customer_id}")
    assert adjustments.status_code == 200
    items = adjustments.json()
    assert items
    assert items[0]["amount_money"] == 150
    assert items[0]["count_12kg"] == -10


def test_customer_adjustment_persists_true_after_snapshots_for_non_zero_balances(client) -> None:
    customer_id = create_customer(
        client,
        name="Snapshot Adjustment",
        starting_money=180,
        starting_12kg=-10,
        starting_48kg=9,
    )

    create_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 100,
            "count_12kg": -2,
            "count_48kg": 3,
            "reason": "manual_fix",
        },
    )
    assert create_resp.status_code == 201
    created = create_resp.json()

    assert created["amount_money"] == 100
    assert created["count_12kg"] == -2
    assert created["count_48kg"] == 3
    assert created["debt_cash"] == 280
    assert created["debt_cylinders_12"] == -12
    assert created["debt_cylinders_48"] == 12

    adjustments = client.get(f"/customer-adjustments/{customer_id}")
    assert adjustments.status_code == 200
    items = adjustments.json()
    latest = next(item for item in items if item["id"] == created["id"])
    assert latest["debt_cash"] == 280
    assert latest["debt_cylinders_12"] == -12
    assert latest["debt_cylinders_48"] == 12

    from app import db as app_db

    with Session(app_db.engine) as session:
        txns = session.exec(
            select(CustomerTransaction).where(CustomerTransaction.group_id == created["id"])
        ).all()
        assert len(txns) == 3
        assert {txn.gas_type for txn in txns} == {None, "12kg", "48kg"}
        assert all(txn.debt_cash == 280 for txn in txns)
        assert all(txn.debt_cylinders_12 == -12 for txn in txns)
        assert all(txn.debt_cylinders_48 == 12 for txn in txns)


def test_customer_adjustment_applies_delta_on_top_of_existing_non_zero_balance(client) -> None:
    customer_id = create_customer(
        client,
        name="Existing Balance Adjustment",
        starting_money=280,
        starting_12kg=-12,
        starting_48kg=12,
    )

    create_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": -20,
            "count_12kg": 1,
            "count_48kg": -1,
            "reason": "second_fix",
        },
    )
    assert create_resp.status_code == 201
    created = create_resp.json()

    assert created["amount_money"] == -20
    assert created["count_12kg"] == 1
    assert created["count_48kg"] == -1
    assert created["debt_cash"] == 260
    assert created["debt_cylinders_12"] == -11
    assert created["debt_cylinders_48"] == 11
