from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session, select

from conftest import create_customer, create_order, create_system, init_inventory


def _setup_price(
    client,
    *,
    buy12: int,
    sell12: int,
    buy48: int = 0,
    sell48: int = 0,
    effective_from: str = "2025-01-01T00:00:00+00:00",
) -> None:
    resp = client.post("/prices", json={
        "gas_type": "12kg", "selling_price": sell12, "buying_price": buy12,
        "selling_iron_price": 0, "buying_iron_price": 0, "company_iron_price": 0,
        "effective_from": effective_from,
    })
    assert resp.status_code == 201
    if buy48 or sell48:
        resp = client.post("/prices", json={
            "gas_type": "48kg", "selling_price": sell48, "buying_price": buy48,
            "selling_iron_price": 0, "buying_iron_price": 0, "company_iron_price": 0,
            "effective_from": effective_from,
        })
        assert resp.status_code == 201


def _create_refill(client, *, happened_at: str, buy12: int = 0, buy48: int = 0,
                   total_cost: int = 0, paid_amount: int = 0) -> dict:
    resp = client.post("/inventory/refill", json={
        "happened_at": happened_at, "kind": "refill",
        "buy12": buy12, "return12": 0, "buy48": buy48, "return48": 0,
        "total_cost": total_cost, "paid_amount": paid_amount,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


def _cost_layers():
    import app.db as app_db
    from app.config import DEFAULT_TENANT_ID
    from app.models import InventoryCostLayer

    with Session(app_db.engine) as session:
        return session.exec(
            select(InventoryCostLayer)
            .where(InventoryCostLayer.tenant_id == DEFAULT_TENANT_ID)
            .order_by(InventoryCostLayer.acquired_at.asc())
        ).all()


def _customer_transaction(txn_id: str):
    import app.db as app_db
    from app.models import CustomerTransaction

    with Session(app_db.engine) as session:
        return session.get(CustomerTransaction, txn_id)


def test_refill_creates_cost_layer(client) -> None:
    day = date(2025, 1, 10)
    _setup_price(client, buy12=100, sell12=150)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=10, full48=0, empty48=0)
    _create_refill(client, happened_at=f"{day.isoformat()}T09:00:00", buy12=10)

    layers = _cost_layers()
    assert len(layers) == 1
    layer = layers[0]
    assert layer.gas_type == "12kg"
    assert layer.buy_price == 100
    assert layer.quantity_total == 10
    assert layer.quantity_remaining == 10
    assert layer.source_id is not None


def test_sale_consumes_cost_layer_and_sets_snapshot(client) -> None:
    day = date(2025, 1, 11)
    _setup_price(client, buy12=120, sell12=180)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=10, full48=0, empty48=0)
    _create_refill(client, happened_at=f"{day.isoformat()}T09:00:00", buy12=5)
    customer_id = create_customer(client, name="FIFO Sale")
    system_id = create_system(client, customer_id=customer_id)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        installed=2,
        received=0,
        price_total=360,
        paid_amount=360,
    )

    txn = _customer_transaction(order_id)
    assert txn is not None
    assert txn.buy_price_snapshot == 120
    layer = _cost_layers()[0]
    assert layer.quantity_remaining == 3


def test_fifo_spanning_two_layers(client) -> None:
    day = date(2025, 1, 12)
    _setup_price(client, buy12=100, sell12=150, effective_from="2025-01-01T00:00:00+00:00")
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=10, full48=0, empty48=0)
    _create_refill(client, happened_at=f"{day.isoformat()}T09:00:00", buy12=2)
    _setup_price(client, buy12=200, sell12=250, effective_from="2025-01-13T00:00:00+00:00")
    _create_refill(client, happened_at="2025-01-13T09:00:00", buy12=3)
    customer_id = create_customer(client, name="FIFO Span")
    system_id = create_system(client, customer_id=customer_id)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at="2025-01-13T10:00:00",
        installed=4,
        received=0,
        price_total=800,
        paid_amount=800,
    )

    txn = _customer_transaction(order_id)
    assert txn is not None
    assert txn.buy_price_snapshot == round((2 * 100 + 2 * 200) / 4) == 150
    first_layer, second_layer = _cost_layers()
    assert first_layer.quantity_remaining == 0
    assert second_layer.quantity_remaining == 1


def test_sale_without_cost_layers_leaves_snapshot_null(client) -> None:
    day = date(2025, 1, 14)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=10, full48=0, empty48=0)
    customer_id = create_customer(client, name="No Layer")
    system_id = create_system(client, customer_id=customer_id)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        installed=2,
        received=0,
        price_total=300,
        paid_amount=300,
    )

    txn = _customer_transaction(order_id)
    assert txn is not None
    assert txn.buy_price_snapshot is None


def test_revenue_report_returns_gross_profit(client) -> None:
    day = date(2025, 1, 15)
    _setup_price(client, buy12=100, sell12=150)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=10, full48=0, empty48=0)
    _create_refill(client, happened_at=f"{day.isoformat()}T09:00:00", buy12=5)
    customer_id = create_customer(client, name="Revenue")
    system_id = create_system(client, customer_id=customer_id)
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        installed=2,
        received=0,
        price_total=300,
        paid_amount=300,
    )

    resp = client.get("/reports/revenue", params={"from": day.isoformat(), "to": day.isoformat()})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_gross_profit"] == 300 - (2 * 100) == 100
    assert body["total_transaction_count"] == 1
    assert body["rows"][0]["gross_profit"] == 100


def test_revenue_report_excludes_null_snapshot(client) -> None:
    day = date(2025, 1, 16)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=10, full48=0, empty48=0)
    customer_id = create_customer(client, name="Null Snapshot")
    system_id = create_system(client, customer_id=customer_id)
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        installed=2,
        received=0,
        price_total=300,
        paid_amount=300,
    )

    resp = client.get("/reports/revenue", params={"from": day.isoformat(), "to": day.isoformat()})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_gross_profit"] == 0
    assert body["total_transaction_count"] == 0
