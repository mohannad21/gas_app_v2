from datetime import date, timedelta

from tests.backend.conftest import create_customer, create_order, create_system, get_daily_row, init_inventory, iso_at


def _cash_init(client, *, day: date, amount: int) -> None:
    prev_day = (day - timedelta(days=1)).isoformat()
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": iso_at(prev_day, "evening"), "delta_cash": int(amount), "reason": "open"},
    )
    assert resp.status_code == 201, resp.text


def _post_expense(client, *, happened_at: str, amount: int, note: str = "replacement-test") -> str:
    resp = client.post(
        "/expenses",
        json={
            "expense_type": "fuel",
            "amount": amount,
            "note": note,
            "date": happened_at[:10],
            "happened_at": happened_at,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _day_report(client, day: date) -> dict:
    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _event_by_source(report: dict, source_id: str) -> dict:
    return next(event for event in report["events"] if event.get("source_id") == source_id)


def _event_by_type(report: dict, event_type: str) -> dict:
    return next(event for event in report["events"] if event.get("event_type") == event_type)


def _customer_detail(client, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _customer_balances(client, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}/balances")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _assert_customer_state(
    client,
    *,
    customer_id: str,
    money: int,
    cyl12: int,
    cyl48: int,
    order_count: int,
) -> None:
    detail = _customer_detail(client, customer_id)
    balances = _customer_balances(client, customer_id)
    for row in (detail, balances):
        assert row["money_balance"] == money
        assert row["cylinder_balance_12kg"] == cyl12
        assert row["cylinder_balance_48kg"] == cyl48
        assert row["order_count"] == order_count


def _company_state(client) -> tuple[int, int, int]:
    resp = client.get("/company/balances")
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    return (
        payload["company_money"],
        payload["company_cyl_12"],
        payload["company_cyl_48"],
    )


def test_replacement_add_as_last_activity_updates_reports_and_customer_state(client) -> None:
    day = date(2025, 12, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=0, empty48=0)
    _cash_init(client, day=day, amount=1000)

    customer_id = create_customer(client, name="Replacement Last")
    system_id = create_system(client, customer_id=customer_id, name="Replacement Last System")
    company_before = _company_state(client)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=150,
        paid_amount=100,
    )

    daily = get_daily_row(client, day.isoformat())
    assert daily["net_today"] == 100
    assert daily["sold_12kg"] == 2

    report = _day_report(client, day)
    assert report["cash_start"] == 1000
    assert report["cash_end"] == 1100
    assert report["inventory_end"]["full12"] == 8
    assert report["inventory_end"]["empty12"] == 3

    event = _event_by_source(report, order_id)
    assert event["cash_before"] == 1000
    assert event["cash_after"] == 1100
    assert event["customer_money_before"] == 0
    assert event["customer_money_after"] == 50
    assert event["customer_12kg_before"] == 0
    assert event["customer_12kg_after"] == 1
    assert event["inventory_before"]["full12"] == 10
    assert event["inventory_after"]["full12"] == 8
    assert event["inventory_before"]["empty12"] == 2
    assert event["inventory_after"]["empty12"] == 3

    _assert_customer_state(client, customer_id=customer_id, money=50, cyl12=1, cyl48=0, order_count=1)
    assert _company_state(client) == company_before


def test_replacement_add_in_past_recomputes_later_events_and_next_day_opening_state(client) -> None:
    day1 = date(2025, 12, 2)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=20, empty12=5, full48=0, empty48=0)
    _cash_init(client, day=day1, amount=1000)

    customer_id = create_customer(client, name="Replacement Past Add")
    system_id = create_system(client, customer_id=customer_id, name="Replacement Past Add System")
    company_before = _company_state(client)

    _post_expense(client, happened_at=f"{day1.isoformat()}T12:00:00", amount=10)
    later_order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day2.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=40,
        paid_amount=40,
    )

    before_day1_row = get_daily_row(client, day1.isoformat())
    before_day2_row = get_daily_row(client, day2.isoformat())
    before_day1 = _day_report(client, day1)
    before_day2 = _day_report(client, day2)
    before_expense = _event_by_type(before_day1, "expense")
    before_later_order = _event_by_source(before_day2, later_order_id)

    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=150,
        paid_amount=100,
    )

    after_day1_row = get_daily_row(client, day1.isoformat())
    after_day2_row = get_daily_row(client, day2.isoformat())
    after_day1 = _day_report(client, day1)
    after_day2 = _day_report(client, day2)
    after_expense = _event_by_type(after_day1, "expense")
    after_later_order = _event_by_source(after_day2, later_order_id)

    assert after_day1_row["net_today"] == before_day1_row["net_today"] + 100
    assert after_day1_row["sold_12kg"] == before_day1_row["sold_12kg"] + 2
    assert after_day2_row["cash_start"] == before_day2_row["cash_start"] + 100

    assert after_expense["cash_before"] == before_expense["cash_before"] + 100
    assert after_expense["cash_after"] == before_expense["cash_after"] + 100

    assert after_later_order["cash_before"] == before_later_order["cash_before"] + 100
    assert after_later_order["cash_after"] == before_later_order["cash_after"] + 100
    assert after_later_order["inventory_before"]["full12"] == before_later_order["inventory_before"]["full12"] - 2
    assert after_later_order["inventory_after"]["full12"] == before_later_order["inventory_after"]["full12"] - 2
    assert after_later_order["inventory_before"]["empty12"] == before_later_order["inventory_before"]["empty12"] + 1
    assert after_later_order["inventory_after"]["empty12"] == before_later_order["inventory_after"]["empty12"] + 1
    assert after_later_order["customer_money_before"] == before_later_order["customer_money_before"] + 50
    assert after_later_order["customer_money_after"] == before_later_order["customer_money_after"] + 50
    assert after_later_order["customer_12kg_before"] == before_later_order["customer_12kg_before"] + 1
    assert after_later_order["customer_12kg_after"] == before_later_order["customer_12kg_after"] + 1

    _assert_customer_state(client, customer_id=customer_id, money=50, cyl12=2, cyl48=0, order_count=1)
    assert _company_state(client) == company_before


