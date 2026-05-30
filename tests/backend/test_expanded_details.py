from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from conftest import create_customer, create_system, init_inventory, iso_at


START_FULL12 = 20
START_EMPTY12 = 10
START_FULL48 = 8
START_EMPTY48 = 6
START_WALLET = 1_000


def _bootstrap_day(client, *, day: date) -> None:
    init_inventory(
        client,
        date=(day - timedelta(days=1)).isoformat(),
        full12=START_FULL12,
        empty12=START_EMPTY12,
        full48=START_FULL48,
        empty48=START_EMPTY48,
    )
    resp = client.post(
        "/cash/adjust",
        json={
            "happened_at": iso_at((day - timedelta(days=1)).isoformat(), "evening"),
            "delta_cash": START_WALLET,
            "reason": "opening wallet",
        },
    )
    assert resp.status_code == 201, resp.text


def _customer_with_system(client, *, name: str = "Expanded Customer") -> tuple[str, str]:
    customer_id = create_customer(client, name=name)
    system_id = create_system(client, customer_id=customer_id)
    return customer_id, system_id


def _post_order(
    client,
    *,
    customer_id: str,
    system_id: str | None,
    happened_at: str,
    order_mode: str,
    installed: int,
    received: int,
    price_total: int,
    paid_amount: int,
) -> None:
    payload: dict[str, Any] = {
        "customer_id": customer_id,
        "order_mode": order_mode,
        "gas_type": "12kg",
        "cylinders_installed": installed,
        "cylinders_received": received,
        "price_total": price_total,
        "paid_amount": paid_amount,
        "happened_at": happened_at,
    }
    if system_id is not None:
        payload["system_id"] = system_id
    resp = client.post("/orders", json=payload)
    assert resp.status_code == 201, resp.text


def _post_collection(
    client,
    *,
    customer_id: str,
    action_type: str,
    happened_at: str,
    amount_money: int | None = None,
    qty_12kg: int | None = None,
) -> None:
    payload: dict[str, Any] = {
        "customer_id": customer_id,
        "action_type": action_type,
        "happened_at": happened_at,
    }
    if amount_money is not None:
        payload["amount_money"] = amount_money
    if qty_12kg is not None:
        payload["qty_12kg"] = qty_12kg
    resp = client.post("/collections", json=payload)
    assert resp.status_code == 201, resp.text


def _get_event(client, *, day: date, event_type: str) -> dict[str, Any]:
    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200, resp.text
    matches = [event for event in resp.json()["events"] if event["event_type"] == event_type]
    assert len(matches) == 1, (
        f"Expected one {event_type} event, got {len(matches)}. "
        f"Available: {[event['event_type'] for event in resp.json()['events']]}"
    )
    return matches[0]


def _assert_wallet(event: dict[str, Any], *, before: int, after: int) -> None:
    assert event["wallet_before"] == before
    assert event["wallet_after"] == after


def _assert_no_inventory(event: dict[str, Any]) -> None:
    assert event["inventory_before"] is None
    assert event["inventory_after"] is None


def _assert_inventory(
    event: dict[str, Any],
    *,
    before: dict[str, int | None],
    after: dict[str, int | None],
) -> None:
    assert event["inventory_before"] == before
    assert event["inventory_after"] == after


def test_replacement_expanded_details(client) -> None:
    day = date(2025, 11, 1)
    _bootstrap_day(client, day=day)
    customer_id, system_id = _customer_with_system(client)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        installed=2,
        received=1,
        price_total=300,
        paid_amount=120,
    )

    event = _get_event(client, day=day, event_type="replacement")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET + 120)
    _assert_inventory(
        event,
        before={"full12": START_FULL12, "empty12": START_EMPTY12, "full48": None, "empty48": None},
        after={"full12": START_FULL12 - 2, "empty12": START_EMPTY12 + 1, "full48": None, "empty48": None},
    )


def test_sell_full_expanded_details(client) -> None:
    day = date(2025, 11, 2)
    _bootstrap_day(client, day=day)
    customer_id, system_id = _customer_with_system(client)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="sell_iron",
        installed=3,
        received=0,
        price_total=360,
        paid_amount=200,
    )

    event = _get_event(client, day=day, event_type="sell_full")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET + 200)
    _assert_inventory(
        event,
        before={"full12": START_FULL12, "empty12": START_EMPTY12, "full48": None, "empty48": None},
        after={"full12": START_FULL12 - 3, "empty12": START_EMPTY12, "full48": None, "empty48": None},
    )


