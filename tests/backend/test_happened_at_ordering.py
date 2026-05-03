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
from app.models import CashAdjustment, CompanyTransaction, CustomerTransaction, Expense, InventoryAdjustment
from app.services.posting import allocate_happened_at, derive_day
from tests.backend.conftest import create_customer, create_system, init_inventory


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_allocate_happened_at_assigns_monotonic_microseconds_within_same_second_bucket(client) -> None:
    bucket = datetime(2025, 12, 1, 9, 51, 0, tzinfo=timezone.utc)

    with Session(engine) as session:
        first = allocate_happened_at(session, tenant_id=DEFAULT_TENANT_ID, value=bucket)
        session.add(
            CashAdjustment(
                tenant_id=DEFAULT_TENANT_ID,
                happened_at=first,
                day=derive_day(first),
                delta_cash=10,
                note="allocator-first",
            )
        )
        session.flush()

        second = allocate_happened_at(session, tenant_id=DEFAULT_TENANT_ID, value=bucket)
        session.add(
            CashAdjustment(
                tenant_id=DEFAULT_TENANT_ID,
                happened_at=second,
                day=derive_day(second),
                delta_cash=20,
                note="allocator-second",
            )
        )
        session.flush()

        third = allocate_happened_at(session, tenant_id=DEFAULT_TENANT_ID, value=bucket)

    assert first < second < third
    assert [first.microsecond, second.microsecond, third.microsecond] == [0, 1, 2]


def test_same_second_api_writes_store_monotonic_happened_at_across_models(client) -> None:
    day = date(2025, 12, 2)
    visible_at = f"{day.isoformat()}T09:51:00"

    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=8, empty48=3)
    customer_id = create_customer(client, name="Mixed Sequence")

    cash = client.post(
        "/cash/adjust",
        json={"happened_at": visible_at, "delta_cash": 1000, "reason": "mixed-cash"},
    )
    assert cash.status_code == 201

    expense = client.post(
        "/expenses",
        json={
            "date": day.isoformat(),
            "expense_type": "fuel",
            "amount": 10,
            "note": "mixed-expense",
            "happened_at": visible_at,
        },
    )
    assert expense.status_code == 201

    transfer = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": visible_at,
            "amount": 200,
            "direction": "wallet_to_bank",
            "note": "mixed-transfer",
        },
    )
    assert transfer.status_code == 201

    inventory = client.post(
        "/inventory/adjust",
        json={
            "happened_at": visible_at,
            "gas_type": "12kg",
            "delta_full": 1,
            "delta_empty": 0,
            "reason": "mixed-inventory",
        },
    )
    assert inventory.status_code == 200

    company = client.post(
        "/company/payments",
        json={"happened_at": visible_at, "amount": 50, "note": "mixed-company"},
    )
    assert company.status_code == 201

    customer = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 25,
            "reason": "mixed-customer",
            "happened_at": visible_at,
        },
    )
    assert customer.status_code == 201

    with Session(engine) as session:
        cash_row = session.exec(
            select(CashAdjustment).where(CashAdjustment.note == "mixed-cash")
        ).one()
        expense_row = session.exec(
            select(Expense).where(Expense.kind == "expense").where(Expense.note == "mixed-expense")
        ).one()
        transfer_row = session.exec(
            select(Expense).where(Expense.kind == "deposit").where(Expense.note == "mixed-transfer")
        ).one()
        inventory_row = session.exec(
            select(InventoryAdjustment).where(InventoryAdjustment.note == "mixed-inventory")
        ).one()
        company_row = session.exec(
            select(CompanyTransaction).where(CompanyTransaction.kind == "payment").where(CompanyTransaction.note == "mixed-company")
        ).one()
        customer_row = session.exec(
            select(CustomerTransaction)
            .where(CustomerTransaction.kind == "adjust")
            .where(CustomerTransaction.note == "mixed-customer")
            .where(CustomerTransaction.gas_type == None)  # noqa: E711
        ).one()

    happened_ats = [
        cash_row.happened_at,
        expense_row.happened_at,
        transfer_row.happened_at,
        inventory_row.happened_at,
        company_row.happened_at,
        customer_row.happened_at,
    ]

    assert happened_ats == sorted(happened_ats)
    assert len({value.microsecond for value in happened_ats}) == len(happened_ats)


