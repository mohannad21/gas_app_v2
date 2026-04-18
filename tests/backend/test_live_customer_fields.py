from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest


def _create_customer(client, name: str) -> str:
    resp = client.post(
        "/customers",
        json={
            "name": name,
            "phone": None,
            "address": None,
            "note": "",
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_adjustment_live_debt_cash_correct_after_creation(client) -> None:
    customer_id = _create_customer(client, "Live Debt Adjustment A")

    create_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 500,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "live_cash_a",
        },
    )
    assert create_resp.status_code == 201

    adjustments = client.get(f"/customer-adjustments/{customer_id}")
    assert adjustments.status_code == 200
    items = adjustments.json()
    assert len(items) == 1
    entry = items[0]
    assert entry["live_debt_cash"] == 500
    assert entry["live_debt_cylinders_12"] == 0
    assert entry["live_debt_cylinders_48"] == 0


def test_adjustment_live_debt_cash_correct_per_boundary(client) -> None:
    now = datetime.now(timezone.utc)
    day = (now - timedelta(days=2)).date().isoformat()
    customer_id = _create_customer(client, "Live Boundary Customer")

    first_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 300,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "boundary_a",
            "happened_at": f"{day}T09:00:00",
        },
    )
    assert first_resp.status_code == 201

    second_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 200,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "boundary_b",
            "happened_at": f"{day}T10:00:00",
        },
    )
    assert second_resp.status_code == 201

    adjustments = client.get(f"/customer-adjustments/{customer_id}")
    assert adjustments.status_code == 200
    items = adjustments.json()
    first = next(item for item in items if item["amount_money"] == 300)
    second = next(item for item in items if item["amount_money"] == 200)
    assert first["live_debt_cash"] == 300
    assert second["live_debt_cash"] == 500


def test_adjustment_live_fields_update_after_later_row_deleted(client) -> None:
    # Customer adjustments do not expose a direct delete or reverse endpoint in this codebase.
    pytest.skip("No direct delete endpoint for customer adjustments")


def test_collection_payment_live_debt_cash_correct(client) -> None:
    now = datetime.now(timezone.utc)
    day = (now - timedelta(days=1)).date().isoformat()
    customer_id = _create_customer(client, "Live Collection Customer")

    adjustment_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 500,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "opening_debt",
            "happened_at": f"{day}T09:00:00",
        },
    )
    assert adjustment_resp.status_code == 201

    payment_resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 200,
            "happened_at": f"{day}T10:00:00",
        },
    )
    assert payment_resp.status_code == 201
    payment_id = payment_resp.json()["id"]

    collections = client.get("/collections", params={"customer_id": customer_id})
    assert collections.status_code == 200
    items = collections.json()
    entry = next(item for item in items if item["id"] == payment_id)
    assert entry["live_debt_cash"] == 300
