from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlmodel import Session, select

from app import db as app_db
from app.models import CustomerTransaction, LedgerEntry
from tests.backend.conftest import create_customer, get_daily_row, init_inventory


TODAY = date(2026, 5, 14)
YESTERDAY = TODAY - timedelta(days=1)
DAY = TODAY - timedelta(days=2)
DAY_PLUS_1 = TODAY - timedelta(days=1)
DAY_PLUS_2 = TODAY


def _at(day: date, hour: int) -> str:
    return f"{day.isoformat()}T{hour:02d}:00:00"


def _seed_wallet(client, *, day: date, amount: int = 1000) -> None:
    resp = client.post(
        "/cash/adjust",
        json={
            "happened_at": _at(day - timedelta(days=1), 18),
            "delta_cash": amount,
            "reason": "opening wallet",
        },
    )
    assert resp.status_code == 201, resp.text


def _seed_company_balances(client, *, day: date, money: int = 200, cyl12: int = 5, cyl48: int = 3) -> None:
    resp = client.post(
        "/company/balances/adjust",
        json={
            "happened_at": _at(day - timedelta(days=1), 19),
            "money_balance": money,
            "cylinder_balance_12": cyl12,
            "cylinder_balance_48": cyl48,
            "note": "opening company balance",
        },
    )
    assert resp.status_code == 201, resp.text


def _seed_customer_balances(
    client,
    *,
    customer_id: str,
    day: date,
    money: int = 0,
    cyl12: int = 0,
    cyl48: int = 0,
) -> None:
    if money == 0 and cyl12 == 0 and cyl48 == 0:
        return
    resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": money,
            "count_12kg": cyl12,
            "count_48kg": cyl48,
            "reason": "opening balance",
            "happened_at": _at(day - timedelta(days=1), 17),
        },
    )
    assert resp.status_code == 201, resp.text


