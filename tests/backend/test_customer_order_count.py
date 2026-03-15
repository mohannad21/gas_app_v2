from __future__ import annotations

from fastapi.testclient import TestClient


def _init_inventory(client: TestClient) -> None:
    resp = client.post(
        "/inventory/init",
        json={
            "date": "2025-01-01",
            "full12": 50,
            "empty12": 10,
            "full48": 20,
            "empty48": 5,
            "reason": "initial",
        },
    )
    assert resp.status_code in (200, 201)


def _create_customer(client: TestClient, *, name: str) -> str:
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


def _create_system(client: TestClient, *, customer_id: str) -> str:
    resp = client.post(
        "/systems",
        json={
            "customer_id": customer_id,
            "name": "Main Kitchen",
            "gas_type": "12kg",
            "is_active": True,
            "requires_security_check": False,
            "security_check_exists": False,
            "last_security_check_at": None,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_order(
    client: TestClient,
    *,
    customer_id: str,
    system_id: str,
    order_mode: str = "replacement",
    installed: int = 0,
    received: int = 0,
    price_total: int = 0,
    paid_amount: int = 0,
) -> None:
    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": "2025-01-02T10:00:00",
            "order_mode": order_mode,
            "gas_type": "12kg",
            "cylinders_installed": installed,
            "cylinders_received": received,
            "price_total": price_total,
            "paid_amount": paid_amount,
        },
    )
    assert resp.status_code == 201


def test_customer_order_count_only_counts_replacement_orders_with_received_gt_zero(client: TestClient) -> None:
    _init_inventory(client)
    customer_id = _create_customer(client, name="Counted Customer")
    system_id = _create_system(client, customer_id=customer_id)

    _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        order_mode="replacement",
        installed=1,
        received=1,
    )
    _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        order_mode="replacement",
        installed=1,
        received=0,
    )
    _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        order_mode="buy_iron",
        installed=0,
        received=2,
        price_total=100,
        paid_amount=100,
    )

    detail_resp = client.get(f"/customers/{customer_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["order_count"] == 1

    balances_resp = client.get(f"/customers/{customer_id}/balances")
    assert balances_resp.status_code == 200
    assert balances_resp.json()["order_count"] == 1

    list_resp = client.get("/customers")
    assert list_resp.status_code == 200
    customer_row = next(item for item in list_resp.json() if item["id"] == customer_id)
    assert customer_row["order_count"] == 1
