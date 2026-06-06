from __future__ import annotations

from datetime import date, timedelta
from conftest import create_customer, create_system, init_inventory, iso_at


BASE_DAY = date(2025, 12, 1)


def _setup(client) -> None:
    init_inventory(client, date=(BASE_DAY - timedelta(days=1)).isoformat())
    client.post(
        "/cash/adjust",
        json={
            "delta_cash": 5000,
            "happened_at": iso_at((BASE_DAY - timedelta(days=1)).isoformat(), "evening"),
            "reason": "opening",
        },
    )


def _event_types_for_day(client, day: date) -> set[str]:
    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200, resp.text
    return {e["event_type"] for e in resp.json()["events"]}


def test_activity_kinds_use_correct_names(client) -> None:
    day = BASE_DAY
    _setup(client)

    # wallet_to_bank
    client.post("/cash/bank_deposit", json={
        "amount": 100, "direction": "wallet_to_bank",
        "happened_at": iso_at(day.isoformat(), "morning"),
    })
    # bank_to_wallet
    client.post("/cash/bank_deposit", json={
        "amount": 80, "direction": "bank_to_wallet",
        "happened_at": iso_at(day.isoformat(), "morning"),
    })
    # cash adjustment
    client.post("/cash/adjust", json={
        "delta_cash": 50, "happened_at": iso_at(day.isoformat(), "morning"), "reason": "test",
    })
    # inventory adjustment
    client.post("/inventory/adjust", json={
        "gas_type": "12kg", "delta_full": 1, "delta_empty": 0,
        "happened_at": iso_at(day.isoformat(), "morning"), "reason": "test",
    })
    # order + collection (covers "order" and "collection_money" legacy aliases)
    customer_id = create_customer(client, name="Coverage Customer")
    system_id = create_system(client, customer_id=customer_id)
    client.post("/orders", json={
        "customer_id": customer_id, "system_id": system_id,
        "happened_at": iso_at(day.isoformat(), "morning"),
        "order_mode": "replacement", "gas_type": "12kg",
        "cylinders_installed": 1, "cylinders_received": 1,
        "price_total": 100, "paid_amount": 100,
    })
    client.post("/collections", json={
        "customer_id": customer_id, "action_type": "payment",
        "amount_money": 50, "happened_at": iso_at(day.isoformat(), "morning"),
    })

    kinds = _event_types_for_day(client, day)

    # Old aliases must never appear
    assert "bank_deposit" not in kinds
    assert "cash_adjust" not in kinds
    assert "adjust" not in kinds
    assert "order" not in kinds
    assert "collection_money" not in kinds

    # Correct new names must be present
    assert "wallet_to_bank" in kinds
    assert "bank_to_wallet" in kinds
    assert "adjust_wallet" in kinds
    assert "adjust_inventory" in kinds
