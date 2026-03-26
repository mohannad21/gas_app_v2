from __future__ import annotations

from datetime import date

from conftest import create_customer, create_system, init_inventory


def test_refill_rejects_negative_counts(client) -> None:
    day = date(2025, 10, 9)
    init_inventory(client, date=day.isoformat(), full12=10, empty12=5, full48=0, empty48=0)
    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{day.isoformat()}T09:00:00",
            "buy12": -1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 422
    assert "buy12_must_be_non_negative" in resp.text


def test_init_inventory_rejects_malformed_payload(client) -> None:
    resp = client.post(
        "/inventory/init",
        json={
            "date": "2025-10-09",
            "full12": "abc",
            "empty12": 0,
            "full48": 0,
            "empty48": 0,
        },
    )
    assert resp.status_code == 422


def test_init_inventory_accepts_valid_typed_payload(client) -> None:
    resp = client.post(
        "/inventory/init",
        json={
            "date": "2025-10-09",
            "full12": 10,
            "empty12": 5,
            "full48": 1,
            "empty48": 2,
            "reason": "initial",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["full12"] == 10
    assert body["empty12"] == 5
    assert body["full48"] == 1
    assert body["empty48"] == 2


def test_order_rejects_negative_counts(client) -> None:
    customer_id = create_customer(client, name="Negative Order")
    system_id = create_system(client, customer_id=customer_id)
    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": "2025-01-02T10:00:00",
            "gas_type": "12kg",
            "cylinders_installed": -1,
            "cylinders_received": 0,
            "price_total": 0,
            "paid_amount": 0,
        },
    )
    assert resp.status_code == 422
    assert "cylinders_installed_must_be_non_negative" in resp.text


def test_order_rejects_total_outside_ledger_range(client) -> None:
    customer_id = create_customer(client, name="Range Order")
    system_id = create_system(client, customer_id=customer_id)
    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": "2025-01-02T10:00:00",
            "gas_type": "12kg",
            "cylinders_installed": 1,
            "cylinders_received": 0,
            "price_total": 2147483648,
            "paid_amount": 0,
        },
    )
    assert resp.status_code == 422
    assert "price_total_must_be_within_ledger_range" in resp.text


def test_collection_rejects_negative_amounts(client) -> None:
    customer_id = create_customer(client, name="Negative Collection")
    resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": -10,
        },
    )
    assert resp.status_code == 422
    assert "amount_money_must_be_non_negative" in resp.text


def test_company_buy_iron_rejects_negative_counts(client) -> None:
    resp = client.post(
        "/company/buy_iron",
        json={
            "date": "2025-10-10",
            "new12": -2,
            "new48": 0,
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 422
    assert "new12_must_be_non_negative" in resp.text


def test_company_payment_allows_negative_amount(client) -> None:
    resp = client.post(
        "/company/payments",
        json={
            "date": "2025-10-11",
            "amount": -50,
            "note": "refund",
        },
    )
    assert resp.status_code == 201
