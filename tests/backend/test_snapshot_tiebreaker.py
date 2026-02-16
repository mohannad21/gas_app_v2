from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session, select

from conftest import init_inventory, iso_at


def test_company_snapshot_tiebreaker_same_timestamp(client) -> None:
    day = date(2025, 11, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=0, empty48=0)

    happened_at = iso_at(day.isoformat(), "morning")

    first_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": happened_at,
            "buy12": 1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "note": "first",
            "total_cost": 100,
            "paid_now": 0,
        },
    )
    assert first_resp.status_code == 200

    second_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": happened_at,
            "buy12": 2,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "note": "second",
            "total_cost": 50,
            "paid_now": 0,
        },
    )
    assert second_resp.status_code == 200

    import app.db as app_db
    from app.models import CompanyTransaction

    with Session(app_db.engine) as session:
        txns = session.exec(
            select(CompanyTransaction)
            .where(CompanyTransaction.kind == "refill")
            .where(CompanyTransaction.is_reversed == False)  # noqa: E712
        ).all()
        first = next(txn for txn in txns if txn.note == "first")
        second = next(txn for txn in txns if txn.note == "second")

        assert first.debt_cash == 100
        assert second.debt_cash == 150
