from __future__ import annotations

from datetime import date, timedelta

import pytest

from conftest import create_customer, init_inventory


def _post_collection(client, payload: dict) -> dict:
    resp = client.post("/collections", json=payload)
    assert resp.status_code == 201
    return resp.json()


def test_customer_adjustment_live_fields_after_earlier_adjustment_deleted(client) -> None:
    # Customer adjustments do not expose a direct delete or reverse endpoint in this codebase.
    pytest.skip("delete endpoint not yet implemented")


def test_customer_adjustment_live_fields_after_past_adjustment_inserted(client) -> None:
    customer_id = create_customer(client, name="Past Adjustment Customer")
    day = date(2025, 10, 12)

    first_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 300,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "adjust_a",
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )
    assert first_resp.status_code == 201

    adjustments = client.get(f"/customer-adjustments/{customer_id}")
    assert adjustments.status_code == 200
    items = adjustments.json()
    first = next(item for item in items if item["amount_money"] == 300)
    assert first["live_debt_cash"] == 300

    second_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 100,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "adjust_b",
            "happened_at": f"{day.isoformat()}T09:00:00",
        },
    )
    assert second_resp.status_code == 201

    adjustments = client.get(f"/customer-adjustments/{customer_id}")
    assert adjustments.status_code == 200
    items = adjustments.json()
    first = next(item for item in items if item["amount_money"] == 300)
    second = next(item for item in items if item["amount_money"] == 100)
    assert first["live_debt_cash"] == 400
    assert second["live_debt_cash"] == 100


def test_collection_live_fields_after_earlier_collection_deleted(client) -> None:
    customer_id = create_customer(client, name="Delete Collection Customer")
    day = date(2025, 10, 13)

    adjustment_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 500,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "opening_debt",
            "happened_at": f"{day.isoformat()}T08:00:00",
        },
    )
    assert adjustment_resp.status_code == 201

    first_payment = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 200,
            "happened_at": f"{day.isoformat()}T09:00:00",
        },
    )
    second_payment = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )

    collections = client.get("/collections", params={"customer_id": customer_id})
    assert collections.status_code == 200
    items = collections.json()
    first = next(item for item in items if item["id"] == first_payment["id"])
    second = next(item for item in items if item["id"] == second_payment["id"])
    assert first["live_debt_cash"] == 300
    assert second["live_debt_cash"] == 200

    delete_resp = client.delete(f"/collections/{first_payment['id']}")
    assert delete_resp.status_code == 204

    collections = client.get("/collections", params={"customer_id": customer_id})
    assert collections.status_code == 200
    items = collections.json()
    second = next(item for item in items if item["id"] == second_payment["id"])
    assert second["live_debt_cash"] == 400


def test_company_refill_live_fields_after_earlier_payment_deleted(client) -> None:
    # Company payments do not expose a delete endpoint in this codebase.
    pytest.skip("delete endpoint not yet implemented")


def test_buy_iron_live_cylinders_not_affected_by_history_changes(client) -> None:
    day = date(2025, 10, 14)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=0, full48=0, empty48=0)

    first_refill = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 0,
            "return12": 3,
            "buy48": 0,
            "return48": 0,
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert first_refill.status_code == 200

    buy_iron = client.post(
        "/company/buy_iron",
        json={
            "happened_at": f"{day.isoformat()}T10:00:00",
            "new12": 5,
            "new48": 0,
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert buy_iron.status_code == 201

    second_refill = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T11:00:00",
            "buy12": 0,
            "return12": 2,
            "buy48": 0,
            "return48": 0,
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert second_refill.status_code == 200

    refills = client.get("/inventory/refills")
    assert refills.status_code == 200
    buy_iron_row = next(item for item in refills.json() if item.get("kind") == "buy_iron")
    assert buy_iron_row["live_debt_cylinders_12"] == 3
    assert buy_iron_row["kind"] == "buy_iron"