def _create_system(client, *, customer_id: str, gas_type: str, name: str) -> str:
    resp = client.post(
        "/systems",
        json={
            "customer_id": customer_id,
            "name": name,
            "gas_type": gas_type,
            "is_active": True,
            "requires_security_check": False,
            "security_check_exists": False,
            "last_security_check_at": None,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _seed_default_state(client, *, day: date = TODAY) -> dict[str, str]:
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=4, empty48=2)
    _seed_wallet(client, day=day, amount=1000)
    _seed_company_balances(client, day=day, money=200, cyl12=5, cyl48=3)

    customer_a = create_customer(client, name="Customer A")
    customer_b = create_customer(client, name="Customer B")
    return {
        "customer_a": customer_a,
        "customer_b": customer_b,
        "system_a_12": _create_system(client, customer_id=customer_a, gas_type="12kg", name="A 12kg"),
        "system_a_48": _create_system(client, customer_id=customer_a, gas_type="48kg", name="A 48kg"),
        "system_b_12": _create_system(client, customer_id=customer_b, gas_type="12kg", name="B 12kg"),
    }


def _create_order(
    client,
    *,
    customer_id: str,
    happened_at: str,
    order_mode: str,
    gas_type: str,
    cylinders_installed: int,
    cylinders_received: int,
    price_total: int,
    paid_amount: int,
    system_id: str | None = None,
) -> dict:
    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": happened_at,
            "order_mode": order_mode,
            "gas_type": gas_type,
            "cylinders_installed": cylinders_installed,
            "cylinders_received": cylinders_received,
            "price_total": price_total,
            "paid_amount": paid_amount,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _orders(client, *, include_deleted: bool = False, customer_id: str | None = None) -> list[dict]:
    resp = client.get("/orders", params={"include_deleted": include_deleted})
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    if customer_id is not None:
        rows = [row for row in rows if row["customer_id"] == customer_id]
    return rows


def _day_report(client, day: date) -> dict:
    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _customers(client) -> list[dict]:
    resp = client.get("/customers")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _customer_row(client, customer_id: str) -> dict:
    return next(row for row in _customers(client) if row["id"] == customer_id)


def _customer_balances(client, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}/balances")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _company_balances(client) -> dict:
    resp = client.get("/company/balances")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _event_by_source(report: dict, source_id: str) -> dict:
    return next(event for event in report["events"] if event.get("source_id") == source_id)


def _transition(event: dict, *, scope: str, component: str) -> dict | None:
    return next(
        (
            transition
            for transition in event.get("balance_transitions", [])
            if transition["scope"] == scope and transition["component"] == component
        ),
        None,
    )


def _assert_company_unchanged(client) -> None:
    company = _company_balances(client)
    assert company["company_money"] == 200
    assert company["company_cyl_12"] == 5
    assert company["company_cyl_48"] == 3


def _assert_order_reversal_rows(
    *,
    order_id: str,
    expected_cash_total: int = 0,
    expected_customer_money_total: int = 0,
    expected_full12_total: int = 0,
    expected_empty12_total: int = 0,
    expected_full48_total: int = 0,
    expected_empty48_total: int = 0,
    expected_cyl12_total: int = 0,
    expected_cyl48_total: int = 0,
) -> None:
    with Session(app_db.engine) as session:
        txns = session.exec(
            select(CustomerTransaction).where(
                (CustomerTransaction.id == order_id) | (CustomerTransaction.group_id == order_id)
            )
        ).all()
        assert len(txns) >= 2
        originals = [txn for txn in txns if txn.reversal_source_id is None]
        reversals = [txn for txn in txns if txn.reversal_source_id is not None]
        assert originals
        assert reversals
        for original in originals:
            assert original.deleted_at is not None
        for reversal in reversals:
            assert reversal.deleted_at is not None
            assert reversal.reversal_source_id in {original.id for original in originals}

        entries = session.exec(
            select(LedgerEntry).where(
                LedgerEntry.source_type == "customer_txn",
                LedgerEntry.source_id.in_([txn.id for txn in txns]),
            )
        ).all()
        assert sum(entry.amount for entry in entries if entry.account == "cash") == expected_cash_total
        assert sum(entry.amount for entry in entries if entry.account == "cust_money_debts") == expected_customer_money_total
        assert sum(
            entry.amount
            for entry in entries
            if entry.account == "inv" and entry.gas_type == "12kg" and entry.state == "full"
        ) == expected_full12_total
        assert sum(
            entry.amount
            for entry in entries
            if entry.account == "inv" and entry.gas_type == "12kg" and entry.state == "empty"
        ) == expected_empty12_total
        assert sum(
            entry.amount
            for entry in entries
            if entry.account == "inv" and entry.gas_type == "48kg" and entry.state == "full"
        ) == expected_full48_total
        assert sum(
            entry.amount
            for entry in entries
            if entry.account == "inv" and entry.gas_type == "48kg" and entry.state == "empty"
        ) == expected_empty48_total
        assert sum(
            entry.amount
            for entry in entries
            if entry.account == "cust_cylinders_debts" and entry.gas_type == "12kg"
        ) == expected_cyl12_total
        assert sum(
            entry.amount
            for entry in entries
            if entry.account == "cust_cylinders_debts" and entry.gas_type == "48kg"
        ) == expected_cyl48_total


@pytest.mark.parametrize(
    ("gas_type", "system_key", "full_before", "empty_before"),
    [
        ("12kg", "system_a_12", 10, 5),
        ("48kg", "system_a_48", 4, 2),
    ],
)
def test_sell_full_today_and_delete_updates_reports_orders_and_balances(
    client,
    gas_type: str,
    system_key: str,
    full_before: int,
    empty_before: int,
) -> None:
    ids = _seed_default_state(client)

    created = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids[system_key],
        happened_at=_at(TODAY, 9),
        order_mode="sell_iron",
        gas_type=gas_type,
        cylinders_installed=1,
        cylinders_received=0,
        price_total=100,
        paid_amount=70,
    )
    order_id = created["id"]

    listed = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == order_id)
    assert listed["order_mode"] == "sell_iron"
    assert listed["gas_type"] == gas_type
    assert listed["money_balance_before"] == 0
    assert listed["money_balance_after"] == 30
    assert listed["cyl_balance_before"] == {"12kg": 0, "48kg": 0}
    assert listed["cyl_balance_after"] == {"12kg": 0, "48kg": 0}

    report = _day_report(client, TODAY)
    event = _event_by_source(report, order_id)
    assert event["event_type"] == "order"
    assert event["order_mode"] == "sell_iron"
    assert event["wallet_before"] == 1000
    assert event["wallet_after"] == 1070
    assert event["customer_money_before"] == 0
    assert event["customer_money_after"] == 30
    assert event["customer_12kg_before"] == 0
    assert event["customer_12kg_after"] == 0
    assert event["customer_48kg_before"] == 0
    assert event["customer_48kg_after"] == 0
    money_transition = _transition(event, scope="customer", component="money")
    assert money_transition is not None
    assert money_transition["before"] == 0
    assert money_transition["after"] == 30
    assert money_transition["display_name"] == "Customer A"
    assert _transition(event, scope="customer", component="cyl_12") is None
    assert _transition(event, scope="customer", component="cyl_48") is None
    key = "12" if gas_type == "12kg" else "48"
    assert event["inventory_before"][f"full{key}"] == full_before
    assert event["inventory_after"][f"full{key}"] == full_before - 1
    assert event["inventory_before"][f"empty{key}"] == empty_before
    assert event["inventory_after"][f"empty{key}"] == empty_before

    daily = get_daily_row(client, TODAY.isoformat())
    assert daily["sold_12kg"] == (1 if gas_type == "12kg" else 0)
    assert daily["sold_48kg"] == (1 if gas_type == "48kg" else 0)
    assert daily["net_today"] == 70
    assert daily.get("cash_end", daily.get("wallet_end")) == 1070
    assert daily["inventory_end"][f"full{key}"] == full_before - 1
    assert daily["inventory_end"][f"empty{key}"] == empty_before

    balances = _customer_balances(client, ids["customer_a"])
    assert balances["money_balance"] == 30
    assert balances["cylinder_balance_12kg"] == 0
    assert balances["cylinder_balance_48kg"] == 0
    customer_row = _customer_row(client, ids["customer_a"])
    assert customer_row["money_balance"] == 30
    assert customer_row["cylinder_balance_12kg"] == 0
    assert customer_row["cylinder_balance_48kg"] == 0
    _assert_company_unchanged(client)

    delete_resp = client.delete(f"/orders/{order_id}")
    assert delete_resp.status_code == 204, delete_resp.text

    assert not any(row["id"] == order_id for row in _orders(client, customer_id=ids["customer_a"]))
    deleted = next(row for row in _orders(client, include_deleted=True, customer_id=ids["customer_a"]) if row["id"] == order_id)
    assert deleted["is_deleted"] is True
    assert not any(event.get("source_id") == order_id for event in _day_report(client, TODAY)["events"])
    deleted_daily = get_daily_row(client, TODAY.isoformat())
    assert deleted_daily["sold_12kg"] == 0
    assert deleted_daily["sold_48kg"] == 0
    assert deleted_daily["net_today"] == 0
    assert deleted_daily.get("cash_end", deleted_daily.get("wallet_end")) == 1000
    assert deleted_daily["inventory_end"][f"full{key}"] == full_before
    assert deleted_daily["inventory_end"][f"empty{key}"] == empty_before
    restored = _customer_balances(client, ids["customer_a"])
    assert restored["money_balance"] == 0
    assert restored["cylinder_balance_12kg"] == 0
    assert restored["cylinder_balance_48kg"] == 0
    _assert_company_unchanged(client)
    _assert_order_reversal_rows(
        order_id=order_id,
        expected_full12_total=0 if gas_type == "12kg" else 0,
        expected_full48_total=0 if gas_type == "48kg" else 0,
    )


