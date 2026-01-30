from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import create_customer, create_system, init_inventory


def _get_customer(client: TestClient, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}")
    assert resp.status_code == 200
    return resp.json()


def test_order_simple_debt(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Debt Customer")
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "delivered_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 0,
        "cylinders_received": 0,
        "price_total": 120.0,
        "money_received": 100.0,
        "money_given": 0.0,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201
    order = resp.json()
    assert order["applied_credit"] == 0
    assert order["money_balance_after"] == 20

    customer = _get_customer(client, customer_id)
    assert customer["money_balance"] == 20


def test_order_keep_change_credit(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Credit Customer")
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "delivered_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 0,
        "cylinders_received": 0,
        "price_total": 120.0,
        "money_received": 150.0,
        "money_given": 0.0,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201
    order = resp.json()
    assert order["money_balance_after"] == -30

    customer = _get_customer(client, customer_id)
    assert customer["money_balance"] == -30


def test_order_apply_credit_full(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Use Credit", starting_money=-30)
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "delivered_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 0,
        "cylinders_received": 0,
        "price_total": 120.0,
        "money_received": 90.0,
        "money_given": 0.0,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201
    order = resp.json()
    assert order["applied_credit"] == 30
    assert order["money_balance_after"] == 0

    customer = _get_customer(client, customer_id)
    assert customer["money_balance"] == 0


def test_order_apply_credit_partial(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Partial Credit", starting_money=-50)
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "delivered_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 0,
        "cylinders_received": 0,
        "price_total": 30.0,
        "money_received": 0.0,
        "money_given": 0.0,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201
    order = resp.json()
    assert order["applied_credit"] == 30
    assert order["money_balance_after"] == -20

    customer = _get_customer(client, customer_id)
    assert customer["money_balance"] == -20


def test_order_cylinder_swap_credit(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Cylinder Credit")
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "delivered_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 1,
        "cylinders_received": 2,
        "price_total": 0.0,
        "money_received": 0.0,
        "money_given": 0.0,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201

    customer = _get_customer(client, customer_id)
    assert customer["cylinder_balance_12kg"] == -1
