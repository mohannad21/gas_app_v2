from __future__ import annotations

from datetime import date

from sqlmodel import Session

import app.db as app_db
from app.config import DEFAULT_TENANT_ID
from app.models import BankTransfer, Expense


def test_create_bank_deposit_stores_in_bank_transfers_not_expenses(client) -> None:
    day = date(2026, 2, 1)
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day.isoformat()}T08:00:00", "delta_cash": 1000, "reason": "open"},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/cash/bank_deposit",
        json={"happened_at": f"{day.isoformat()}T09:00:00", "amount": 200, "direction": "wallet_to_bank"},
    )
    assert resp.status_code == 201
    deposit_id = resp.json()["id"]

    with Session(app_db.engine) as session:
        bt = session.get(BankTransfer, deposit_id)
        assert bt is not None
        assert bt.direction == "wallet_to_bank"
        assert bt.amount == 200
        assert bt.tenant_id == DEFAULT_TENANT_ID

        expense = session.get(Expense, deposit_id)
        assert expense is None


def test_bank_deposit_ledger_source_type_is_bank_transfer(client) -> None:
    from sqlmodel import select as sel
    from app.models import LedgerEntry

    day = date(2026, 2, 2)
    resp = client.post(
        "/cash/bank_deposit",
        json={"happened_at": f"{day.isoformat()}T09:00:00", "amount": 100, "direction": "bank_to_wallet"},
    )
    assert resp.status_code == 201
    deposit_id = resp.json()["id"]

    with Session(app_db.engine) as session:
        entries = session.exec(
            sel(LedgerEntry)
            .where(LedgerEntry.source_id == deposit_id)
        ).all()
        assert entries
        assert all(e.source_type == "bank_transfer" for e in entries)


def test_delete_bank_deposit_soft_deletes_bank_transfer(client) -> None:
    day = date(2026, 2, 6)
    client.post("/cash/adjust", json={"happened_at": f"{day.isoformat()}T08:00:00", "delta_cash": 500, "reason": "open"})
    resp = client.post(
        "/cash/bank_deposit",
        json={"happened_at": f"{day.isoformat()}T09:00:00", "amount": 100, "direction": "wallet_to_bank"},
    )
    deposit_id = resp.json()["id"]

    del_resp = client.delete(f"/cash/bank_deposit/{deposit_id}")
    assert del_resp.status_code == 204

    with Session(app_db.engine) as session:
        bt = session.get(BankTransfer, deposit_id)
        assert bt is not None
        assert bt.deleted_at is not None

    report = client.get("/reports/day", params={"date": day.isoformat()})
    events = [e for e in report.json()["events"] if e.get("event_type") in ("wallet_to_bank", "bank_to_wallet")]
    assert not any(e["id"] == deposit_id for e in events)