@pytest.mark.parametrize(
    ("gas_type", "empty_before", "seed_cyl12", "seed_cyl48"),
    [
        ("12kg", 5, 3, 0),
        ("48kg", 2, 0, 2),
    ],
)
def test_buy_empty_today_and_delete_updates_reports_orders_and_balances(
    client,
    gas_type: str,
    empty_before: int,
    seed_cyl12: int,
    seed_cyl48: int,
) -> None:
    ids = _seed_default_state(client)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=TODAY, cyl12=seed_cyl12, cyl48=seed_cyl48)

    created = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=None,
        happened_at=_at(TODAY, 9),
        order_mode="buy_iron",
        gas_type=gas_type,
        cylinders_installed=0,
        cylinders_received=1,
        price_total=40,
        paid_amount=30,
    )
    order_id = created["id"]

    listed = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == order_id)
    assert listed["order_mode"] == "buy_iron"
    assert listed["gas_type"] == gas_type
    assert listed["money_balance_before"] == 0
    assert listed["money_balance_after"] == -10
    assert listed["cyl_balance_before"] == listed["cyl_balance_after"] == {"12kg": seed_cyl12, "48kg": seed_cyl48}

    report = _day_report(client, TODAY)
    event = _event_by_source(report, order_id)
    assert event["event_type"] == "order"
    assert event["order_mode"] == "buy_iron"
    assert event["wallet_before"] == 1000
    assert event["wallet_after"] == 970
    assert event["customer_money_before"] == 0
    assert event["customer_money_after"] == -10
    assert event["customer_12kg_before"] == seed_cyl12
    assert event["customer_12kg_after"] == seed_cyl12
    assert event["customer_48kg_before"] == seed_cyl48
    assert event["customer_48kg_after"] == seed_cyl48
    assert _transition(event, scope="customer", component="money")["after"] == -10
    assert _transition(event, scope="customer", component="cyl_12") is None
    assert _transition(event, scope="customer", component="cyl_48") is None
    key = "12" if gas_type == "12kg" else "48"
    full_before = 10 if gas_type == "12kg" else 4
    assert event["inventory_before"][f"full{key}"] == full_before
    assert event["inventory_after"][f"full{key}"] == full_before
    assert event["inventory_before"][f"empty{key}"] == empty_before
    assert event["inventory_after"][f"empty{key}"] == empty_before + 1

    daily = get_daily_row(client, TODAY.isoformat())
    assert daily["sold_12kg"] == 0
    assert daily["sold_48kg"] == 0
    assert daily["net_today"] == -30
    assert daily.get("cash_end", daily.get("wallet_end")) == 970
    assert daily["inventory_end"][f"full{key}"] == full_before
    assert daily["inventory_end"][f"empty{key}"] == empty_before + 1

    balances = _customer_balances(client, ids["customer_a"])
    assert balances["money_balance"] == -10
    assert balances["cylinder_balance_12kg"] == seed_cyl12
    assert balances["cylinder_balance_48kg"] == seed_cyl48
    customer_row = _customer_row(client, ids["customer_a"])
    assert customer_row["money_balance"] == -10
    assert customer_row["cylinder_balance_12kg"] == seed_cyl12
    assert customer_row["cylinder_balance_48kg"] == seed_cyl48
    _assert_company_unchanged(client)

    delete_resp = client.delete(f"/orders/{order_id}")
    assert delete_resp.status_code == 204, delete_resp.text

    assert not any(row["id"] == order_id for row in _orders(client, customer_id=ids["customer_a"]))
    deleted_daily = get_daily_row(client, TODAY.isoformat())
    assert deleted_daily["sold_12kg"] == 0
    assert deleted_daily["sold_48kg"] == 0
    assert deleted_daily["net_today"] == 0
    assert deleted_daily.get("cash_end", deleted_daily.get("wallet_end")) == 1000
    assert deleted_daily["inventory_end"][f"empty{key}"] == empty_before
    restored = _customer_balances(client, ids["customer_a"])
    assert restored["money_balance"] == 0
    assert restored["cylinder_balance_12kg"] == seed_cyl12
    assert restored["cylinder_balance_48kg"] == seed_cyl48
    _assert_company_unchanged(client)
    _assert_order_reversal_rows(order_id=order_id)


