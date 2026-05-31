from __future__ import annotations

from datetime import date, timedelta
from conftest import create_customer, create_system, init_inventory, iso_at


LEGACY_KINDS = {"bank_deposit", "cash_adjust", "adjust", "order", "collection_money"}
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


def test_bank_deposit_kind_never_emitted(client) -> None:
    _setup(client)
    day = BASE_DAY
    client.post(
        "/cash/bank_deposit",
        json={"amount": 100, "direction": "wallet_to_bank", "happened_at": iso_at(day.isoformat(), "morning")},
    )
    kinds = _event_types_for_day(client, day)
    assert "bank_deposit" not in kinds, f"Legacy kind 'bank_deposit' found in {kinds}"
    assert "wallet_to_bank" in kinds


def test_wallet_to_bank_emitted_not_bank_deposit(client) -> None:
    _setup(client)
    day = BASE_DAY + timedelta(days=1)
    client.post(
        "/cash/bank_deposit",
        json={"amount": 100, "direction": "bank_to_wallet", "happened_at": iso_at(day.isoformat(), "morning")},
    )
    kinds = _event_types_for_day(client, day)
    assert "bank_deposit" not in kinds, f"Legacy kind 'bank_deposit' found in {kinds}"
    assert "bank_to_wallet" in kinds


def test_cash_adjust_kind_never_emitted(client) -> None:
    _setup(client)
    day = BASE_DAY + timedelta(days=2)
    client.post(
        "/cash/adjust",
        json={"delta_cash": 50, "happened_at": iso_at(day.isoformat(), "morning"), "reason": "test"},
    )
    kinds = _event_types_for_day(client, day)
    assert "cash_adjust" not in kinds, f"Legacy kind 'cash_adjust' found in {kinds}"
    assert "adjust_wallet" in kinds


def test_adjust_kind_never_emitted(client) -> None:
    _setup(client)
    day = BASE_DAY + timedelta(days=3)
    client.post(
        "/inventory/adjust",
        json={"gas_type": "12kg", "delta_full": 1, "delta_empty": 0,
              "happened_at": iso_at(day.isoformat(), "morning"), "reason": "test"},
    )
    kinds = _event_types_for_day(client, day)
    assert "adjust" not in kinds, f"Legacy kind 'adjust' found in {kinds}"
    assert "adjust_inventory" in kinds


def test_no_legacy_kind_in_full_day(client) -> None:
    """Assert no legacy aliases appear across a day with multiple activity types."""
    _setup(client)
    day = BASE_DAY + timedelta(days=4)
    customer_id = create_customer(client, name="Coverage Customer")
    system_id = create_system(client, customer_id=customer_id)

    client.post("/orders", json={
        "customer_id": customer_id, "system_id": system_id,
        "happened_at": iso_at(day.isoformat(), "morning"),
        "order_mode": "replacement", "gas_type": "12kg",
        "cylinders_installed": 1, "cylinders_received": 1,
        "price_total": 100, "paid_amount": 100,
    })
    client.post("/cash/bank_deposit", json={
        "amount": 100, "direction": "wallet_to_bank",
        "happened_at": iso_at(day.isoformat(), "morning"),
    })
    client.post("/cash/adjust", json={
        "delta_cash": 10, "happened_at": iso_at(day.isoformat(), "morning"), "reason": "test",
    })

    kinds = _event_types_for_day(client, day)
    for legacy in LEGACY_KINDS:
        assert legacy not in kinds, f"Legacy kind '{legacy}' found in event_types: {kinds}"
