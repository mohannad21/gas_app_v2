from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import create_customer, create_system, init_inventory


def _get_order(client: TestClient, order_id: str, *, include_deleted: bool = False) -> dict:
    resp = client.get("/orders", params={"include_deleted": include_deleted})
    assert resp.status_code == 200
    items = resp.json()
    order = next((item for item in items if item["id"] == order_id), None)
    assert order is not None
    return order


def _get_customer_balances(client: TestClient, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}/balances")
    assert resp.status_code == 200
    return resp.json()


def _create_order(
    client: TestClient,
    *,
    customer_id: str,
    system_id: str | None,
    happened_at: str,
    order_mode: str,
    gas_type: str = "12kg",
    cylinders_installed: int = 0,
    cylinders_received: int = 0,
    price_total: int = 0,
    paid_amount: int = 0,
) -> str:
    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": happened_at,
            "order_mode": order_mode,
            "gas_type": gas_type,
            "cylinders_installed": cylinders_installed,
            "cylinders_received": cylinders_received,
            "price_total": price_total,
            "paid_amount": paid_amount,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_create_replacement_order_populates_live_money_balance_after(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01", full12=20, empty12=0, full48=0, empty48=0)
    customer_id = create_customer(client, name="Live Replacement Customer")
    system_id = create_system(client, customer_id=customer_id)

    order_id = _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at="2025-01-02T09:00:00",
        order_mode="replacement",
        cylinders_installed=2,
        cylinders_received=1,
        price_total=150,
        paid_amount=100,
    )

    order = _get_order(client, order_id)
    balances = _get_customer_balances(client, customer_id)

    assert order["money_balance_after"] is not None
    assert order["money_balance_after"] == balances["money_balance"] == 50
    assert order["money_balance_before"] == 0
    assert order["cyl_balance_after"] == {"12kg": 1, "48kg": 0}
    assert order["cyl_balance_before"] == {"12kg": 0, "48kg": 0}


def test_create_sell_iron_order_keeps_customer_cylinder_balances_unchanged(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01", full12=20, empty12=0, full48=0, empty48=0)
    customer_id = create_customer(client, name="Live Sell Full Customer")
    system_id = create_system(client, customer_id=customer_id)

    order_id = _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at="2025-01-02T10:00:00",
        order_mode="sell_iron",
        cylinders_installed=2,
        cylinders_received=0,
        price_total=150,
        paid_amount=100,
    )

    order = _get_order(client, order_id)

    assert order["money_balance_after"] is not None
    assert order["cyl_balance_before"] == order["cyl_balance_after"] == {"12kg": 0, "48kg": 0}


def test_create_buy_iron_order_keeps_customer_cylinder_balances_unchanged(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01", full12=0, empty12=0, full48=0, empty48=0)
    customer_id = create_customer(client, name="Live Buy Empty Customer")

    order_id = _create_order(
        client,
        customer_id=customer_id,
        system_id=None,
        happened_at="2025-01-02T11:00:00",
        order_mode="buy_iron",
        cylinders_installed=0,
        cylinders_received=2,
        price_total=150,
        paid_amount=100,
    )

    order = _get_order(client, order_id)

    assert order["money_balance_after"] is not None
    assert order["money_balance_before"] == 0
    assert order["money_balance_after"] == -50
    assert order["cyl_balance_before"] == order["cyl_balance_after"] == {"12kg": 0, "48kg": 0}


def test_retroactive_delete_recalculates_later_order_live_balance(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01", full12=20, empty12=0, full48=0, empty48=0)
    customer_id = create_customer(client, name="Retro Delete Order Customer")
    system_id = create_system(client, customer_id=customer_id)

    earlier_order_id = _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at="2025-01-02T09:00:00",
        order_mode="replacement",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=100,
        paid_amount=0,
    )
    later_order_id = _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at="2025-01-02T10:00:00",
        order_mode="sell_iron",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=200,
        paid_amount=100,
    )

    before_delete = _get_order(client, later_order_id)
    assert before_delete["money_balance_after"] == 200

    delete_resp = client.delete(f"/orders/{earlier_order_id}")
    assert delete_resp.status_code == 204

    later_order = _get_order(client, later_order_id)
    balances = _get_customer_balances(client, customer_id)

    assert later_order["money_balance_before"] == 0
    assert later_order["money_balance_after"] == balances["money_balance"] == 100


def test_retroactive_update_recalculates_later_order_live_balance(client: TestClient) -> None:
    init_inventory(client, date="2025-01-01", full12=20, empty12=0, full48=0, empty48=0)
    customer_id = create_customer(client, name="Retro Update Order Customer")
    system_id = create_system(client, customer_id=customer_id)

    earlier_order_id = _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at="2025-01-02T09:00:00",
        order_mode="replacement",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=100,
        paid_amount=0,
    )
    later_order_id = _create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at="2025-01-02T10:00:00",
        order_mode="sell_iron",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=200,
        paid_amount=100,
    )

    before_update = _get_order(client, later_order_id)
    assert before_update["money_balance_after"] == 200

    update_resp = client.put(
        f"/orders/{earlier_order_id}",
        json={
            "price_total": 150,
        },
    )
    assert update_resp.status_code == 200

    later_order = _get_order(client, later_order_id)
    balances = _get_customer_balances(client, customer_id)

    assert later_order["money_balance_before"] == 150
    assert later_order["money_balance_after"] == balances["money_balance"] == 250
