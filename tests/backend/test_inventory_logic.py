from __future__ import annotations
import pytest
from conftest import (
    init_inventory, create_customer, create_system,
    create_order, get_daily_row, assert_inventory, iso_at
)
from app.utils.locks import acquire_company_lock, acquire_customer_lock, acquire_inventory_lock

def test_full_recalculate_integrity_pass(client) -> None:
    init_inventory(client, date="2025-01-01")
    c_id = create_customer(client, name="Isa", starting_money=100.0, starting_12kg=2)
    s_id = create_system(client, customer_id=c_id)

    order_id = create_order(client, customer_id=c_id, system_id=s_id, price_total=50.0)
    assert client.get(f"/customers/{c_id}").json()["money_balance"] == 150

    client.put(f"/orders/{order_id}", json={"price_total": 20, "paid_amount": 0})
    assert client.get(f"/customers/{c_id}").json()["money_balance"] == 120

    client.delete(f"/orders/{order_id}")
    assert client.get(f"/customers/{c_id}").json()["money_balance"] == 100

def test_order_create_updates_inventory_pass(client) -> None:
    init_inventory(client, date="2025-01-01")
    c_id = create_customer(client, name="Alice")
    s_id = create_system(client, customer_id=c_id)

    create_order(client, customer_id=c_id, system_id=s_id, installed=3, received=1)
    
    daily = get_daily_row(client, "2025-01-02")
    assert_inventory(daily["inventory_end"], full12=47, empty12=11, full48=20, empty48=5)

def test_customer_onboarding_integrity_pass(client) -> None:
    init_inventory(client, date="2025-01-01")
    c_id = create_customer(client, name="Hana", starting_money=100.0, starting_12kg=2)
    
    # Check adjustments
    adj = client.get(f"/customer-adjustments/{c_id}").json()
    assert adj[0]["amount_money"] == 100
    assert adj[0]["count_12kg"] == 2

    # Check inventory is UNTOUCHED by onboarding
    latest = client.get("/inventory/latest").json()
    assert latest["full12"] == 50

def test_backdated_order_recomputes_future_days(client) -> None:
    init_inventory(client, date="2025-01-01")
    c_id = create_customer(client, name="Yara")
    s_id = create_system(client, customer_id=c_id)

    create_order(client, customer_id=c_id, system_id=s_id, delivered_at="2025-01-03T10:00:00", installed=2)
    create_order(client, customer_id=c_id, system_id=s_id, delivered_at="2025-01-02T10:00:00", installed=1)

    daily_2 = get_daily_row(client, "2025-01-02")
    daily_3 = get_daily_row(client, "2025-01-03")
    assert_inventory(daily_2["inventory_end"], full12=49, empty12=10, full48=20, empty48=5)
    assert_inventory(daily_3["inventory_end"], full12=47, empty12=10, full48=20, empty48=5)

def test_refill_negative_rejected(client) -> None:
    init_inventory(client, date="2025-01-01")
    payload = {
        "happened_at": iso_at("2025-01-02", "morning"),
        "buy12": 0,
        "return12": 100,
        "buy48": 0,
        "return48": 0,
        "note": "test",
        "total_cost": 0,
        "paid_now": 0,
    }
    resp = client.post("/inventory/refill", json=payload)
    assert resp.status_code == 200
    snapshot = resp.json()
    assert snapshot["empty12"] == -90

def test_refill_allow_negative_requires_admin(client) -> None:
    init_inventory(client, date="2025-01-01")
    payload = {
        "happened_at": iso_at("2025-01-02", "morning"),
        "buy12": 0,
        "return12": 100,
        "buy48": 0,
        "return48": 0,
        "note": "test",
        "total_cost": 0,
        "paid_now": 0,
    }
    resp = client.post("/inventory/refill", json=payload)
    assert resp.status_code == 200

def test_inventory_snapshot_by_time_of_day(client) -> None:
    init_inventory(client, date="2025-01-01")
    resp = client.post("/inventory/refill", json={
        "happened_at": iso_at("2025-01-02", "morning"),
        "buy12": 2,
        "return12": 3,
        "buy48": 1,
        "return48": 2,
        "note": "test",
        "total_cost": 0,
        "paid_now": 0,
    })
    assert resp.status_code == 200

    snapshot = client.get("/inventory/snapshot", params={
        "date": "2025-01-02",
        "time_of_day": "morning",
    }).json()
    assert snapshot["full12"] == 52
    assert snapshot["empty12"] == 7
    assert snapshot["full48"] == 21
    assert snapshot["empty48"] == 3

def test_adjust_negative_rejected(client) -> None:
    init_inventory(client, date="2025-01-01")
    payload = {
        "happened_at": iso_at("2025-01-02", "morning"),
        "gas_type": "12kg",
        "delta_full": -100,
        "delta_empty": 0,
        "reason": "test",
    }
    resp = client.post("/inventory/adjust", json=payload)
    assert resp.status_code == 200

def test_adjust_allow_negative_requires_admin(client) -> None:
    init_inventory(client, date="2025-01-01")
    payload = {
        "happened_at": iso_at("2025-01-02", "morning"),
        "gas_type": "12kg",
        "delta_full": -100,
        "delta_empty": 0,
        "reason": "test",
    }
    resp = client.post("/inventory/adjust", json=payload)
    assert resp.status_code == 200

def test_inventory_adjust_reason_optional(client) -> None:
    init_inventory(client, date="2025-01-01")
    payload = {
        "happened_at": iso_at("2025-01-02", "morning"),
        "gas_type": "12kg",
        "delta_full": 1,
        "delta_empty": 0,
    }
    resp = client.post("/inventory/adjust", json=payload)
    assert resp.status_code == 200
    snapshot = resp.json()
    assert snapshot["full12"] == 51