def test_same_day_sell_full_insert_replays_wallet_inventory_and_same_customer_money_only(client) -> None:
    ids = _seed_default_state(client)

    order_09 = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        happened_at=_at(TODAY, 9),
        order_mode="sell_iron",
        gas_type="12kg",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=80,
        paid_amount=50,
    )["id"]
    order_10 = _create_order(
        client,
        customer_id=ids["customer_b"],
        system_id=ids["system_b_12"],
        happened_at=_at(TODAY, 10),
        order_mode="sell_iron",
        gas_type="12kg",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=20,
        paid_amount=20,
    )["id"]

    before_report = _day_report(client, TODAY)
    before_09 = _event_by_source(before_report, order_09)
    before_10 = _event_by_source(before_report, order_10)
    assert before_09["wallet_before"] == 1000
    assert before_09["wallet_after"] == 1050
    assert before_10["wallet_before"] == 1050
    assert before_10["customer_money_before"] == 0
    assert before_10["customer_money_after"] == 0

    order_08 = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        happened_at=_at(TODAY, 8),
        order_mode="sell_iron",
        gas_type="12kg",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=40,
        paid_amount=30,
    )["id"]

    report = _day_report(client, TODAY)
    event_08 = _event_by_source(report, order_08)
    event_09 = _event_by_source(report, order_09)
    event_10 = _event_by_source(report, order_10)

    assert event_08["wallet_before"] == 1000
    assert event_08["wallet_after"] == 1030
    assert event_08["inventory_before"]["full12"] == 10
    assert event_08["inventory_after"]["full12"] == 9
    assert event_08["customer_money_before"] == 0
    assert event_08["customer_money_after"] == 10
    assert event_08["customer_12kg_before"] == 0
    assert event_08["customer_12kg_after"] == 0

    assert event_09["wallet_before"] == 1030
    assert event_09["wallet_after"] == 1080
    assert event_09["inventory_before"]["full12"] == 9
    assert event_09["inventory_after"]["full12"] == 8
    assert event_09["customer_money_before"] == 10
    assert event_09["customer_money_after"] == 40
    assert event_09["customer_12kg_before"] == 0
    assert event_09["customer_12kg_after"] == 0

    assert event_10["wallet_before"] == 1080
    assert event_10["wallet_after"] == 1100
    assert event_10["inventory_before"]["full12"] == 8
    assert event_10["inventory_after"]["full12"] == 7
    assert event_10["customer_money_before"] == before_10["customer_money_before"]
    assert event_10["customer_money_after"] == before_10["customer_money_after"]
    assert event_10["customer_12kg_before"] == 0
    assert event_10["customer_12kg_after"] == 0

    snapshot_09 = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == order_09)
    snapshot_10 = next(row for row in _orders(client, customer_id=ids["customer_b"]) if row["id"] == order_10)
    assert snapshot_09["money_balance_before"] == 10
    assert snapshot_09["money_balance_after"] == 40
    assert snapshot_09["cyl_balance_before"] == {"12kg": 0, "48kg": 0}
    assert snapshot_09["cyl_balance_after"] == {"12kg": 0, "48kg": 0}
    assert snapshot_10["money_balance_before"] == 0
    assert snapshot_10["money_balance_after"] == 0

    delete_resp = client.delete(f"/orders/{order_08}")
    assert delete_resp.status_code == 204, delete_resp.text

    restored = _day_report(client, TODAY)
    restored_09 = _event_by_source(restored, order_09)
    restored_10 = _event_by_source(restored, order_10)
    assert restored_09["wallet_before"] == before_09["wallet_before"]
    assert restored_09["wallet_after"] == before_09["wallet_after"]
    assert restored_09["customer_money_before"] == before_09["customer_money_before"]
    assert restored_09["customer_money_after"] == before_09["customer_money_after"]
    assert restored_10["wallet_before"] == before_10["wallet_before"]
    assert restored_10["customer_money_before"] == before_10["customer_money_before"]
    _assert_company_unchanged(client)


