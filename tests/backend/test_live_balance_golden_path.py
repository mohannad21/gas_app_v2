from __future__ import annotations

from datetime import date, timedelta

from conftest import create_customer, init_inventory


def _post_collection(client, payload: dict) -> dict:
    resp = client.post("/collections", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _post_adjustment(client, payload: dict) -> dict:
    resp = client.post("/customer-adjustments", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _post_company_payment(client, payload: dict) -> dict:
    resp = client.post("/company/payments", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _post_refill(client, payload: dict) -> None:
    resp = client.post("/inventory/refill", json=payload)
    assert resp.status_code == 200


def _find_collection(client, *, customer_id: str, collection_id: str) -> dict:
    resp = client.get("/collections", params={"customer_id": customer_id})
    assert resp.status_code == 200
    return next(item for item in resp.json() if item["id"] == collection_id)


def _find_adjustment(client, *, customer_id: str, adjustment_id: str) -> dict:
    resp = client.get(f"/customer-adjustments/{customer_id}")
    assert resp.status_code == 200
    return next(item for item in resp.json() if item["id"] == adjustment_id)


def _find_payment(client, *, payment_id: str) -> dict:
    resp = client.get("/company/payments")
    assert resp.status_code == 200
    return next(item for item in resp.json() if item["id"] == payment_id)


def _find_refill(
    client,
    *,
    buy12: int,
    return12: int,
    buy48: int = 0,
    return48: int = 0,
    kind: str = "refill",
) -> dict:
    resp = client.get("/inventory/refills")
    assert resp.status_code == 200
    return next(
        item
        for item in resp.json()
        if item["kind"] == kind
        and item["buy12"] == buy12
        and item["return12"] == return12
        and item["buy48"] == buy48
        and item["return48"] == return48
    )


def test_customer_balance_after_collection_delete(client) -> None:
    customer_id = create_customer(client, name="Golden Delete Customer")
    day = date(2025, 11, 1)

    _post_adjustment(
        client,
        {
            "customer_id": customer_id,
            "amount_money": 500,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "opening",
            "happened_at": f"{day.isoformat()}T09:00:00",
        },
    )
    first_payment = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 200,
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )
    second_payment = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": f"{day.isoformat()}T11:00:00",
        },
    )

    second = _find_collection(client, customer_id=customer_id, collection_id=second_payment["id"])
    assert second["live_debt_cash"] == 200

    delete_resp = client.delete(f"/collections/{first_payment['id']}")
    assert delete_resp.status_code == 204

    second = _find_collection(client, customer_id=customer_id, collection_id=second_payment["id"])
    assert second["live_debt_cash"] == 400


def test_customer_balance_after_past_collection_inserted(client) -> None:
    customer_id = create_customer(client, name="Golden Past Collection")
    day = date(2025, 11, 2)

    _post_adjustment(
        client,
        {
            "customer_id": customer_id,
            "amount_money": 500,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "opening",
            "happened_at": f"{day.isoformat()}T09:00:00",
        },
    )
    later_payment = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 200,
            "happened_at": f"{day.isoformat()}T11:00:00",
        },
    )

    later = _find_collection(client, customer_id=customer_id, collection_id=later_payment["id"])
    assert later["live_debt_cash"] == 300

    _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )

    later = _find_collection(client, customer_id=customer_id, collection_id=later_payment["id"])
    assert later["live_debt_cash"] == 200


