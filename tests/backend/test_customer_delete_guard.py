from __future__ import annotations

from datetime import date, timedelta

from conftest import create_customer, create_order, create_system, init_inventory


def test_delete_customer_blocked_with_orders(client) -> None:
    day = date(2025, 1, 5)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=5, empty12=0, full48=0, empty48=0)

    customer_id = create_customer(client, name="Has Orders")
    system_id = create_system(client, customer_id=customer_id)
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=0,
        paid_amount=0,
    )

    delete_resp = client.delete(f"/customers/{customer_id}")
    assert delete_resp.status_code == 409


def test_delete_customer_without_orders_allowed(client) -> None:
    customer_id = create_customer(client, name="No Orders")
    delete_resp = client.delete(f"/customers/{customer_id}")
    assert delete_resp.status_code == 204
