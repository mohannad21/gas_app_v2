from __future__ import annotations

from datetime import date, timedelta

from conftest import create_customer, create_system, init_inventory, iso_at


def _cash_init(client, *, day: date, amount: int) -> None:
    prev_day = (day - timedelta(days=1)).isoformat()
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": iso_at(prev_day, "evening"), "delta_cash": int(amount), "reason": "open"},
    )
    assert resp.status_code == 201


def _bootstrap_day(
    client,
    *,
    day: date,
    full12: int = 10,
    empty12: int = 5,
    full48: int = 0,
    empty48: int = 0,
    cash: int = 1000,
) -> None:
    init_inventory(
        client,
        date=(day - timedelta(days=1)).isoformat(),
        full12=full12,
        empty12=empty12,
        full48=full48,
        empty48=empty48,
    )
    _cash_init(client, day=day, amount=cash)


def _get_day_events(client, *, day: date) -> list[dict]:
    resp = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert resp.status_code == 200
    return resp.json()["events"]


def _post_order(
    client,
    *,
    customer_id: str,
    system_id: str,
    happened_at: str,
    order_mode: str = "replacement",
    gas_type: str = "12kg",
    installed: int = 0,
    received: int = 0,
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
            "cylinders_installed": installed,
            "cylinders_received": received,
            "price_total": price_total,
            "paid_amount": paid_amount,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _post_collection(
    client,
    *,
    customer_id: str,
    action_type: str,
    happened_at: str,
    amount_money: int | None = None,
    qty_12kg: int | None = None,
    qty_48kg: int | None = None,
) -> dict:
    payload: dict = {
        "customer_id": customer_id,
        "action_type": action_type,
        "happened_at": happened_at,
    }
    if amount_money is not None:
        payload["amount_money"] = amount_money
    if qty_12kg is not None:
        payload["qty_12kg"] = qty_12kg
    if qty_48kg is not None:
        payload["qty_48kg"] = qty_48kg
    resp = client.post("/collections", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _customer_balances(client, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}/balances")
    assert resp.status_code == 200
    return resp.json()


def test_customer_replacement_invariants(client) -> None:
    day = date(2025, 10, 1)
    _bootstrap_day(client, day=day, full12=10, empty12=5)
    customer_id = create_customer(client, name="Replace")
    system_id = create_system(client, customer_id=customer_id)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=100,
        paid_amount=40,
    )

    events = _get_day_events(client, day=day)
    order_event = next(event for event in events if event["event_type"] == "order")
    assert order_event["cash_after"] - order_event["cash_before"] == 40
    assert order_event["inventory_after"]["full12"] == order_event["inventory_before"]["full12"] - 2
    assert order_event["inventory_after"]["empty12"] == order_event["inventory_before"]["empty12"] + 1

    balances = _customer_balances(client, customer_id)
    assert balances["money_balance"] == 60
    assert balances["cylinder_balance_12kg"] == 1


def test_customer_sell_iron_invariants(client) -> None:
    day = date(2025, 10, 2)
    _bootstrap_day(client, day=day, full12=10, empty12=5)
    customer_id = create_customer(client, name="SellIron")
    system_id = create_system(client, customer_id=customer_id)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="sell_iron",
        gas_type="12kg",
        installed=2,
        received=0,
        price_total=200,
        paid_amount=200,
    )

    events = _get_day_events(client, day=day)
    order_event = next(event for event in events if event["event_type"] == "order")
    assert order_event["cash_after"] - order_event["cash_before"] == 200
    assert order_event["inventory_after"]["full12"] == order_event["inventory_before"]["full12"] - 2

    balances = _customer_balances(client, customer_id)
    assert balances["money_balance"] == 0
    assert balances["cylinder_balance_12kg"] == 0


def test_customer_buy_iron_invariants(client) -> None:
    day = date(2025, 10, 3)
    _bootstrap_day(client, day=day, full12=10, empty12=5)
    customer_id = create_customer(client, name="BuyIron")
    system_id = create_system(client, customer_id=customer_id)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="buy_iron",
        gas_type="12kg",
        installed=0,
        received=3,
        price_total=90,
        paid_amount=90,
    )

    events = _get_day_events(client, day=day)
    order_event = next(event for event in events if event["event_type"] == "order")
    assert order_event["cash_after"] - order_event["cash_before"] == -90
    assert order_event["inventory_after"]["empty12"] == order_event["inventory_before"]["empty12"] + 3

    balances = _customer_balances(client, customer_id)
    assert balances["money_balance"] == 0
    assert balances["cylinder_balance_12kg"] == 0


def test_customer_payment_invariants(client) -> None:
    day = date(2025, 10, 4)
    _bootstrap_day(client, day=day, full12=10, empty12=5)
    customer_id = create_customer(client, name="Payment")
    system_id = create_system(client, customer_id=customer_id)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        gas_type="12kg",
        installed=0,
        received=0,
        price_total=100,
        paid_amount=0,
    )

    _post_collection(
        client,
        customer_id=customer_id,
        action_type="payment",
        happened_at=iso_at(day.isoformat(), "evening"),
        amount_money=40,
    )

    events = _get_day_events(client, day=day)
    payment_event = next(event for event in events if event["event_type"] == "collection_money")
    assert payment_event["cash_after"] - payment_event["cash_before"] == 40
    assert payment_event["inventory_before"] is None

    balances = _customer_balances(client, customer_id)
    assert balances["money_balance"] == 60