def test_buy_empty_expanded_details(client) -> None:
    day = date(2025, 11, 3)
    _bootstrap_day(client, day=day)
    customer_id, _system_id = _customer_with_system(client)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=None,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="buy_iron",
        installed=0,
        received=4,
        price_total=160,
        paid_amount=160,
    )

    event = _get_event(client, day=day, event_type="buy_empty_from_customer")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET - 160)
    _assert_inventory(
        event,
        before={"full12": START_FULL12, "empty12": START_EMPTY12, "full48": None, "empty48": None},
        after={"full12": START_FULL12, "empty12": START_EMPTY12 + 4, "full48": None, "empty48": None},
    )


def test_payment_received_expanded_details(client) -> None:
    day = date(2025, 11, 4)
    _bootstrap_day(client, day=day)
    customer_id, _system_id = _customer_with_system(client)

    _post_collection(
        client,
        customer_id=customer_id,
        action_type="payment",
        amount_money=90,
        happened_at=iso_at(day.isoformat(), "morning"),
    )

    event = _get_event(client, day=day, event_type="payment_from_customer")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET + 90)
    _assert_no_inventory(event)


def test_payment_payout_expanded_details(client) -> None:
    day = date(2025, 11, 5)
    _bootstrap_day(client, day=day)
    customer_id, _system_id = _customer_with_system(client)

    _post_collection(
        client,
        customer_id=customer_id,
        action_type="payout",
        amount_money=70,
        happened_at=iso_at(day.isoformat(), "morning"),
    )

    event = _get_event(client, day=day, event_type="payment_to_customer")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET - 70)
    _assert_no_inventory(event)


def test_return_empties_expanded_details(client) -> None:
    day = date(2025, 11, 6)
    _bootstrap_day(client, day=day)
    customer_id, _system_id = _customer_with_system(client)

    _post_collection(
        client,
        customer_id=customer_id,
        action_type="return",
        qty_12kg=3,
        happened_at=iso_at(day.isoformat(), "morning"),
    )

    event = _get_event(client, day=day, event_type="customer_return_empties")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET)
    _assert_inventory(
        event,
        before={"full12": None, "empty12": START_EMPTY12, "full48": None, "empty48": None},
        after={"full12": None, "empty12": START_EMPTY12 + 3, "full48": None, "empty48": None},
    )


def test_customer_balance_adjustment_expanded_details(client) -> None:
    day = date(2025, 11, 7)
    _bootstrap_day(client, day=day)
    customer_id, _system_id = _customer_with_system(client)

    resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "money_balance": 100,
            "cylinder_balance_12kg": 2,
            "cylinder_balance_48kg": 0,
            "happened_at": iso_at(day.isoformat(), "morning"),
            "reason": "balance correction",
        },
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="adjust_customer_balance")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET)
    _assert_no_inventory(event)


def test_refill_expanded_details(client) -> None:
    day = date(2025, 11, 8)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "buy12": 5,
            "return12": 2,
            "buy48": 1,
            "return48": 1,
            "total_cost": 500,
            "paid_amount": 300,
        },
    )
    assert resp.status_code == 200, resp.text

    event = _get_event(client, day=day, event_type="refill")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET - 300)
    _assert_inventory(
        event,
        before={"full12": START_FULL12, "empty12": START_EMPTY12, "full48": START_FULL48, "empty48": START_EMPTY48},
        after={
            "full12": START_FULL12 + 5,
            "empty12": START_EMPTY12 - 2,
            "full48": START_FULL48 + 1,
            "empty48": START_EMPTY48 - 1,
        },
    )


def test_company_payment_payout_expanded_details(client) -> None:
    day = date(2025, 11, 9)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/company/payments",
        json={"amount": 80, "happened_at": iso_at(day.isoformat(), "morning")},
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="payment_to_company")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET - 80)
    _assert_no_inventory(event)


def test_company_payment_receive_expanded_details(client) -> None:
    day = date(2025, 11, 10)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/company/payments",
        json={"amount": -65, "happened_at": iso_at(day.isoformat(), "morning")},
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="payment_from_company")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET + 65)
    _assert_no_inventory(event)


