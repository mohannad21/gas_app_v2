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
        "happened_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 0,
        "cylinders_received": 0,
        "price_total": 120,
        "paid_amount": 100,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201

    customer = _get_customer(client, customer_id)
    assert customer["money_balance"] == 20


def test_order_keep_change_credit(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Credit Customer")
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "happened_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 0,
        "cylinders_received": 0,
        "price_total": 120,
        "paid_amount": 150,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201

    customer = _get_customer(client, customer_id)
    assert customer["money_balance"] == -30


def test_order_apply_credit_full(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Use Credit", starting_money=-30)
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "happened_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 0,
        "cylinders_received": 0,
        "price_total": 120,
        "paid_amount": 90,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201

    customer = _get_customer(client, customer_id)
    assert customer["money_balance"] == 0


def test_order_apply_credit_partial(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Partial Credit", starting_money=-50)
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "happened_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 0,
        "cylinders_received": 0,
        "price_total": 30,
        "paid_amount": 0,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201

    customer = _get_customer(client, customer_id)
    assert customer["money_balance"] == -20


def test_order_cylinder_swap_credit(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Cylinder Credit")
    system_id = create_system(client, customer_id=customer_id)

    payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "happened_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 1,
        "cylinders_received": 2,
        "price_total": 0,
        "paid_amount": 0,
    }
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201

    customer = _get_customer(client, customer_id)
    assert customer["cylinder_balance_12kg"] == -1


def test_order_create_is_idempotent_per_request_id(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Idempotent Customer")
    system_id = create_system(client, customer_id=customer_id)

    base_payload = {
        "customer_id": customer_id,
        "system_id": system_id,
        "happened_at": "2025-01-02T10:00:00",
        "gas_type": "12kg",
        "cylinders_installed": 1,
        "cylinders_received": 1,
        "price_total": 120,
        "paid_amount": 120,
    }

    first = client.post("/orders", json={**base_payload, "request_id": "order-req-1"})
    assert first.status_code == 201
    first_body = first.json()

    repeated = client.post("/orders", json={**base_payload, "request_id": "order-req-1"})
    assert repeated.status_code == 201
    repeated_body = repeated.json()

    assert repeated_body["id"] == first_body["id"]

    orders_resp = client.get("/orders")
    assert orders_resp.status_code == 200
    orders = orders_resp.json()
    assert len(orders) == 1

    second = client.post("/orders", json={**base_payload, "request_id": "order-req-2"})
    assert second.status_code == 201
    second_body = second.json()
    assert second_body["id"] != first_body["id"]

    orders_resp = client.get("/orders")
    assert orders_resp.status_code == 200
    orders = orders_resp.json()
    assert len(orders) == 2