def test_customer_payout_invariants(client) -> None:
    day = date(2025, 10, 5)
    _bootstrap_day(client, day=day, full12=10, empty12=5)
    customer_id = create_customer(client, name="Payout")

    _post_collection(
        client,
        customer_id=customer_id,
        action_type="payout",
        happened_at=iso_at(day.isoformat(), "morning"),
        amount_money=50,
    )

    events = _get_day_events(client, day=day)
    payout_event = next(event for event in events if event["event_type"] == "collection_payout")
    assert payout_event["cash_after"] - payout_event["cash_before"] == -50
    assert payout_event["inventory_before"] is None

    balances = _customer_balances(client, customer_id)
    assert balances["money_balance"] == 50


def test_customer_return_invariants(client) -> None:
    day = date(2025, 10, 6)
    _bootstrap_day(client, day=day, full12=10, empty12=5)
    customer_id = create_customer(client, name="Return")
    system_id = create_system(client, customer_id=customer_id)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        gas_type="12kg",
        installed=2,
        received=0,
        price_total=0,
        paid_amount=0,
    )

    _post_collection(
        client,
        customer_id=customer_id,
        action_type="return",
        happened_at=iso_at(day.isoformat(), "evening"),
        qty_12kg=1,
    )

    events = _get_day_events(client, day=day)
    return_event = next(event for event in events if event["event_type"] == "collection_empty")
    assert return_event["cash_after"] - return_event["cash_before"] == 0
    assert (
        return_event["inventory_after"]["empty12"]
        == return_event["inventory_before"]["empty12"] + 1
    )

    balances = _customer_balances(client, customer_id)
    assert balances["cylinder_balance_12kg"] == 1


def test_company_refill_swap_invariants(client) -> None:
    day = date(2025, 10, 7)
    _bootstrap_day(client, day=day, full12=10, empty12=5, full48=8, empty48=4)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "buy12": 5,
            "return12": 3,
            "buy48": 2,
            "return48": 1,
            "total_cost": 200,
            "paid_now": 50,
        },
    )
    assert resp.status_code == 200

    events = _get_day_events(client, day=day)
    refill_event = next(event for event in events if event["event_type"] == "refill")
    assert refill_event["cash_after"] - refill_event["cash_before"] == -50
    assert refill_event["inventory_after"]["full12"] == refill_event["inventory_before"]["full12"] + 5
    assert refill_event["inventory_after"]["empty12"] == refill_event["inventory_before"]["empty12"] - 3
    assert refill_event["inventory_after"]["full48"] == refill_event["inventory_before"]["full48"] + 2
    assert refill_event["inventory_after"]["empty48"] == refill_event["inventory_before"]["empty48"] - 1

    assert refill_event["company_after"] - refill_event["company_before"] == 150
    assert refill_event["company_12kg_after"] - refill_event["company_12kg_before"] == -2
    assert refill_event["company_48kg_after"] - refill_event["company_48kg_before"] == -1


def test_company_refill_buy_only_invariants(client) -> None:
    day = date(2025, 10, 8)
    _bootstrap_day(client, day=day, full12=10, empty12=5)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "buy12": 4,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 80,
            "paid_now": 80,
        },
    )
    assert resp.status_code == 200

    events = _get_day_events(client, day=day)
    refill_event = next(event for event in events if event["event_type"] == "refill")
    assert refill_event["cash_after"] - refill_event["cash_before"] == -80
    assert refill_event["inventory_after"]["full12"] == refill_event["inventory_before"]["full12"] + 4
    assert refill_event["company_after"] - refill_event["company_before"] == 0
    assert refill_event["company_12kg_after"] - refill_event["company_12kg_before"] == -4


def test_company_refill_return_only_invariants(client) -> None:
    day = date(2025, 10, 9)
    _bootstrap_day(client, day=day, full12=10, empty12=5)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "buy12": 0,
            "return12": 2,
            "buy48": 0,
            "return48": 0,
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 200

    events = _get_day_events(client, day=day)
    refill_event = next(event for event in events if event["event_type"] == "refill")
    assert refill_event["cash_after"] - refill_event["cash_before"] == 0
    assert refill_event["inventory_after"]["empty12"] == refill_event["inventory_before"]["empty12"] - 2
    assert refill_event["company_12kg_after"] - refill_event["company_12kg_before"] == 2


def test_company_payment_invariants(client) -> None:
    day = date(2025, 10, 10)
    _bootstrap_day(client, day=day, full12=10, empty12=5)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "buy12": 1,
            "return12": 0,
            "buy48": 0,
            "return48": 0,
            "total_cost": 100,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 200

    resp = client.post(
        "/company/payments",
        json={"happened_at": iso_at(day.isoformat(), "evening"), "amount": 40},
    )
    assert resp.status_code == 201

    events = _get_day_events(client, day=day)
    payment_event = next(event for event in events if event["event_type"] == "company_payment")
    assert payment_event["cash_after"] - payment_event["cash_before"] == -40
    assert payment_event["company_after"] - payment_event["company_before"] == -40
    assert payment_event["inventory_before"] is None


def test_company_buy_iron_invariants(client) -> None:
    day = date(2025, 10, 11)
    _bootstrap_day(client, day=day, full12=10, empty12=5)

    resp = client.post(
        "/company/buy_iron",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "new12": 3,
            "new48": 0,
            "total_cost": 90,
            "paid_now": 60,
        },
    )
    assert resp.status_code == 201

    events = _get_day_events(client, day=day)
    buy_event = next(event for event in events if event["event_type"] == "company_buy_iron")
    assert buy_event["cash_after"] - buy_event["cash_before"] == -60
    assert buy_event["inventory_after"]["full12"] == buy_event["inventory_before"]["full12"] + 3
    assert buy_event["inventory_after"]["empty12"] == buy_event["inventory_before"]["empty12"]
    assert buy_event["company_after"] - buy_event["company_before"] == 30
    assert buy_event["company_12kg_after"] - buy_event["company_12kg_before"] == 0