def test_replacement_delete_last_activity_reverses_reports_and_active_visibility(client) -> None:
    day = date(2025, 12, 3)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=0, empty48=0)
    _cash_init(client, day=day, amount=1000)

    customer_id = create_customer(client, name="Replacement Delete Last")
    system_id = create_system(client, customer_id=customer_id, name="Replacement Delete Last System")
    company_before = _company_state(client)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=150,
        paid_amount=100,
    )

    delete_resp = client.delete(f"/orders/{order_id}")
    assert delete_resp.status_code == 204

    daily = get_daily_row(client, day.isoformat())
    assert daily["net_today"] == 0
    assert daily["sold_12kg"] == 0

    report = _day_report(client, day)
    assert not any(event.get("source_id") == order_id for event in report["events"])
    assert report["cash_start"] == 1000
    assert report["cash_end"] == 1000
    assert report["inventory_end"]["full12"] == 10
    assert report["inventory_end"]["empty12"] == 2

    _assert_customer_state(client, customer_id=customer_id, money=0, cyl12=0, cyl48=0, order_count=0)

    active_orders = client.get("/orders")
    assert active_orders.status_code == 200
    assert not any(order["id"] == order_id for order in active_orders.json())

    all_orders = client.get("/orders", params={"include_deleted": True})
    assert all_orders.status_code == 200
    deleted_rows = [order for order in all_orders.json() if order["id"] == order_id]
    assert deleted_rows
    assert deleted_rows[0]["is_deleted"] is True

    assert _company_state(client) == company_before