def test_company_balance_after_payment_delete(client) -> None:
    day = date(2025, 11, 3)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    _post_refill(
        client,
        {
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 5,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 500,
            "paid_now": 0,
        },
    )
    first_payment = _post_company_payment(
        client,
        {
            "amount": 200,
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )
    second_payment = _post_company_payment(
        client,
        {
            "amount": 100,
            "happened_at": f"{day.isoformat()}T11:00:00",
        },
    )

    second = _find_payment(client, payment_id=second_payment["id"])
    assert second["live_debt_cash"] == 200

    delete_resp = client.delete(f"/company/payments/{first_payment['id']}")
    assert delete_resp.status_code == 204

    second = _find_payment(client, payment_id=second_payment["id"])
    assert second["live_debt_cash"] == 400


def test_company_balance_after_past_refill_inserted(client) -> None:
    day = date(2025, 11, 4)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    _post_refill(
        client,
        {
            "happened_at": f"{day.isoformat()}T10:00:00",
            "buy12": 2,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 300,
            "paid_now": 300,
        },
    )
    later_refill = _find_refill(client, buy12=2, return12=0)
    assert later_refill["live_debt_cash"] == 0

    _post_refill(
        client,
        {
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 200,
            "paid_now": 0,
        },
    )

    later_refill = _find_refill(client, buy12=2, return12=0)
    assert later_refill["live_debt_cash"] == 200


def test_customer_balance_cross_zero_after_history_change(client) -> None:
    customer_id = create_customer(client, name="Golden Cross Zero")
    day = date(2025, 11, 5)

    _post_adjustment(
        client,
        {
            "customer_id": customer_id,
            "amount_money": 500,
            "count_12kg": 0,
            "count_48kg": 0,
            "reason": "opening",
            "happened_at": f"{day.isoformat()}T08:00:00",
        },
    )
    earlier_payment = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 200,
            "happened_at": f"{day.isoformat()}T09:00:00",
        },
    )
    later_payment = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 450,
            "happened_at": f"{day.isoformat()}T10:00:00",
        },
    )

    later = _find_collection(client, customer_id=customer_id, collection_id=later_payment["id"])
    assert later["live_debt_cash"] == -150

    delete_resp = client.delete(f"/collections/{earlier_payment['id']}")
    assert delete_resp.status_code == 204

    later = _find_collection(client, customer_id=customer_id, collection_id=later_payment["id"])
    assert later["live_debt_cash"] == 50


def test_customer_cylinder_balance_after_past_adjustment_inserted(client) -> None:
    customer_id = create_customer(client, name="Golden Cylinder Customer")
    day = date(2025, 11, 6)

    later_adjustment = _post_adjustment(
        client,
        {
            "customer_id": customer_id,
            "amount_money": 0,
            "count_12kg": 3,
            "count_48kg": 0,
            "reason": "later_cyl",
            "happened_at": f"{day.isoformat()}T11:00:00",
        },
    )

    later = _find_adjustment(client, customer_id=customer_id, adjustment_id=later_adjustment["id"])
    assert later["live_debt_cash"] == 0
    assert later["live_debt_cylinders_12"] == 3
    assert later["live_debt_cylinders_48"] == 0

    _post_adjustment(
        client,
        {
            "customer_id": customer_id,
            "amount_money": 0,
            "count_12kg": 5,
            "count_48kg": 0,
            "reason": "past_cyl",
            "happened_at": f"{day.isoformat()}T09:00:00",
        },
    )

    later = _find_adjustment(client, customer_id=customer_id, adjustment_id=later_adjustment["id"])
    assert later["live_debt_cash"] == 0
    assert later["live_debt_cylinders_12"] == 8
    assert later["live_debt_cylinders_48"] == 0


def test_company_cylinder_balance_after_refill_delete(client) -> None:
    day = date(2025, 11, 7)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=0, empty48=0)

    _post_refill(
        client,
        {
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": 5,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 300,
            "paid_now": 300,
        },
    )
    first_refill = _find_refill(client, buy12=5, return12=0)

    _post_refill(
        client,
        {
            "happened_at": f"{day.isoformat()}T10:00:00",
            "buy12": 0,
            "return12": 3,
            "buy48": 0,
            "return48": 0,
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    later_refill = _find_refill(client, buy12=0, return12=3)
    value_before_delete = later_refill["live_debt_cylinders_12"]
    assert later_refill["live_debt_cylinders_48"] == 0

    delete_resp = client.delete(f"/inventory/refills/{later_refill['refill_id']}")
    assert delete_resp.status_code == 204

    first_after_delete = _find_refill(client, buy12=5, return12=0)
    assert first_after_delete["refill_id"] == first_refill["refill_id"]
    assert first_after_delete["live_debt_cylinders_12"] == value_before_delete - 3
    assert first_after_delete["live_debt_cylinders_48"] == 0
