from __future__ import annotations

from sqlmodel import Session, select

import app.db as app_db
from app.models import LedgerEntry


def _sum_account(session: Session, account: str) -> int:
    rows = session.exec(select(LedgerEntry).where(LedgerEntry.account == account)).all()
    return sum(row.amount for row in rows)


def _ledger_for_source(session: Session, source_id: str) -> list[LedgerEntry]:
    return session.exec(
        select(LedgerEntry).where(
            LedgerEntry.source_type == "cash_adjust",
            LedgerEntry.source_id == source_id,
        )
    ).all()


def test_cash_adjustment_correction_and_audit(client) -> None:
    date = "2026-01-02"
    create_resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{date}T10:00:00", "delta_cash": -200, "reason": "mistake"},
    )
    assert create_resp.status_code == 201
    cash_id = create_resp.json()["id"]

    with Session(app_db.engine) as session:
        entries = _ledger_for_source(session, cash_id)
        assert len(entries) == 2
        assert _sum_account(session, "cash") == -200
        assert _sum_account(session, "cash_adjustments") == 200

    update_resp = client.put(f"/cash/adjust/{cash_id}", json={"delta_cash": -20, "reason": "fix"})
    assert update_resp.status_code == 200

    with Session(app_db.engine) as session:
        assert _sum_account(session, "cash") == -20
        assert _sum_account(session, "cash_adjustments") == 20

    delete_resp = client.delete(f"/cash/adjust/{cash_id}")
    assert delete_resp.status_code == 204
    adjustments = client.get("/cash/adjustments", params={"date": date, "include_deleted": True})
    assert adjustments.status_code == 200
    row = next(item for item in adjustments.json() if item["id"] == cash_id)
    assert row["is_deleted"] is True

    with Session(app_db.engine) as session:
        assert _sum_account(session, "cash") == 0
        assert _sum_account(session, "cash_adjustments") == 0


def test_cash_adjustment_idempotency(client) -> None:
    date = "2026-01-03"
    payload = {
        "happened_at": f"{date}T09:30:00",
        "delta_cash": 150,
        "reason": "idempotent",
        "request_id": "cash-adjust-req-1",
    }
    first = client.post("/cash/adjust", json=payload)
    assert first.status_code == 201
    cash_id = first.json()["id"]
    second = client.post("/cash/adjust", json=payload)
    assert second.status_code == 201
    assert second.json()["id"] == cash_id

    with Session(app_db.engine) as session:
        entries = _ledger_for_source(session, cash_id)
        assert len(entries) == 2
        assert _sum_account(session, "cash") == 150
        assert _sum_account(session, "cash_adjustments") == -150
