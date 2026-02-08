from __future__ import annotations

from datetime import datetime, date, timedelta, timezone

from sqlmodel import Session, select

from conftest import create_customer, create_order, create_system, init_inventory, iso_at


def _freeze_time(monkeypatch, modules: list[object], fixed: datetime) -> None:
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz:
                return fixed.astimezone(tz)
            return fixed.replace(tzinfo=None)

        @classmethod
        def utcnow(cls):
            return fixed.replace(tzinfo=None)

    for module in modules:
        monkeypatch.setattr(module, "datetime", FixedDatetime)


def _post_expense(client, *, expense_date: str, amount: float, expense_type: str = "fuel", note: str = "test") -> None:
    resp = client.post(
        "/expenses",
        json={
            "date": expense_date,
            "expense_type": expense_type,
            "amount": amount,
            "note": note,
        },
    )
    assert resp.status_code == 201


def _post_refill(client, *, day: str) -> None:
    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day, "morning"),
            "buy12": 2,
            "return12": 1,
            "buy48": 1,
            "return48": 0,
            "note": "restock",
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert resp.status_code == 200


def _post_adjust(client, *, day: str) -> None:
    resp = client.post(
        "/inventory/adjust",
        json={
            "happened_at": iso_at(day, "morning"),
            "gas_type": "12kg",
            "delta_full": 0,
            "delta_empty": 2,
            "reason": "fix",
        },
    )
    assert resp.status_code == 200


def _cash_init(client, *, day: str, amount: float) -> None:
    prev_day = (date.fromisoformat(day) - timedelta(days=1)).isoformat()
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": iso_at(prev_day, "evening"), "delta_cash": int(amount), "reason": "open"},
    )
    assert resp.status_code == 201


def test_cash_carryover_daily_v2(client, monkeypatch) -> None:
    day1 = date(2025, 1, 1)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=0, full48=5, empty48=0)
    customer_id = create_customer(client, name="Cash Carry")
    system_id = create_system(client, customer_id=customer_id)
    _cash_init(client, day=day1.isoformat(), amount=1000)

    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=100,
        paid_amount=100,
    )

    _post_expense(client, expense_date=day1.isoformat(), amount=30)

    resp = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day2.isoformat()})
    assert resp.status_code == 200
    rows = {row["date"]: row for row in resp.json()}
    assert rows[day1.isoformat()]["cash_start"] == 1000
    assert rows[day1.isoformat()]["cash_end"] == 1070
    assert rows[day2.isoformat()]["cash_start"] == 1070


def test_daily_v2_bookends_match_inventory_summary(client, monkeypatch) -> None:
    day1 = date(2025, 2, 1)

    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=12, empty12=3, full48=6, empty48=2)
    _cash_init(client, day=day1.isoformat(), amount=500)

    report_resp = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day1.isoformat()})
    assert report_resp.status_code == 200
    row = report_resp.json()[0]

    assert row["inventory_start"]["full12"] == 12
    assert row["inventory_start"]["empty12"] == 3
    assert row["inventory_start"]["full48"] == 6
    assert row["inventory_start"]["empty48"] == 2
    assert row["inventory_end"]["full12"] == 12
    assert row["inventory_end"]["empty12"] == 3
    assert row["inventory_end"]["full48"] == 6
    assert row["inventory_end"]["empty48"] == 2
    assert row["cash_start"] == 500
    assert row["cash_end"] == 500


def test_day_v2_timeline_rules(client, monkeypatch) -> None:
    day1 = date(2025, 3, 1)

    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=0, full48=5, empty48=0)
    customer_id = create_customer(client, name="Timeline")
    system_id = create_system(client, customer_id=customer_id)
    _cash_init(client, day=day1.isoformat(), amount=1000)

    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T08:00:00",
        gas_type="12kg",
        installed=1,
        received=1,
        price_total=100,
        paid_amount=100,
    )
    _post_refill(client, day=day1.isoformat())
    _post_expense(client, expense_date=day1.isoformat(), amount=20)
    _post_adjust(client, day=day1.isoformat())

    resp = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert resp.status_code == 200
    body = resp.json()
    events = body["events"]

    assert all("cash_before" in event and "cash_after" in event for event in events)

    order_event = next(event for event in events if event["event_type"] == "order")
    assert order_event["cash_before"] == 1000
    assert order_event["cash_after"] == 1100
    assert order_event["inventory_before"]["full12"] is not None
    assert order_event["inventory_before"]["empty12"] is not None
    assert order_event["inventory_before"]["full48"] is None
    assert order_event["inventory_before"]["empty48"] is None
    assert order_event["inventory_after"]["full12"] is not None
    assert order_event["inventory_after"]["empty12"] is not None
    assert order_event["inventory_after"]["full48"] is None
    assert order_event["inventory_after"]["empty48"] is None

    adjust_event = next(event for event in events if event["event_type"] == "adjust")
    assert adjust_event["inventory_before"]["full12"] is None
    assert adjust_event["inventory_before"]["empty12"] is not None
    assert adjust_event["inventory_after"]["full12"] is None
    assert adjust_event["inventory_after"]["empty12"] == adjust_event["inventory_before"]["empty12"] + 2

    expense_event = next(event for event in events if event["event_type"] == "expense")
    assert expense_event["inventory_before"] is None
    assert expense_event["inventory_after"] is None

    refill_event = next(event for event in events if event["event_type"] == "refill")
    assert refill_event["inventory_before"]["full12"] is not None
    assert refill_event["inventory_before"]["empty12"] is not None
    assert refill_event["inventory_before"]["full48"] is not None
    assert refill_event["inventory_before"]["empty48"] is not None
    assert refill_event["inventory_after"]["full12"] is not None
    assert refill_event["inventory_after"]["empty12"] is not None
    assert refill_event["inventory_after"]["full48"] is not None
    assert refill_event["inventory_after"]["empty48"] is not None


