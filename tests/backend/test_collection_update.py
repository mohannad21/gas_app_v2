from __future__ import annotations

from datetime import date, timedelta

from conftest import create_customer, create_order, create_system, init_inventory, iso_at


def _post_collection(client, payload: dict) -> dict:
    resp = client.post("/collections", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_update_collection_missing_action_type_returns_422(client) -> None:
    day = date(2025, 12, 10)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat())
    customer_id = create_customer(client, name="Collection Missing Action")
    collection = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": iso_at(day.isoformat(), "morning"),
        },
    )

    resp = client.put(
        f"/collections/{collection['id']}",
        json={
            "amount_money": 200,
            "happened_at": iso_at(day.isoformat(), "evening"),
        },
    )

    assert resp.status_code == 422


def test_update_collection_payment_changes_amount(client) -> None:
    day = date(2025, 12, 11)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat())
    customer_id = create_customer(client, name="Collection Payment")
    collection = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": iso_at(day.isoformat(), "morning"),
        },
    )

    resp = client.put(
        f"/collections/{collection['id']}",
        json={
            "action_type": "payment",
            "amount_money": 200,
            "happened_at": iso_at(day.isoformat(), "evening"),
        },
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["action_type"] == "payment"
    assert data["amount_money"] == 200


def test_update_collection_payout_changes_amount(client) -> None:
    day = date(2025, 12, 12)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat())
    customer_id = create_customer(client, name="Collection Payout")
    collection = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "payout",
            "amount_money": 50,
            "happened_at": iso_at(day.isoformat(), "morning"),
        },
    )

    resp = client.put(
        f"/collections/{collection['id']}",
        json={
            "action_type": "payout",
            "amount_money": 75,
            "happened_at": iso_at(day.isoformat(), "evening"),
        },
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["action_type"] == "payout"
    assert data["amount_money"] == 75


def test_update_collection_return_changes_quantities(client) -> None:
    day = date(2025, 12, 13)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=0)
    customer_id = create_customer(client, name="Collection Return")
    system_id = create_system(client, customer_id=customer_id)
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=iso_at(day.isoformat(), "morning"),
        gas_type="12kg",
        installed=3,
        received=0,
        price_total=0,
        paid_amount=0,
    )
    collection = _post_collection(
        client,
        {
            "customer_id": customer_id,
            "action_type": "return",
            "qty_12kg": 2,
            "happened_at": iso_at(day.isoformat(), "midday"),
        },
    )

    resp = client.put(
        f"/collections/{collection['id']}",
        json={
            "action_type": "return",
            "qty_12kg": 3,
            "happened_at": iso_at(day.isoformat(), "evening"),
        },
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["action_type"] == "return"
    assert data["qty_12kg"] == 3
