from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlmodel import Session, select

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import DEFAULT_TENANT_ID
from app.db import engine
from app.models import CustomerTransaction, Expense, InventoryAdjustment, WalletAdjustment
from app.services.posting import allocate_happened_at, derive_day
from tests.backend.conftest import create_customer, create_order, create_system, init_inventory


def test_order_day_matches_happened_at(client) -> None:
    day = date(2026, 2, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)
    customer_id = create_customer(client, name="Day Integrity Order")
    system_id = create_system(client, customer_id=customer_id)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=1,
        received=1,
        price_total=100,
        paid_amount=100,
    )

    with Session(engine) as session:
        txn = session.get(CustomerTransaction, order_id)

    assert txn is not None
    assert txn.day == derive_day(txn.happened_at)


def test_cash_adjustment_day_matches_happened_at(client) -> None:
    happened_at = "2026-02-02T10:00:00"
    response = client.post(
        "/cash/adjust",
        json={"happened_at": happened_at, "delta_cash": 100, "reason": "day-integrity-wallet"},
    )
    assert response.status_code == 201, response.text

    with Session(engine) as session:
        adj = session.get(WalletAdjustment, response.json()["id"])

    assert adj is not None
    assert adj.day == derive_day(adj.happened_at)


def test_expense_day_matches_happened_at(client) -> None:
    day = date(2026, 2, 3)
    response = client.post(
        "/expenses",
        json={
            "date": day.isoformat(),
            "expense_type": "fuel",
            "amount": 25,
            "note": "day-integrity-expense",
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )
    assert response.status_code == 201, response.text

    with Session(engine) as session:
        expense = session.get(Expense, response.json()["id"])

    assert expense is not None
    assert expense.day == derive_day(expense.happened_at)


def test_inventory_adjustment_day_matches_happened_at(client) -> None:
    day = date(2026, 2, 4)
    response = client.post(
        "/inventory/adjust",
        json={
            "happened_at": f"{day.isoformat()}T10:00:00",
            "gas_type": "12kg",
            "delta_full": 1,
            "delta_empty": 0,
            "reason": "day-integrity-inventory",
        },
    )
    assert response.status_code == 200, response.text

    with Session(engine) as session:
        adj = session.exec(
            select(InventoryAdjustment).where(InventoryAdjustment.note == "day-integrity-inventory")
        ).one()

    assert adj.day == derive_day(adj.happened_at)


def test_allocate_happened_at_advisory_lock_does_not_deadlock(client) -> None:
    bucket = datetime(2026, 2, 5, 10, 0, 0, tzinfo=timezone.utc)

    with Session(engine) as session:
        with session.begin():
            first = allocate_happened_at(session, tenant_id=DEFAULT_TENANT_ID, value=bucket)
            session.add(
                WalletAdjustment(
                    tenant_id=DEFAULT_TENANT_ID,
                    happened_at=first,
                    day=derive_day(first),
                    delta_cash=1,
                    note="day-integrity-lock-first",
                )
            )
            session.flush()

            second = allocate_happened_at(session, tenant_id=DEFAULT_TENANT_ID, value=bucket)

    assert first != second
    assert first.microsecond == 0
    assert second.microsecond == 1
