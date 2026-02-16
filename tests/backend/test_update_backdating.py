from __future__ import annotations

from datetime import date, timedelta

from conftest import create_customer, create_order, create_system, init_inventory, iso_at


def _cash_init(client, *, day: date, amount: int) -> None:
    prev_day = (day - timedelta(days=1)).isoformat()
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": iso_at(prev_day, "evening"), "delta_cash": int(amount), "reason": "open"},
    )
    assert resp.status_code == 201


def test_order_update_preserves_original_day(client) -> None:
    day1 = date(2025, 10, 1)
    day2 = date(2025, 10, 10)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=0, full48=0, empty48=0)
    _cash_init(client, day=day1, amount=1000)

    customer_id = create_customer(client, name="Backdate")
    system_id = create_system(client, customer_id=customer_id)
    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=iso_at(day1.isoformat(), "morning"),
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=100,
        paid_amount=0,
    )

    update_resp = client.put(
        f"/orders/{order_id}",
        json={"paid_amount": 50, "cylinders_installed": 2},
    )
    assert update_resp.status_code == 200
    new_order_id = update_resp.json()["id"]

    day1_resp = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert day1_resp.status_code == 200
    day1_events = day1_resp.json()["events"]
    order_event = next(event for event in day1_events if event["event_type"] == "order")
    assert order_event["source_id"] == new_order_id
    assert order_event["cash_before"] == 1000
    assert order_event["cash_after"] == 1050
    assert order_event["inventory_after"]["full12"] == 8

    day2_resp = client.get("/reports/day_v2", params={"date": day2.isoformat()})
    assert day2_resp.status_code == 200
    assert not any(event["event_type"] == "order" for event in day2_resp.json()["events"])