def test_same_day_buy_empty_insert_replays_wallet_inventory_and_same_customer_money_only(client) -> None:
    ids = _seed_default_state(client)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=TODAY, cyl12=3)

    order_09 = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=None,
        happened_at=_at(TODAY, 9),
        order_mode="buy_iron",
        gas_type="12kg",
        cylinders_installed=0,
        cylinders_received=1,
        price_total=40,
        paid_amount=30,
    )["id"]
    order_10 = _create_order(
        client,
        customer_id=ids["customer_b"],
        system_id=None,
        happened_at=_at(TODAY, 10),
        order_mode="buy_iron",
        gas_type="12kg",
        cylinders_installed=0,
        cylinders_received=1,
        price_total=30,
        paid_amount=30,
    )["id"]

    before_report = _day_report(client, TODAY)
    before_09 = _event_by_source(before_report, order_09)
    before_10 = _event_by_source(before_report, order_10)
    assert before_09["wallet_before"] == 1000
    assert before_09["wallet_after"] == 970

    order_08 = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=None,
        happened_at=_at(TODAY, 8),
        order_mode="buy_iron",
        gas_type="12kg",
        cylinders_installed=0,
        cylinders_received=1,
        price_total=30,
        paid_amount=20,
    )["id"]

    report = _day_report(client, TODAY)
    event_08 = _event_by_source(report, order_08)
    event_09 = _event_by_source(report, order_09)
    event_10 = _event_by_source(report, order_10)

    assert event_08["wallet_before"] == 1000
    assert event_08["wallet_after"] == 980
    assert event_08["inventory_before"]["empty12"] == 5
    assert event_08["inventory_after"]["empty12"] == 6
    assert event_08["customer_money_before"] == 0
    assert event_08["customer_money_after"] == -10
    assert event_08["customer_12kg_before"] == 3
    assert event_08["customer_12kg_after"] == 3

    assert event_09["wallet_before"] == 980
    assert event_09["wallet_after"] == 950
    assert event_09["inventory_before"]["empty12"] == 6
    assert event_09["inventory_after"]["empty12"] == 7
    assert event_09["customer_money_before"] == -10
    assert event_09["customer_money_after"] == -20
    assert event_09["customer_12kg_before"] == 3
    assert event_09["customer_12kg_after"] == 3

    assert event_10["wallet_before"] == 950
    assert event_10["wallet_after"] == 920
    assert event_10["inventory_before"]["empty12"] == 7
    assert event_10["inventory_after"]["empty12"] == 8
    assert event_10["customer_money_before"] == before_10["customer_money_before"]
    assert event_10["customer_money_after"] == before_10["customer_money_after"]
    assert event_10["customer_12kg_before"] == 0
    assert event_10["customer_12kg_after"] == 0

    snapshot_09 = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == order_09)
    snapshot_10 = next(row for row in _orders(client, customer_id=ids["customer_b"]) if row["id"] == order_10)
    assert snapshot_09["money_balance_before"] == -10
    assert snapshot_09["money_balance_after"] == -20
    assert snapshot_09["cyl_balance_before"] == {"12kg": 3, "48kg": 0}
    assert snapshot_09["cyl_balance_after"] == {"12kg": 3, "48kg": 0}
    assert snapshot_10["money_balance_before"] == 0
    assert snapshot_10["money_balance_after"] == 0

    delete_resp = client.delete(f"/orders/{order_08}")
    assert delete_resp.status_code == 204, delete_resp.text

    restored = _day_report(client, TODAY)
    restored_09 = _event_by_source(restored, order_09)
    restored_10 = _event_by_source(restored, order_10)
    assert restored_09["wallet_before"] == before_09["wallet_before"]
    assert restored_09["wallet_after"] == before_09["wallet_after"]
    assert restored_09["customer_money_before"] == before_09["customer_money_before"]
    assert restored_09["customer_money_after"] == before_09["customer_money_after"]
    assert restored_10["wallet_before"] == before_10["wallet_before"]
    assert restored_10["customer_money_before"] == before_10["customer_money_before"]
    _assert_company_unchanged(client)


