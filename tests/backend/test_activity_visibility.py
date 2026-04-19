from __future__ import annotations

from datetime import datetime, timezone

from conftest import create_customer, create_system, init_inventory


def _assert_in_day_report(client, date: str, match_fn) -> None:
    """Assert that at least one event in the day-v2 report satisfies match_fn."""
    resp = client.get("/reports/day", params={"date": date})
    assert resp.status_code == 200
    events = resp.json()["events"]
    assert any(match_fn(e) for e in events), (
        f"No matching event found in day report for {date}. "
        f"event_types present: {[e.get('event_type') for e in events]}"
    )


def test_order_appears_in_day_report_and_customer_review(client) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    customer_id = create_customer(client, name="Order Visibility Customer")
    system_id = create_system(client, customer_id=customer_id, name="Order Visibility System")
    init_inventory(client, date=today, full12=10, empty12=5, full48=0, empty48=0)

    order_resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": f"{today}T12:00:00",
            "gas_type": "12kg",
            "cylinders_installed": 1,
            "cylinders_received": 0,
            "price_total": 200,
            "paid_amount": 50,
        },
    )
    assert order_resp.status_code == 201
    order_id = order_resp.json()["id"]

    _assert_in_day_report(
        client,
        today,
        lambda event: event.get("event_type") == "order" and event.get("source_id") == order_id,
    )

    orders_resp = client.get("/orders")
    assert orders_resp.status_code == 200
    orders = orders_resp.json()
    assert any(order["id"] == order_id and order["customer_id"] == customer_id for order in orders)


def test_collection_appears_in_day_report_and_customer_review(client) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    customer_id = create_customer(client, name="Collection Visibility Customer")

    collection_resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": f"{today}T12:00:00",
        },
    )
    assert collection_resp.status_code == 201
    collection_id = collection_resp.json()["id"]

    _assert_in_day_report(
        client,
        today,
        lambda event: event.get("event_type") == "collection_money" and event.get("customer_id") == customer_id,
    )

    collections_resp = client.get("/collections", params={"customer_id": customer_id})
    assert collections_resp.status_code == 200
    collections = collections_resp.json()
    assert any(collection["id"] == collection_id and collection["customer_id"] == customer_id for collection in collections)


def test_customer_adjustment_appears_in_day_report_and_customer_review(client) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    customer_id = create_customer(client, name="Adjustment Visibility Customer")

    adjustment_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 300,
            "reason": "visibility test",
            "happened_at": f"{today}T12:00:00",
        },
    )
    assert adjustment_resp.status_code == 201
    adjustment_id = adjustment_resp.json()["id"]

    _assert_in_day_report(
        client,
        today,
        lambda event: event.get("event_type") == "customer_adjust" and event.get("customer_id") == customer_id,
    )

    adjustments_resp = client.get(f"/customer-adjustments/{customer_id}")
    assert adjustments_resp.status_code == 200
    adjustments = adjustments_resp.json()
    assert any(adjustment["id"] == adjustment_id and adjustment["customer_id"] == customer_id for adjustment in adjustments)


def test_refill_appears_in_day_report(client) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    init_inventory(client, date=today, full12=10, empty12=5, full48=0, empty48=0)

    refill_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": f"{today}T12:00:00",
            "buy12": 3,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 300,
            "paid_now": 100,
        },
    )
    assert refill_resp.status_code == 200

    _assert_in_day_report(
        client,
        today,
        lambda event: event.get("event_type") == "refill" and event.get("total_cost") == 300 and event.get("paid_now") == 100,
    )

    refills_resp = client.get("/inventory/refills")
    assert refills_resp.status_code == 200
    refills = refills_resp.json()
    assert any(
        refill["kind"] == "refill"
        and refill["buy12"] == 3
        and refill["return12"] == 0
        and str(refill["effective_at"]).startswith(today)
        for refill in refills
    )


def test_buy_iron_appears_in_day_report(client) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    init_inventory(client, date=today, full12=10, empty12=5, full48=0, empty48=0)

    buy_iron_resp = client.post(
        "/company/buy_iron",
        json={
            "happened_at": f"{today}T12:00:00",
            "new12": 2,
            "new48": 0,
            "total_cost": 300,
            "paid_now": 100,
            "note": "visibility test",
        },
    )
    assert buy_iron_resp.status_code == 201
    buy_iron_id = buy_iron_resp.json()["id"]

    _assert_in_day_report(
        client,
        today,
        lambda event: event.get("event_type") == "company_buy_iron" and event.get("source_id") == buy_iron_id,
    )

    refills_resp = client.get("/inventory/refills")
    assert refills_resp.status_code == 200
    refills = refills_resp.json()
    assert any(
        refill["refill_id"] == buy_iron_id and refill["kind"] == "buy_iron"
        for refill in refills
    )


def test_company_payment_appears_in_day_report(client) -> None:
    today = datetime.now(timezone.utc).date().isoformat()

    payment_resp = client.post(
        "/company/payments",
        json={
            "happened_at": f"{today}T12:00:00",
            "amount": 200,
            "note": "visibility test",
        },
    )
    assert payment_resp.status_code == 201
    payment_id = payment_resp.json()["id"]

    _assert_in_day_report(
        client,
        today,
        lambda event: event.get("event_type") == "company_payment" and event.get("source_id") == payment_id,
    )

    payments_resp = client.get("/company/payments")
    assert payments_resp.status_code == 200
    payments = payments_resp.json()
    assert any(payment["id"] == payment_id for payment in payments)


def test_cash_adjustment_appears_in_day_report(client) -> None:
    today = datetime.now(timezone.utc).date().isoformat()

    cash_adjust_resp = client.post(
        "/cash/adjust",
        json={
            "happened_at": f"{today}T12:00:00",
            "delta_cash": 150,
            "reason": "visibility test",
        },
    )
    assert cash_adjust_resp.status_code == 201
    cash_adjust_id = cash_adjust_resp.json()["id"]

    _assert_in_day_report(
        client,
        today,
        lambda event: event.get("event_type") == "cash_adjust" and event.get("source_id") == cash_adjust_id,
    )


def test_expense_appears_in_day_report(client) -> None:
    today = datetime.now(timezone.utc).date().isoformat()

    expense_resp = client.post(
        "/expenses",
        json={
            "date": today,
            "happened_at": f"{today}T12:00:00",
            "expense_type": "fuel",
            "amount": 120,
            "note": "visibility test",
        },
    )
    assert expense_resp.status_code == 201
    expense_id = expense_resp.json()["id"]

    _assert_in_day_report(
        client,
        today,
        lambda event: event.get("event_type") == "expense" and event.get("source_id") == expense_id,
    )