def test_replacement_delete_in_past_recomputes_later_events_and_next_day_opening_state(client) -> None:
    day1 = date(2025, 12, 4)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=20, empty12=5, full48=0, empty48=0)
    _cash_init(client, day=day1, amount=1000)

    customer_id = create_customer(client, name="Replacement Past Delete")
    system_id = create_system(client, customer_id=customer_id, name="Replacement Past Delete System")
    company_before = _company_state(client)

    earlier_order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=150,
        paid_amount=100,
    )
    _post_expense(client, happened_at=f"{day1.isoformat()}T12:00:00", amount=10)
    later_order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day2.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=40,
        paid_amount=40,
    )

    before_day1_row = get_daily_row(client, day1.isoformat())
    before_day2_row = get_daily_row(client, day2.isoformat())
    before_day1 = _day_report(client, day1)
    before_day2 = _day_report(client, day2)
    before_expense = _event_by_type(before_day1, "expense")
    before_later_order = _event_by_source(before_day2, later_order_id)

    delete_resp = client.delete(f"/orders/{earlier_order_id}")
    assert delete_resp.status_code == 204

    after_day1_row = get_daily_row(client, day1.isoformat())
    after_day2_row = get_daily_row(client, day2.isoformat())
    after_day1 = _day_report(client, day1)
    after_day2 = _day_report(client, day2)
    after_expense = _event_by_type(after_day1, "expense")
    after_later_order = _event_by_source(after_day2, later_order_id)

    assert not any(event.get("source_id") == earlier_order_id for event in after_day1["events"])
    assert after_day1_row["net_today"] == before_day1_row["net_today"] - 100
    assert after_day1_row["sold_12kg"] == before_day1_row["sold_12kg"] - 2
    assert after_day2_row["cash_start"] == before_day2_row["cash_start"] - 100

    assert after_expense["cash_before"] == before_expense["cash_before"] - 100
    assert after_expense["cash_after"] == before_expense["cash_after"] - 100

    assert after_later_order["cash_before"] == before_later_order["cash_before"] - 100
    assert after_later_order["cash_after"] == before_later_order["cash_after"] - 100
    assert after_later_order["inventory_before"]["full12"] == before_later_order["inventory_before"]["full12"] + 2
    assert after_later_order["inventory_after"]["full12"] == before_later_order["inventory_after"]["full12"] + 2
    assert after_later_order["inventory_before"]["empty12"] == before_later_order["inventory_before"]["empty12"] - 1
    assert after_later_order["inventory_after"]["empty12"] == before_later_order["inventory_after"]["empty12"] - 1
    assert after_later_order["customer_money_before"] == before_later_order["customer_money_before"] - 50
    assert after_later_order["customer_money_after"] == before_later_order["customer_money_after"] - 50
    assert after_later_order["customer_12kg_before"] == before_later_order["customer_12kg_before"] - 1
    assert after_later_order["customer_12kg_after"] == before_later_order["customer_12kg_after"] - 1

    _assert_customer_state(client, customer_id=customer_id, money=0, cyl12=1, cyl48=0, order_count=0)
    assert _company_state(client) == company_before


def test_replacement_update_last_activity_recomputes_reports_and_customer_state(client) -> None:
    day = date(2025, 12, 5)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=2, full48=0, empty48=0)
    _cash_init(client, day=day, amount=1000)

    customer_id = create_customer(client, name="Replacement Update Last")
    system_id = create_system(client, customer_id=customer_id, name="Replacement Update Last System")
    company_before = _company_state(client)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=150,
        paid_amount=100,
    )

    update_resp = client.put(
        f"/orders/{order_id}",
        json={
            "price_total": 210,
            "paid_amount": 150,
            "cylinders_installed": 3,
            "cylinders_received": 1,
        },
    )
    assert update_resp.status_code == 200, update_resp.text
    new_order_id = update_resp.json()["id"]

    daily = get_daily_row(client, day.isoformat())
    assert daily["net_today"] == 150
    assert daily["sold_12kg"] == 3

    report = _day_report(client, day)
    event = _event_by_source(report, new_order_id)
    assert event["cash_before"] == 1000
    assert event["cash_after"] == 1150
    assert event["customer_money_before"] == 0
    assert event["customer_money_after"] == 60
    assert event["customer_12kg_before"] == 0
    assert event["customer_12kg_after"] == 2
    assert event["inventory_before"]["full12"] == 10
    assert event["inventory_after"]["full12"] == 7
    assert event["inventory_before"]["empty12"] == 2
    assert event["inventory_after"]["empty12"] == 3

    _assert_customer_state(client, customer_id=customer_id, money=60, cyl12=2, cyl48=0, order_count=1)

    active_orders = client.get("/orders")
    assert active_orders.status_code == 200
    matching_active = [order for order in active_orders.json() if order["id"] == order_id]
    assert len(matching_active) == 1
    assert matching_active[0]["price_total"] == 210
    assert matching_active[0]["paid_amount"] == 150
    assert matching_active[0]["cylinders_installed"] == 3
    assert matching_active[0]["cylinders_received"] == 1

    assert _company_state(client) == company_before