def test_backdated_sell_full_insert_and_delete_shift_later_days_and_same_customer_only(client) -> None:
    ids = _seed_default_state(client, day=DAY)

    later_same = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        happened_at=_at(DAY_PLUS_1, 9),
        order_mode="sell_iron",
        gas_type="12kg",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=10,
        paid_amount=10,
    )["id"]
    later_other = _create_order(
        client,
        customer_id=ids["customer_b"],
        system_id=ids["system_b_12"],
        happened_at=_at(DAY_PLUS_2, 9),
        order_mode="sell_iron",
        gas_type="12kg",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=5,
        paid_amount=5,
    )["id"]

    day1_before = get_daily_row(client, DAY_PLUS_1.isoformat())
    day2_before = get_daily_row(client, DAY_PLUS_2.isoformat())
    same_before = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == later_same)
    other_before = next(row for row in _orders(client, customer_id=ids["customer_b"]) if row["id"] == later_other)
    day2_report_before = _event_by_source(_day_report(client, DAY_PLUS_2), later_other)

    backdated = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        happened_at=_at(DAY, 10),
        order_mode="sell_iron",
        gas_type="12kg",
        cylinders_installed=1,
        cylinders_received=0,
        price_total=100,
        paid_amount=70,
    )["id"]

    day0 = _day_report(client, DAY)
    event0 = _event_by_source(day0, backdated)
    assert event0["wallet_before"] == 1000
    assert event0["wallet_after"] == 1070
    assert event0["inventory_before"]["full12"] == 10
    assert event0["inventory_after"]["full12"] == 9
    assert event0["customer_money_after"] == 30
    assert event0["customer_12kg_after"] == 0
    assert get_daily_row(client, DAY.isoformat())["net_today"] == 70

    day1_after = get_daily_row(client, DAY_PLUS_1.isoformat())
    day2_after = get_daily_row(client, DAY_PLUS_2.isoformat())
    assert day1_after.get("cash_end", day1_after.get("wallet_end")) == day1_before.get("cash_end", day1_before.get("wallet_end")) + 70
    assert day2_after.get("cash_end", day2_after.get("wallet_end")) == day2_before.get("cash_end", day2_before.get("wallet_end")) + 70
    assert day1_after["net_today"] == day1_before["net_today"]
    assert day2_after["net_today"] == day2_before["net_today"]
    assert day1_after["inventory_end"]["full12"] == day1_before["inventory_end"]["full12"] - 1
    assert day2_after["inventory_end"]["full12"] == day2_before["inventory_end"]["full12"] - 1

    same_after = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == later_same)
    other_after = next(row for row in _orders(client, customer_id=ids["customer_b"]) if row["id"] == later_other)
    day2_report_after = _event_by_source(_day_report(client, DAY_PLUS_2), later_other)
    assert same_after["money_balance_before"] == 30
    assert same_after["money_balance_after"] == 30
    assert same_after["cyl_balance_before"] == {"12kg": 0, "48kg": 0}
    assert same_after["cyl_balance_after"] == {"12kg": 0, "48kg": 0}
    assert other_after["money_balance_before"] == other_before["money_balance_before"]
    assert other_after["money_balance_after"] == other_before["money_balance_after"]
    assert day2_report_after["wallet_before"] == day2_report_before["wallet_before"] + 70
    assert day2_report_after["inventory_before"]["full12"] == day2_report_before["inventory_before"]["full12"] - 1
    _assert_company_unchanged(client)

    delete_resp = client.delete(f"/orders/{backdated}")
    assert delete_resp.status_code == 204, delete_resp.text

    restored_day1 = get_daily_row(client, DAY_PLUS_1.isoformat())
    restored_day2 = get_daily_row(client, DAY_PLUS_2.isoformat())
    assert restored_day1.get("cash_end", restored_day1.get("wallet_end")) == day1_before.get("cash_end", day1_before.get("wallet_end"))
    assert restored_day2.get("cash_end", restored_day2.get("wallet_end")) == day2_before.get("cash_end", day2_before.get("wallet_end"))
    assert next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == later_same)["money_balance_before"] == same_before["money_balance_before"]
    assert next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == later_same)["money_balance_after"] == same_before["money_balance_after"]
    _assert_company_unchanged(client)


