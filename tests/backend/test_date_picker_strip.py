from __future__ import annotations

from datetime import date, timedelta
from conftest import create_customer, create_system, init_inventory, iso_at


BASE = date(2026, 1, 10)


def _setup(client) -> None:
    init_inventory(client, date=(BASE - timedelta(days=1)).isoformat())


def _cards(client, from_date: date, to_date: date) -> list[dict]:
    resp = client.get(
        "/reports/daily",
        params={"from": from_date.isoformat(), "to": to_date.isoformat()},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _dates(cards: list[dict]) -> list[str]:
    return [c["date"] for c in cards]


def test_strip_includes_all_days_in_range(client) -> None:
    """Every day in the range appears even with no activity."""
    _setup(client)
    from_date = BASE
    to_date = BASE + timedelta(days=4)

    cards = _cards(client, from_date, to_date)
    dates = _dates(cards)

    for i in range(5):
        expected = (BASE + timedelta(days=i)).isoformat()
        assert expected in dates, f"Day {expected} missing from strip. Got: {dates}"

    assert len(cards) == 5


def test_strip_empty_day_has_zero_values(client) -> None:
    """A day with no activity appears with zero sold and zero net."""
    _setup(client)
    day = BASE + timedelta(days=5)

    cards = _cards(client, day, day)
    assert len(cards) == 1
    card = cards[0]
    assert card["date"] == day.isoformat()
    assert card["sold_12kg"] == 0
    assert card["sold_48kg"] == 0
    assert card["net_today"] == 0
    assert card["has_refill"] is False


def test_strip_active_day_has_nonzero_values(client) -> None:
    """A day with a replacement shows nonzero sold_12kg and net_today."""
    _setup(client)
    day = BASE + timedelta(days=6)
    customer_id = create_customer(client, name="Strip Customer")
    system_id = create_system(client, customer_id=customer_id)

    client.post("/orders", json={
        "customer_id": customer_id,
        "system_id": system_id,
        "happened_at": iso_at(day.isoformat(), "morning"),
        "order_mode": "replacement",
        "gas_type": "12kg",
        "cylinders_installed": 3,
        "cylinders_received": 3,
        "price_total": 300,
        "paid_amount": 300,
    })

    cards = _cards(client, day, day)
    assert len(cards) == 1
    card = cards[0]
    assert card["date"] == day.isoformat()
    assert card["sold_12kg"] == 3
    assert card["net_today"] == 300


def test_strip_mixed_range_active_and_empty(client) -> None:
    """3-day range with activity only on day 2 — all 3 days appear; only day 2 is nonzero."""
    _setup(client)
    day1 = BASE + timedelta(days=7)
    day2 = BASE + timedelta(days=8)
    day3 = BASE + timedelta(days=9)

    customer_id = create_customer(client, name="Mixed Strip Customer")
    system_id = create_system(client, customer_id=customer_id)

    client.post("/orders", json={
        "customer_id": customer_id,
        "system_id": system_id,
        "happened_at": iso_at(day2.isoformat(), "morning"),
        "order_mode": "replacement",
        "gas_type": "12kg",
        "cylinders_installed": 2,
        "cylinders_received": 2,
        "price_total": 200,
        "paid_amount": 200,
    })

    cards = _cards(client, day1, day3)
    dates = _dates(cards)

    assert day1.isoformat() in dates
    assert day2.isoformat() in dates
    assert day3.isoformat() in dates
    assert len(cards) == 3

    by_date = {c["date"]: c for c in cards}
    assert by_date[day1.isoformat()]["sold_12kg"] == 0
    assert by_date[day2.isoformat()]["sold_12kg"] == 2
    assert by_date[day2.isoformat()]["net_today"] == 200
    assert by_date[day3.isoformat()]["sold_12kg"] == 0


def test_strip_single_day_range(client) -> None:
    """from == to returns exactly one card."""
    _setup(client)
    day = BASE + timedelta(days=10)

    cards = _cards(client, day, day)
    assert len(cards) == 1
    assert cards[0]["date"] == day.isoformat()


def test_strip_cards_ordered_by_date(client) -> None:
    """Cards are in ascending date order."""
    _setup(client)
    from_date = BASE + timedelta(days=11)
    to_date = BASE + timedelta(days=13)

    cards = _cards(client, from_date, to_date)
    dates = [c["date"] for c in cards]
    assert dates == sorted(dates)