def test_replacement_update_in_past_recomputes_later_events_and_next_day_opening_state(client) -> None:
    day1 = date(2025, 12, 6)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=20, empty12=5, full48=0, empty48=0)
    _cash_init(client, day=day1, amount=1000)

    customer_id = create_customer(client, name="Replacement Past Update")
    system_id = create_system(client, customer_id=customer_id, name="Replacement Past Update System")
    company_before = _company_state(client)

    earlier_order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=150,
        paid_amount=100,
    )
    _post_expense(client, happened_at=f"{day1.isoformat()}T12:00:00", amount=10)
    later_order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day2.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=40,
        paid_amount=40,
    )

    before_day1_row = get_daily_row(client, day1.isoformat())
    before_day2_row = get_daily_row(client, day2.isoformat())
    before_day1 = _day_report(client, day1)
    before_day2 = _day_report(client, day2)
    before_expense = _event_by_type(before_day1, "expense")
    before_later_order = _event_by_source(before_day2, later_order_id)

    update_resp = client.put(
        f"/orders/{earlier_order_id}",
        json={
            "price_total": 210,
            "paid_amount": 150,
            "cylinders_installed": 3,
            "cylinders_received": 1,
        },
    )
    assert update_resp.status_code == 200, update_resp.text
    new_order_id = update_resp.json()["id"]

    after_day1_row = get_daily_row(client, day1.isoformat())
    after_day2_row = get_daily_row(client, day2.isoformat())
    after_day1 = _day_report(client, day1)
    after_day2 = _day_report(client, day2)
    after_expense = _event_by_type(after_day1, "expense")
    after_later_order = _event_by_source(after_day2, later_order_id)

    assert any(event.get("source_id") == new_order_id for event in after_day1["events"])
    assert after_day1_row["net_today"] == before_day1_row["net_today"] + 50
    assert after_day1_row["sold_12kg"] == before_day1_row["sold_12kg"] + 1
    assert after_day2_row["cash_start"] == before_day2_row["cash_start"] + 50

    assert after_expense["cash_before"] == before_expense["cash_before"] + 50
    assert after_expense["cash_after"] == before_expense["cash_after"] + 50

    assert after_later_order["cash_before"] == before_later_order["cash_before"] + 50
    assert after_later_order["cash_after"] == before_later_order["cash_after"] + 50
    assert after_later_order["inventory_before"]["full12"] == before_later_order["inventory_before"]["full12"] - 1
    assert after_later_order["inventory_after"]["full12"] == before_later_order["inventory_after"]["full12"] - 1
    assert after_later_order["inventory_before"]["empty12"] == before_later_order["inventory_before"]["empty12"]
    assert after_later_order["inventory_after"]["empty12"] == before_later_order["inventory_after"]["empty12"]
    assert after_later_order["customer_money_before"] == before_later_order["customer_money_before"] + 10
    assert after_later_order["customer_money_after"] == before_later_order["customer_money_after"] + 10
    assert after_later_order["customer_12kg_before"] == before_later_order["customer_12kg_before"] + 1
    assert after_later_order["customer_12kg_after"] == before_later_order["customer_12kg_after"] + 1

    _assert_customer_state(client, customer_id=customer_id, money=60, cyl12=3, cyl48=0, order_count=1)
    assert _company_state(client) == company_before