def test_daily_report_orders_same_second_customer_sequence_by_hidden_happened_at(client) -> None:
    day = date(2025, 12, 3)
    visible_at = f"{day.isoformat()}T09:51:00"

    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=6, empty12=3, full48=6, empty48=3)
    customer_id = create_customer(client, name="Same Second Customer")
    system_id = create_system(client, customer_id=customer_id, name="Main Kitchen")

    replacement = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": visible_at,
            "order_mode": "replacement",
            "gas_type": "48kg",
            "cylinders_installed": 1,
            "cylinders_received": 0,
            "price_total": 500,
            "paid_amount": 0,
        },
    )
    assert replacement.status_code == 201

    payment = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 500,
            "happened_at": visible_at,
        },
    )
    assert payment.status_code == 201

    returned = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "return",
            "qty_48kg": 1,
            "happened_at": visible_at,
        },
    )
    assert returned.status_code == 201

    sell_full = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": visible_at,
            "order_mode": "sell_iron",
            "gas_type": "48kg",
            "cylinders_installed": 1,
            "cylinders_received": 0,
            "price_total": 700,
            "paid_amount": 700,
        },
    )
    assert sell_full.status_code == 201

    buy_empty = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": visible_at,
            "order_mode": "buy_iron",
            "gas_type": "12kg",
            "cylinders_installed": 0,
            "cylinders_received": 1,
            "price_total": 30,
            "paid_amount": 30,
        },
    )
    assert buy_empty.status_code == 201

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200
    events = [
        event
        for event in report.json()["events"]
        if event.get("customer_name") == "Same Second Customer"
        and event["label"] in {"Replacement", "Payment from customer", "Returned empties", "Sell Full", "Buy Empty"}
    ]

    assert [event["label"] for event in events[:5]] == [
        "Buy Empty",
        "Sell Full",
        "Returned empties",
        "Payment from customer",
        "Replacement",
    ]
    assert [_parse_iso(event["effective_at"]) for event in events[:5]] == sorted(
        (_parse_iso(event["effective_at"]) for event in events[:5]),
        reverse=True,
    )


def test_daily_report_orders_same_second_mixed_activity_cards_newest_first(client) -> None:
    day = date(2025, 12, 4)
    visible_at = f"{day.isoformat()}T09:51:00"

    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=8, empty48=3)
    customer_id = create_customer(client, name="Mixed Cards Customer")

    cash = client.post(
        "/cash/adjust",
        json={"happened_at": visible_at, "delta_cash": 1000, "reason": "mixed-report-cash"},
    )
    assert cash.status_code == 201

    expense = client.post(
        "/expenses",
        json={
            "date": day.isoformat(),
            "expense_type": "fuel",
            "amount": 10,
            "note": "mixed-report-expense",
            "happened_at": visible_at,
        },
    )
    assert expense.status_code == 201

    transfer = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": visible_at,
            "amount": 200,
            "direction": "wallet_to_bank",
            "note": "mixed-report-transfer",
        },
    )
    assert transfer.status_code == 201

    inventory = client.post(
        "/inventory/adjust",
        json={
            "happened_at": visible_at,
            "gas_type": "12kg",
            "delta_full": 1,
            "delta_empty": 0,
            "reason": "mixed-report-inventory",
        },
    )
    assert inventory.status_code == 200

    company = client.post(
        "/company/payments",
        json={"happened_at": visible_at, "amount": 50, "note": "mixed-report-company"},
    )
    assert company.status_code == 201

    customer = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 25,
            "reason": "mixed-report-customer",
            "happened_at": visible_at,
        },
    )
    assert customer.status_code == 201

    report = client.get("/reports/day", params={"date": day.isoformat()})
    assert report.status_code == 200

    tagged_events = [
        event
        for event in report.json()["events"]
        if event.get("reason") in {
            "mixed-report-cash",
            "mixed-report-expense",
            "mixed-report-transfer",
            "mixed-report-inventory",
            "mixed-report-company",
            "mixed-report-customer",
        }
    ]

    assert [event["reason"] for event in tagged_events[:6]] == [
        "mixed-report-customer",
        "mixed-report-company",
        "mixed-report-inventory",
        "mixed-report-transfer",
        "mixed-report-expense",
        "mixed-report-cash",
    ]
    assert [_parse_iso(event["effective_at"]) for event in tagged_events[:6]] == sorted(
        (_parse_iso(event["effective_at"]) for event in tagged_events[:6]),
        reverse=True,
    )
