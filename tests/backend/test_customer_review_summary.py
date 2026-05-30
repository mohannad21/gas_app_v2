from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import create_customer, create_order, create_system, init_inventory


def _order_count(client: TestClient, customer_id: str) -> int:
    resp = client.get(f"/customers/{customer_id}")
    assert resp.status_code == 200
    return resp.json()["order_count"]


def test_sell_full_order_does_not_increment_order_count(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Sell Full Count")
    system_id = create_system(client, customer_id=customer_id)

    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": "2025-01-02T10:00:00",
            "order_mode": "sell_iron",
            "gas_type": "12kg",
            "cylinders_installed": 2,
            "cylinders_received": 0,
            "price_total": 100,
            "paid_amount": 100,
        },
    )

    assert resp.status_code == 201
    assert _order_count(client, customer_id) == 0


def test_buy_empty_order_does_not_increment_order_count(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Buy Empty Count")
    system_id = create_system(client, customer_id=customer_id)

    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": "2025-01-02T10:00:00",
            "order_mode": "buy_iron",
            "gas_type": "12kg",
            "cylinders_installed": 0,
            "cylinders_received": 2,
            "price_total": 100,
            "paid_amount": 100,
        },
    )

    assert resp.status_code == 201
    assert _order_count(client, customer_id) == 0


def test_deleted_replacement_does_not_count(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Deleted Replacement Count")
    system_id = create_system(client, customer_id=customer_id)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        installed=1,
        received=1,
    )
    assert _order_count(client, customer_id) == 1

    delete_resp = client.delete(f"/orders/{order_id}")
    assert delete_resp.status_code == 204
    assert _order_count(client, customer_id) == 0


def test_cash_payment_does_not_increment_order_count(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Cash Payment Count")

    resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "qty_12kg": 0,
            "qty_48kg": 0,
            "happened_at": "2025-01-02T10:00:00",
        },
    )

    assert resp.status_code == 201
    assert _order_count(client, customer_id) == 0