def test_option_b_cascade_delete_order(client, monkeypatch) -> None:
    day1 = date(2025, 4, 1)
    day2 = day1 + timedelta(days=1)

    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=0, full48=8, empty48=0)
    customer_id = create_customer(client, name="Cascade")
    system_id = create_system(client, customer_id=customer_id)
    _cash_init(client, day=day1.isoformat(), amount=1000)

    order_a = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T08:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=100,
        paid_amount=100,
    )
    order_b = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T09:00:00",
        gas_type="48kg",
        installed=1,
        received=0,
        price_total=200,
        paid_amount=200,
    )
    _post_expense(client, expense_date=day1.isoformat(), amount=50)

    order_c = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day2.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=300,
        paid_amount=300,
    )

    before_day1 = client.get("/reports/day_v2", params={"date": day1.isoformat()}).json()
    before_day2 = client.get("/reports/day_v2", params={"date": day2.isoformat()}).json()
    before_order_b = next(event for event in before_day1["events"] if event["source_id"] == order_b)
    before_order_c = next(event for event in before_day2["events"] if event["source_id"] == order_c)

    before_daily = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day2.isoformat()}).json()
    before_by_date = {row["date"]: row for row in before_daily}

    delete_resp = client.delete(f"/orders/{order_a}")
    assert delete_resp.status_code in {200, 204}

    after_day1 = client.get("/reports/day_v2", params={"date": day1.isoformat()}).json()
    after_day2 = client.get("/reports/day_v2", params={"date": day2.isoformat()}).json()
    after_order_b = next(event for event in after_day1["events"] if event["source_id"] == order_b)
    after_order_c = next(event for event in after_day2["events"] if event["source_id"] == order_c)

    assert after_order_b["cash_before"] == before_order_b["cash_before"] - 100
    assert after_order_b["cash_after"] == before_order_b["cash_after"] - 100

    after_daily = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day2.isoformat()}).json()
    after_by_date = {row["date"]: row for row in after_daily}

    assert after_by_date[day1.isoformat()]["cash_end"] == before_by_date[day1.isoformat()]["cash_end"] - 100
    assert after_by_date[day2.isoformat()]["cash_start"] == before_by_date[day2.isoformat()]["cash_start"] - 100
    assert after_order_c["cash_before"] == before_order_c["cash_before"] - 100
    assert after_order_c["cash_after"] == before_order_c["cash_after"] - 100


def test_order_update_recomputes_cash_and_inventory(client, monkeypatch) -> None:
    day1 = date(2025, 5, 1)
    day2 = day1 + timedelta(days=1)

    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=10, empty12=0, full48=5, empty48=0)
    customer_id = create_customer(client, name="Update")
    system_id = create_system(client, customer_id=customer_id)
    _cash_init(client, day=day1.isoformat(), amount=500)

    order_id = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day1.isoformat()}T09:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=100,
        paid_amount=100,
    )
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day2.isoformat()}T10:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=50,
        paid_amount=50,
    )

    update_resp = client.put(
        f"/orders/{order_id}",
        json={"paid_amount": 150, "cylinders_installed": 2},
    )
    assert update_resp.status_code == 200

    day_resp = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert day_resp.status_code == 200
    order_event = next(event for event in day_resp.json()["events"] if event["source_id"] == order_id)
    assert order_event["cash_before"] == 500
    assert order_event["cash_after"] == 650
    assert order_event["inventory_before"]["full12"] == 10
    assert order_event["inventory_after"]["full12"] == 8

    daily_resp = client.get("/reports/daily_v2", params={"from": day1.isoformat(), "to": day2.isoformat()})
    daily = {row["date"]: row for row in daily_resp.json()}
    assert daily[day2.isoformat()]["cash_start"] == 650


def test_expense_ordering_by_created_at(client, monkeypatch) -> None:
    day1 = date(2025, 6, 10)

    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=5, empty12=0, full48=5, empty48=0)
    _cash_init(client, day=day1.isoformat(), amount=500)

    _post_expense(client, expense_date=day1.isoformat(), amount=10, expense_type="fuel")
    _post_expense(client, expense_date=day1.isoformat(), amount=20, expense_type="food")

    resp = client.get("/reports/day_v2", params={"date": day1.isoformat()})
    assert resp.status_code == 200
    expenses = [event for event in resp.json()["events"] if event["event_type"] == "expense"]
    assert len(expenses) == 2
    assert expenses[0]["cash_before"] == 500
    assert expenses[0]["cash_after"] == 490
    assert expenses[1]["cash_before"] == 490
    assert expenses[1]["cash_after"] == 470