def test_return_empties_to_company_expanded_details(client) -> None:
    day = date(2025, 11, 11)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/company/cylinders/settle",
        json={
            "gas_type": "12kg",
            "quantity": 4,
            "direction": "return_empty",
            "happened_at": iso_at(day.isoformat(), "morning"),
        },
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="dist_return_empties")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET)
    _assert_inventory(
        event,
        before={"full12": None, "empty12": START_EMPTY12, "full48": None, "empty48": None},
        after={"full12": None, "empty12": START_EMPTY12 - 4, "full48": None, "empty48": None},
    )


def test_buy_full_expanded_details(client) -> None:
    day = date(2025, 11, 12)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/company/buy_iron",
        json={
            "new12": 6,
            "new48": 2,
            "total_cost": 700,
            "paid_amount": 450,
            "happened_at": iso_at(day.isoformat(), "morning"),
        },
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="buy_full_from_company")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET - 450)
    _assert_inventory(
        event,
        before={"full12": START_FULL12, "empty12": None, "full48": START_FULL48, "empty48": None},
        after={"full12": START_FULL12 + 6, "empty12": None, "full48": START_FULL48 + 2, "empty48": None},
    )


def test_company_balance_adjustment_expanded_details(client) -> None:
    day = date(2025, 11, 13)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/company/balances/adjust",
        json={
            "money_balance": 200,
            "cylinder_balance_12": 3,
            "cylinder_balance_48": 1,
            "happened_at": iso_at(day.isoformat(), "morning"),
            "reason": "company correction",
        },
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="adjust_company_balance")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET)
    _assert_no_inventory(event)


def test_expense_expanded_details(client) -> None:
    day = date(2025, 11, 14)
    _bootstrap_day(client, day=day)

    resp = client.post("/expenses/categories", json={"name": "Fuel"})
    assert resp.status_code == 201, resp.text
    category_id = resp.json()["id"]
    resp = client.post(
        "/expenses",
        json={
            "expense_type": category_id,
            "amount": 85,
            "date": day.isoformat(),
            "happened_at": iso_at(day.isoformat(), "morning"),
            "note": "truck fuel",
        },
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="expense")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET - 85)
    _assert_no_inventory(event)


def test_wallet_to_bank_expanded_details(client) -> None:
    day = date(2025, 11, 15)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/cash/bank_deposit",
        json={
            "amount": 250,
            "direction": "wallet_to_bank",
            "happened_at": iso_at(day.isoformat(), "morning"),
        },
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="bank_deposit")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET - 250)
    _assert_no_inventory(event)


def test_bank_to_wallet_expanded_details(client) -> None:
    day = date(2025, 11, 16)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/cash/bank_deposit",
        json={
            "amount": 175,
            "direction": "bank_to_wallet",
            "happened_at": iso_at(day.isoformat(), "morning"),
        },
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="bank_deposit")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET + 175)
    _assert_no_inventory(event)


def test_adjust_inventory_expanded_details(client) -> None:
    day = date(2025, 11, 17)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/inventory/adjust",
        json={
            "gas_type": "12kg",
            "delta_full": 2,
            "delta_empty": -1,
            "happened_at": iso_at(day.isoformat(), "morning"),
            "reason": "stock count",
        },
    )
    assert resp.status_code == 200, resp.text

    event = _get_event(client, day=day, event_type="adjust_inventory")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET)
    _assert_inventory(
        event,
        before={"full12": START_FULL12, "empty12": START_EMPTY12, "full48": None, "empty48": None},
        after={"full12": START_FULL12 + 2, "empty12": START_EMPTY12 - 1, "full48": None, "empty48": None},
    )


def test_adjust_wallet_expanded_details(client) -> None:
    day = date(2025, 11, 18)
    _bootstrap_day(client, day=day)

    resp = client.post(
        "/cash/adjust",
        json={
            "delta_cash": 125,
            "happened_at": iso_at(day.isoformat(), "morning"),
            "reason": "wallet count",
        },
    )
    assert resp.status_code == 201, resp.text

    event = _get_event(client, day=day, event_type="adjust_wallet")
    _assert_wallet(event, before=START_WALLET, after=START_WALLET + 125)
    _assert_no_inventory(event)
