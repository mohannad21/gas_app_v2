from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from conftest import init_inventory, iso_at


def _company_txn_by_note(note: str):
    import app.db as app_db
    from app.models import CompanyTransaction

    with Session(app_db.engine) as session:
        return session.exec(
            select(CompanyTransaction)
            .where(CompanyTransaction.note == note)
            .order_by(CompanyTransaction.created_at.desc())
        ).first()


def _company_txns_by_request_id(request_id: str):
    import app.db as app_db
    from app.models import CompanyTransaction

    with Session(app_db.engine) as session:
        return session.exec(
            select(CompanyTransaction)
            .where(CompanyTransaction.request_id == request_id)
            .order_by(CompanyTransaction.created_at.desc())
        ).all()


def _post_refill(client, *, day: date, kind: str, note: str, request_id: str | None = None):
    resp = client.post(
        "/inventory/refill",
        json={
            "kind": kind,
            "happened_at": iso_at(day.isoformat(), "morning"),
            "buy12": 2 if kind == "refill" else 0,
            "return12": 1,
            "buy48": 0,
            "return48": 0,
            "total_cost": 200 if kind == "refill" else 0,
            "paid_amount": 50 if kind == "refill" else 0,
            "note": note,
            **({"request_id": request_id} if request_id else {}),
        },
    )
    assert resp.status_code == 200, resp.text
    return resp


def _init_for_day(client, day: date) -> None:
    init_inventory(
        client,
        date=(day - timedelta(days=1)).isoformat(),
        full12=10,
        empty12=10,
        full48=10,
        empty48=10,
    )


def test_inventory_refill_kind_refill_stores_refill(client) -> None:
    day = date(2025, 10, 1)
    _init_for_day(client, day)

    _post_refill(client, day=day, kind="refill", note="explicit-refill")

    txn = _company_txn_by_note("explicit-refill")
    assert txn is not None
    assert txn.kind == "refill"


def test_inventory_refill_kind_dist_return_stores_dist_return(client) -> None:
    day = date(2025, 10, 2)
    _init_for_day(client, day)

    _post_refill(client, day=day, kind="dist_return_empties", note="explicit-return")

    txn = _company_txn_by_note("explicit-return")
    assert txn is not None
    assert txn.kind == "dist_return_empties"


def test_reports_day_uses_stored_refill_kind_for_return_only_refill(client) -> None:
    import app.db as app_db
    from app.config import DEFAULT_TENANT_ID
    from app.models import CompanyTransaction
    from app.services.posting import derive_day

    day = date(2025, 10, 3)
    happened_at = datetime(2025, 10, 3, 9, 0, tzinfo=timezone.utc)

    with Session(app_db.engine) as session:
        txn = CompanyTransaction(
            tenant_id=DEFAULT_TENANT_ID,
            happened_at=happened_at,
            day=derive_day(happened_at),
            kind="refill",
            buy12=0,
            buy48=0,
            return12=1,
            return48=0,
            total=0,
            paid=0,
            note="legacy-return-only",
        )
        session.add(txn)
        session.commit()

    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200
    event_types = [event["event_type"] for event in resp.json()["events"]]
    assert "refill" in event_types
    assert "dist_return_empties" not in event_types


def test_reports_day_does_not_emit_refill_for_dist_return_transaction(client) -> None:
    day = date(2025, 10, 4)
    _init_for_day(client, day)
    _post_refill(client, day=day, kind="dist_return_empties", note="report-explicit-return")

    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200
    event_types = [event["event_type"] for event in resp.json()["events"]]
    assert "dist_return_empties" in event_types
    assert "refill" not in event_types


def test_inventory_refills_list_and_details_resolve_dist_return(client) -> None:
    day = date(2025, 10, 5)
    _init_for_day(client, day)
    _post_refill(client, day=day, kind="dist_return_empties", note="list-detail-return")

    rows = client.get("/inventory/refills").json()
    row = next(item for item in rows if item["kind"] == "dist_return_empties")
    assert row["return12"] == 1

    detail_resp = client.get(f"/inventory/refills/{row['refill_id']}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["kind"] == "dist_return_empties"


def test_inventory_refill_update_preserves_dist_return_when_kind_omitted(client) -> None:
    day = date(2025, 10, 6)
    _init_for_day(client, day)
    _post_refill(client, day=day, kind="dist_return_empties", note="update-return")
    refill_id = client.get("/inventory/refills").json()[0]["refill_id"]

    resp = client.put(
        f"/inventory/refills/{refill_id}",
        json={
            "buy12": 0,
            "return12": 2,
            "buy48": 0,
            "return48": 0,
            "total_cost": 0,
            "paid_amount": 0,
            "note": "updated-return",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["kind"] == "dist_return_empties"

    txn = _company_txn_by_note("updated-return")
    assert txn is not None
    assert txn.kind == "dist_return_empties"


def test_inventory_refill_delete_soft_deletes_dist_return(client) -> None:
    day = date(2025, 10, 7)
    _init_for_day(client, day)
    _post_refill(client, day=day, kind="dist_return_empties", note="delete-return")
    refill_id = client.get("/inventory/refills").json()[0]["refill_id"]

    delete_resp = client.delete(f"/inventory/refills/{refill_id}")
    assert delete_resp.status_code == 204

    rows = client.get("/inventory/refills", params={"include_deleted": True}).json()
    deleted = next(item for item in rows if item["refill_id"] == refill_id)
    assert deleted["kind"] == "dist_return_empties"
    assert deleted["is_deleted"] is True


def test_inventory_refill_idempotency_works_for_dist_return(client) -> None:
    day = date(2025, 10, 8)
    _init_for_day(client, day)
    request_id = "dist-return-idempotency"

    _post_refill(client, day=day, kind="dist_return_empties", note="idempotent-return", request_id=request_id)
    _post_refill(client, day=day, kind="dist_return_empties", note="idempotent-return", request_id=request_id)

    txns = _company_txns_by_request_id(request_id)
    assert len(txns) == 1
    assert txns[0].kind == "dist_return_empties"


def test_company_payment_to_company_explicit_kind_stores_kind_and_paid(client) -> None:
    resp = client.post(
        "/company/payments",
        json={"kind": "payment_to_company", "amount": 500, "happened_at": iso_at("2025-10-09"), "note": "pay-company"},
    )
    assert resp.status_code == 201, resp.text

    txn = _company_txn_by_note("pay-company")
    assert txn is not None
    assert txn.kind == "payment_to_company"
    assert txn.paid == 500


def test_company_payment_from_company_explicit_kind_stores_kind_and_paid(client) -> None:
    resp = client.post(
        "/company/payments",
        json={
            "kind": "payment_from_company",
            "amount": -300,
            "happened_at": iso_at("2025-10-10"),
            "note": "receive-company",
        },
    )
    assert resp.status_code == 201, resp.text

    txn = _company_txn_by_note("receive-company")
    assert txn is not None
    assert txn.kind == "payment_from_company"
    assert txn.paid == -300


def test_company_payment_kind_amount_sign_mismatch_returns_422(client) -> None:
    resp = client.post(
        "/company/payments",
        json={
            "kind": "payment_to_company",
            "amount": -100,
            "happened_at": iso_at("2025-10-11"),
            "note": "bad-payment",
        },
    )
    assert resp.status_code == 422


def test_company_payment_no_kind_returns_422_kind_required(client) -> None:
    resp = client.post(
        "/company/payments",
        json={"amount": -125, "happened_at": iso_at("2025-10-12"), "note": "old-client-payment"},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == "kind_required"
