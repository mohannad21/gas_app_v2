from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import create_customer, create_order, create_system, init_inventory


def test_customer_order_count_only_counts_replacement_orders_with_received_gt_zero(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Counted Customer")
    system_id = create_system(client, customer_id=customer_id)

    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        installed=1,
        received=1,
    )
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        installed=1,
        received=0,
    )
    buy_iron_resp = client.post(
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
    assert buy_iron_resp.status_code == 201

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