def test_backdated_buy_empty_insert_and_delete_shift_later_days_and_same_customer_only(client) -> None:
    ids = _seed_default_state(client, day=DAY)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=DAY, cyl12=3)

    later_same = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=None,
        happened_at=_at(DAY_PLUS_1, 9),
        order_mode="buy_iron",
        gas_type="12kg",
        cylinders_installed=0,
        cylinders_received=1,
        price_total=10,
        paid_amount=10,
    )["id"]
    later_other = _create_order(
        client,
        customer_id=ids["customer_b"],
        system_id=None,
        happened_at=_at(DAY_PLUS_2, 9),
        order_mode="buy_iron",
        gas_type="12kg",
        cylinders_installed=0,
        cylinders_received=1,
        price_total=5,
        paid_amount=5,
    )["id"]

    day1_before = get_daily_row(client, DAY_PLUS_1.isoformat())
    day2_before = get_daily_row(client, DAY_PLUS_2.isoformat())
    same_before = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == later_same)
    other_before = next(row for row in _orders(client, customer_id=ids["customer_b"]) if row["id"] == later_other)

    backdated = _create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=None,
        happened_at=_at(DAY, 10),
        order_mode="buy_iron",
        gas_type="12kg",
        cylinders_installed=0,
        cylinders_received=1,
        price_total=40,
        paid_amount=30,
    )["id"]

    day0 = _day_report(client, DAY)
    event0 = _event_by_source(day0, backdated)
    assert event0["wallet_before"] == 1000
    assert event0["wallet_after"] == 970
    assert event0["inventory_before"]["empty12"] == 5
    assert event0["inventory_after"]["empty12"] == 6
    assert event0["customer_money_after"] == -10
    assert event0["customer_12kg_before"] == 3
    assert event0["customer_12kg_after"] == 3
    assert get_daily_row(client, DAY.isoformat())["net_today"] == -30

    day1_after = get_daily_row(client, DAY_PLUS_1.isoformat())
    day2_after = get_daily_row(client, DAY_PLUS_2.isoformat())
    assert day1_after.get("cash_end", day1_after.get("wallet_end")) == day1_before.get("cash_end", day1_before.get("wallet_end")) - 30
    assert day2_after.get("cash_end", day2_after.get("wallet_end")) == day2_before.get("cash_end", day2_before.get("wallet_end")) - 30
    assert day1_after["net_today"] == day1_before["net_today"]
    assert day2_after["net_today"] == day2_before["net_today"]
    assert day1_after["inventory_end"]["empty12"] == day1_before["inventory_end"]["empty12"] + 1
    assert day2_after["inventory_end"]["empty12"] == day2_before["inventory_end"]["empty12"] + 1

    same_after = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == later_same)
    other_after = next(row for row in _orders(client, customer_id=ids["customer_b"]) if row["id"] == later_other)
    assert same_after["money_balance_before"] == -10
    assert same_after["money_balance_after"] == -10
    assert same_after["cyl_balance_before"] == {"12kg": 3, "48kg": 0}
    assert same_after["cyl_balance_after"] == {"12kg": 3, "48kg": 0}
    assert other_after["money_balance_before"] == other_before["money_balance_before"]
    assert other_after["money_balance_after"] == other_before["money_balance_after"]
    _assert_company_unchanged(client)

    delete_resp = client.delete(f"/orders/{backdated}")
    assert delete_resp.status_code == 204, delete_resp.text

    restored_day1 = get_daily_row(client, DAY_PLUS_1.isoformat())
    restored_day2 = get_daily_row(client, DAY_PLUS_2.isoformat())
    assert restored_day1.get("cash_end", restored_day1.get("wallet_end")) == day1_before.get("cash_end", day1_before.get("wallet_end"))
    assert restored_day2.get("cash_end", restored_day2.get("wallet_end")) == day2_before.get("cash_end", day2_before.get("wallet_end"))
    restored_same = next(row for row in _orders(client, customer_id=ids["customer_a"]) if row["id"] == later_same)
    assert restored_same["money_balance_before"] == same_before["money_balance_before"]
    assert restored_same["money_balance_after"] == same_before["money_balance_after"]
    _assert_company_unchanged(client)