def test_advisory_lock_uses_hashtext_for_postgres() -> None:
    class _Dialect:
        name = "postgresql"

    class _Bind:
        dialect = _Dialect()

    class _Session:
        def __init__(self) -> None:
            self.calls = []

        def get_bind(self):
            return _Bind()

        def exec(self, stmt, params=None):
            self.calls.append((str(stmt), params))

    session = _Session()
    acquire_inventory_lock(session, "12kg")
    assert session.calls
    sql, params = session.calls[0]
    assert "pg_advisory_xact_lock(hashtext(:key))" in sql
    assert params == {"key": "inventory:12kg"}


def test_customer_advisory_lock_uses_customer_namespace() -> None:
    class _Dialect:
        name = "postgresql"

    class _Bind:
        dialect = _Dialect()

    class _Session:
        def __init__(self) -> None:
            self.calls = []

        def get_bind(self):
            return _Bind()

        def exec(self, stmt, params=None):
            self.calls.append((str(stmt), params))

    session = _Session()
    acquire_customer_lock(session, "cust-1")
    assert session.calls
    _, params = session.calls[0]
    assert params == {"key": "customer:cust-1"}


def test_company_advisory_lock_uses_company_namespace() -> None:
    class _Dialect:
        name = "postgresql"

    class _Bind:
        dialect = _Dialect()

    class _Session:
        def __init__(self) -> None:
            self.calls = []

        def get_bind(self):
            return _Bind()

        def exec(self, stmt, params=None):
            self.calls.append((str(stmt), params))

    session = _Session()
    acquire_company_lock(session)
    assert session.calls
    _, params = session.calls[0]
    assert params == {"key": "company"}

def test_inventory_day_endpoint_ordering_and_totals(client) -> None:
    init_inventory(client, date="2025-01-01")
    c_id = create_customer(client, name="Dana")
    s_id = create_system(client, customer_id=c_id)

    client.post("/inventory/refill", json={
        "happened_at": iso_at("2025-01-02", "morning"),
        "buy12": 3,
        "return12": 1,
        "buy48": 2,
        "return48": 0,
        "note": "restock",
        "total_cost": 0,
        "paid_now": 0,
    })
    create_order(client, customer_id=c_id, system_id=s_id, delivered_at="2025-01-02T10:00:00", installed=2, received=1)
    client.post("/inventory/adjust", json={
        "happened_at": iso_at("2025-01-02", "morning"),
        "gas_type": "12kg",
        "delta_full": -1,
        "delta_empty": 0,
        "reason": "damage",
    })

    resp = client.get("/reports/day_v2", params={"date": "2025-01-02"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["date"] == "2025-01-02"
    events = [e for e in body["events"] if e["event_type"] in {"refill", "order", "adjust"}]
    assert len(events) == 3
    assert events[0]["effective_at"] <= events[1]["effective_at"] <= events[2]["effective_at"]

    daily = get_daily_row(client, "2025-01-02")
    assert_inventory(daily["inventory_end"], full12=50, empty12=10, full48=20, empty48=5)

def test_inventory_adjust_grouped_report_event_for_multi_row_action(client) -> None:
    init_inventory(client, date="2025-01-01")
    happened_at = iso_at("2025-01-02", "morning")
    group_id = "inventory-adjust-group-1"

    first = client.post("/inventory/adjust", json={
        "happened_at": happened_at,
        "group_id": group_id,
        "gas_type": "12kg",
        "delta_full": 1,
        "delta_empty": 0,
        "reason": "bulk fix",
    })
    second = client.post("/inventory/adjust", json={
        "happened_at": happened_at,
        "group_id": group_id,
        "gas_type": "48kg",
        "delta_full": 0,
        "delta_empty": 2,
        "reason": "bulk fix",
    })
    assert first.status_code == 200
    assert second.status_code == 200

    adjustments = client.get("/inventory/adjustments", params={"date": "2025-01-02"})
    assert adjustments.status_code == 200
    rows = adjustments.json()
    assert len(rows) == 2
    assert {row["group_id"] for row in rows} == {group_id}

    report = client.get("/reports/day_v2", params={"date": "2025-01-02"})
    assert report.status_code == 200
    events = [event for event in report.json()["events"] if event["event_type"] == "adjust"]
    assert len(events) == 1

    event = events[0]
    assert event["source_id"] == group_id
    assert event["reason"] == "bulk fix"
    assert event["inventory_before"]["full12"] == 50
    assert event["inventory_after"]["full12"] == 51
    assert event["inventory_before"]["empty48"] == 5
    assert event["inventory_after"]["empty48"] == 7

def test_inventory_deltas_endpoint_filters_and_order(client) -> None:
    init_inventory(client, date="2025-01-01")
    c_id = create_customer(client, name="Mona")
    s_id = create_system(client, customer_id=c_id)

    client.post("/inventory/refill", json={
        "happened_at": iso_at("2025-01-02", "morning"),
        "buy12": 2,
        "return12": 0,
        "buy48": 0,
        "return48": 0,
        "note": "restock",
        "total_cost": 0,
        "paid_now": 0,
    })
    create_order(client, customer_id=c_id, system_id=s_id, delivered_at="2025-01-02T11:00:00", installed=1, received=0)

    resp = client.get("/reports/day_v2", params={"date": "2025-01-02"})
    assert resp.status_code == 200
    body = resp.json()
    events = [e for e in body["events"] if e["event_type"] in {"refill", "order"}]
    assert len(events) >= 2
    assert events[0]["effective_at"] <= events[1]["effective_at"]
