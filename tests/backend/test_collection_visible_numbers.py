from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlmodel import Session, select

from app import db as app_db
from app.models import CustomerTransaction, LedgerEntry
from tests.backend.conftest import create_customer, get_daily_row, init_inventory


TODAY = date(2026, 5, 14)
YESTERDAY = TODAY - timedelta(days=1)


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


def _seed_default_state(client, *, day: date = TODAY) -> dict[str, str]:
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=4, empty48=2)
    _seed_wallet(client, day=day, amount=1000)
    _seed_company_balances(client, day=day, money=200, cyl12=5, cyl48=3)
    return {
        "customer_a": create_customer(client, name="Customer A"),
        "customer_b": create_customer(client, name="Customer B"),
    }


def _create_collection(
    client,
    *,
    customer_id: str,
    happened_at: str,
    action_type: str,
    amount_money: int = 0,
    qty_12kg: int = 0,
    qty_48kg: int = 0,
) -> dict:
    resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "happened_at": happened_at,
            "action_type": action_type,
            "amount_money": amount_money,
            "qty_12kg": qty_12kg,
            "qty_48kg": qty_48kg,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _collections(client, *, include_deleted: bool = False) -> list[dict]:
    resp = client.get("/collections", params={"include_deleted": include_deleted})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _day_report(client, day: date) -> dict:
    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _customer_balances(client, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}/balances")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _customers(client) -> list[dict]:
    resp = client.get("/customers")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _company_balances(client) -> dict:
    resp = client.get("/company/balances")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _customer_row(client, customer_id: str) -> dict:
    return next(row for row in _customers(client) if row["id"] == customer_id)


def _transition(event: dict, *, scope: str, component: str) -> dict | None:
    return next(
        (
            transition
            for transition in event.get("balance_transitions", [])
            if transition["scope"] == scope and transition["component"] == component
        ),
        None,
    )


def _inventory_hidden(snapshot: dict | None) -> bool:
    if snapshot is None:
        return True
    return all(value is None for value in snapshot.values())


def _event(
    report: dict,
    *,
    event_type: str,
    customer_id: str | None = None,
    effective_at: str | None = None,
    gas_type: str | None = None,
) -> dict:
    for item in report["events"]:
        if item.get("event_type") != event_type:
            continue
        if customer_id is not None and item.get("customer_id") != customer_id:
            continue
        if effective_at is not None:
            item_effective_at = str(item.get("effective_at") or "")
            if not item_effective_at.startswith(effective_at):
                continue
        if gas_type is not None and item.get("gas_type") != gas_type:
            continue
        return item
    raise AssertionError(f"event not found: {event_type=} {customer_id=} {effective_at=} {gas_type=}")


def _assert_company_balances_unchanged(client) -> None:
    company = _company_balances(client)
    assert company["company_money"] == 200
    assert company["company_cyl_12"] == 5
    assert company["company_cyl_48"] == 3


def _assert_collection_reversal_rows(
    *,
    collection_id: str,
    expected_cash_total: int,
    expected_customer_money_total: int = 0,
    expected_inv_12_total: int = 0,
    expected_inv_48_total: int = 0,
    expected_cyl_12_total: int = 0,
    expected_cyl_48_total: int = 0,
) -> None:
    with Session(app_db.engine) as session:
        txns = session.exec(
            select(CustomerTransaction).where(
                (CustomerTransaction.id == collection_id) | (CustomerTransaction.group_id == collection_id)
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
        cash_total = sum(entry.amount for entry in entries if entry.account == "cash")
        customer_money_total = sum(entry.amount for entry in entries if entry.account == "cust_money_debts")
        inv_12_total = sum(
            entry.amount
            for entry in entries
            if entry.account == "inv" and entry.gas_type == "12kg" and entry.state == "empty"
        )
        inv_48_total = sum(
            entry.amount
            for entry in entries
            if entry.account == "inv" and entry.gas_type == "48kg" and entry.state == "empty"
        )
        cyl_12_total = sum(
            entry.amount for entry in entries if entry.account == "cust_cylinders_debts" and entry.gas_type == "12kg"
        )
        cyl_48_total = sum(
            entry.amount for entry in entries if entry.account == "cust_cylinders_debts" and entry.gas_type == "48kg"
        )

        assert cash_total == expected_cash_total
        assert customer_money_total == expected_customer_money_total
        assert inv_12_total == expected_inv_12_total
        assert inv_48_total == expected_inv_48_total
        assert cyl_12_total == expected_cyl_12_total
        assert cyl_48_total == expected_cyl_48_total


def test_payment_today_and_delete_updates_collection_report_and_balances(client) -> None:
    ids = _seed_default_state(client)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=TODAY, money=100)

    payment = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 9),
        action_type="payment",
        amount_money=70,
    )

    listed = next(item for item in _collections(client) if item["id"] == payment["id"])
    assert listed["action_type"] == "payment"
    assert listed["amount_money"] == 70
    assert listed["live_debt_cash"] == 30
    assert listed["live_debt_cylinders_12"] == 0
    assert listed["live_debt_cylinders_48"] == 0

    report = _day_report(client, TODAY)
    event = _event(report, event_type="payment_from_customer", customer_id=ids["customer_a"])
    assert event["wallet_before"] == 1000
    assert event["wallet_after"] == 1070
    assert _inventory_hidden(event["inventory_before"])
    assert _inventory_hidden(event["inventory_after"])
    assert event["customer_money_before"] == 100
    assert event["customer_money_after"] == 30
    assert event["customer_12kg_before"] == 0
    assert event["customer_12kg_after"] == 0
    assert _transition(event, scope="customer", component="money")["before"] == 100
    assert _transition(event, scope="customer", component="money")["after"] == 30

    row = get_daily_row(client, TODAY.isoformat())
    assert row["sold_12kg"] == 0
    assert row["sold_48kg"] == 0
    assert row["net_today"] == 70
    assert row.get("cash_end", row.get("wallet_end")) == 1070

    assert _customer_balances(client, ids["customer_a"])["money_balance"] == 30
    assert _customer_row(client, ids["customer_a"])["money_balance"] == 30
    _assert_company_balances_unchanged(client)

    delete_resp = client.delete(f"/collections/{payment['id']}")
    assert delete_resp.status_code == 204, delete_resp.text

    assert not any(item["id"] == payment["id"] for item in _collections(client))
    report_after_delete = _day_report(client, TODAY)
    assert not any(item.get("customer_id") == ids["customer_a"] for item in report_after_delete["events"])
    row_after_delete = get_daily_row(client, TODAY.isoformat())
    assert row_after_delete["net_today"] == 0
    assert row_after_delete.get("cash_end", row_after_delete.get("wallet_end")) == 1000
    assert _customer_balances(client, ids["customer_a"])["money_balance"] == 100
    _assert_company_balances_unchanged(client)
    _assert_collection_reversal_rows(
        collection_id=payment["id"],
        expected_cash_total=0,
        expected_customer_money_total=0,
    )


def test_payout_today_and_delete_updates_collection_report_and_balances(client) -> None:
    ids = _seed_default_state(client)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=TODAY, money=-100)

    payout = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 9),
        action_type="payout",
        amount_money=40,
    )

    listed = next(item for item in _collections(client) if item["id"] == payout["id"])
    assert listed["action_type"] == "payout"
    assert listed["amount_money"] == 40
    assert listed["live_debt_cash"] == -60

    report = _day_report(client, TODAY)
    event = _event(report, event_type="payment_to_customer", customer_id=ids["customer_a"])
    assert event["wallet_before"] == 1000
    assert event["wallet_after"] == 960
    assert _inventory_hidden(event["inventory_before"])
    assert _inventory_hidden(event["inventory_after"])
    assert event["customer_money_before"] == -100
    assert event["customer_money_after"] == -60
    assert _transition(event, scope="customer", component="money")["before"] == -100
    assert _transition(event, scope="customer", component="money")["after"] == -60

    row = get_daily_row(client, TODAY.isoformat())
    assert row["sold_12kg"] == 0
    assert row["sold_48kg"] == 0
    assert row["net_today"] == -40
    assert row.get("cash_end", row.get("wallet_end")) == 960

    assert _customer_balances(client, ids["customer_a"])["money_balance"] == -60
    assert _customer_row(client, ids["customer_a"])["money_balance"] == -60
    _assert_company_balances_unchanged(client)

    delete_resp = client.delete(f"/collections/{payout['id']}")
    assert delete_resp.status_code == 204, delete_resp.text

    assert not any(item["id"] == payout["id"] for item in _collections(client))
    row_after_delete = get_daily_row(client, TODAY.isoformat())
    assert row_after_delete["net_today"] == 0
    assert row_after_delete.get("cash_end", row_after_delete.get("wallet_end")) == 1000
    assert _customer_balances(client, ids["customer_a"])["money_balance"] == -100
    _assert_company_balances_unchanged(client)
    _assert_collection_reversal_rows(
        collection_id=payout["id"],
        expected_cash_total=0,
        expected_customer_money_total=0,
    )


@pytest.mark.parametrize(
    ("gas_type", "qty", "starting_debt", "starting_empty"),
    [
        ("12kg", 2, 3, 5),
        ("48kg", 1, 2, 2),
    ],
)
def test_return_single_gas_today_and_delete_updates_only_that_inventory(
    client,
    gas_type: str,
    qty: int,
    starting_debt: int,
    starting_empty: int,
) -> None:
    ids = _seed_default_state(client)
    _seed_customer_balances(
        client,
        customer_id=ids["customer_a"],
        day=TODAY,
        cyl12=starting_debt if gas_type == "12kg" else 0,
        cyl48=starting_debt if gas_type == "48kg" else 0,
    )

    returned = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 9),
        action_type="return",
        qty_12kg=qty if gas_type == "12kg" else 0,
        qty_48kg=qty if gas_type == "48kg" else 0,
    )

    listed = next(item for item in _collections(client) if item["id"] == returned["id"])
    if gas_type == "12kg":
        assert listed["live_debt_cylinders_12"] == starting_debt - qty
        assert listed["live_debt_cylinders_48"] == 0
    else:
        assert listed["live_debt_cylinders_12"] == 0
        assert listed["live_debt_cylinders_48"] == starting_debt - qty

    report = _day_report(client, TODAY)
    event = _event(report, event_type="customer_return_empties", customer_id=ids["customer_a"], gas_type=gas_type)
    assert event["wallet_before"] == 1000
    assert event["wallet_after"] == 1000
    assert event["inventory_before"][f"empty{12 if gas_type == '12kg' else 48}"] == starting_empty
    assert event["inventory_after"][f"empty{12 if gas_type == '12kg' else 48}"] == starting_empty + qty
    if gas_type == "12kg":
        assert event["customer_12kg_before"] == starting_debt
        assert event["customer_12kg_after"] == starting_debt - qty
        assert event["customer_48kg_before"] == 0
        assert event["customer_48kg_after"] == 0
        assert _transition(event, scope="customer", component="cyl_12")["after"] == starting_debt - qty
        assert _transition(event, scope="customer", component="cyl_48") is None
    else:
        assert event["customer_48kg_before"] == starting_debt
        assert event["customer_48kg_after"] == starting_debt - qty
        assert event["customer_12kg_before"] == 0
        assert event["customer_12kg_after"] == 0
        assert _transition(event, scope="customer", component="cyl_48")["after"] == starting_debt - qty
        assert _transition(event, scope="customer", component="cyl_12") is None

    row = get_daily_row(client, TODAY.isoformat())
    assert row["sold_12kg"] == 0
    assert row["sold_48kg"] == 0
    assert row["net_today"] == 0
    assert row.get("cash_end", row.get("wallet_end")) == 1000

    company = _company_balances(client)
    _assert_company_balances_unchanged(client)
    if gas_type == "12kg":
        assert company["inventory_empty_12"] == 5 + qty
        assert company["inventory_empty_48"] == 2
    else:
        assert company["inventory_empty_12"] == 5
        assert company["inventory_empty_48"] == 2 + qty

    delete_resp = client.delete(f"/collections/{returned['id']}")
    assert delete_resp.status_code == 204, delete_resp.text

    row_after_delete = get_daily_row(client, TODAY.isoformat())
    assert row_after_delete["net_today"] == 0
    assert row_after_delete.get("cash_end", row_after_delete.get("wallet_end")) == 1000
    _assert_company_balances_unchanged(client)
    _assert_collection_reversal_rows(
        collection_id=returned["id"],
        expected_cash_total=0,
        expected_inv_12_total=0,
        expected_inv_48_total=0,
        expected_cyl_12_total=0,
        expected_cyl_48_total=0,
    )


def test_return_mixed_today_and_delete_groups_collections_but_splits_daily_report(client) -> None:
    ids = _seed_default_state(client)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=TODAY, cyl12=3, cyl48=2)

    returned = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 9),
        action_type="return",
        qty_12kg=2,
        qty_48kg=1,
    )

    listed = next(item for item in _collections(client) if item["id"] == returned["id"])
    assert listed["qty_12kg"] == 2
    assert listed["qty_48kg"] == 1
    assert listed["live_debt_cylinders_12"] == 1
    assert listed["live_debt_cylinders_48"] == 1

    report = _day_report(client, TODAY)
    event_12 = _event(report, event_type="customer_return_empties", customer_id=ids["customer_a"], gas_type="12kg")
    event_48 = _event(report, event_type="customer_return_empties", customer_id=ids["customer_a"], gas_type="48kg")

    assert event_12["wallet_before"] == 1000
    assert event_12["wallet_after"] == 1000
    assert event_12["inventory_before"]["empty12"] == 5
    assert event_12["inventory_after"]["empty12"] == 7
    assert event_12["customer_12kg_before"] == 3
    assert event_12["customer_12kg_after"] == 1

    assert event_48["wallet_before"] == 1000
    assert event_48["wallet_after"] == 1000
    assert event_48["inventory_before"]["empty48"] == 2
    assert event_48["inventory_after"]["empty48"] == 3
    assert event_48["customer_48kg_before"] == 2
    assert event_48["customer_48kg_after"] == 1

    row = get_daily_row(client, TODAY.isoformat())
    assert row["sold_12kg"] == 0
    assert row["sold_48kg"] == 0
    assert row["net_today"] == 0
    assert row.get("cash_end", row.get("wallet_end")) == 1000

    company = _company_balances(client)
    _assert_company_balances_unchanged(client)
    assert company["inventory_empty_12"] == 7
    assert company["inventory_empty_48"] == 3

    delete_resp = client.delete(f"/collections/{returned['id']}")
    assert delete_resp.status_code == 204, delete_resp.text

    assert not any(item["id"] == returned["id"] for item in _collections(client))
    report_after_delete = _day_report(client, TODAY)
    assert not any(item.get("customer_id") == ids["customer_a"] for item in report_after_delete["events"])
    _assert_collection_reversal_rows(
        collection_id=returned["id"],
        expected_cash_total=0,
        expected_inv_12_total=0,
        expected_inv_48_total=0,
        expected_cyl_12_total=0,
        expected_cyl_48_total=0,
    )


def test_same_day_payment_insert_replays_reports_in_business_time_order(client) -> None:
    ids = _seed_default_state(client)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=TODAY, money=100)

    later_payment = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 9),
        action_type="payment",
        amount_money=30,
    )

    before_report = _day_report(client, TODAY)
    before_later_event = next(
        item
        for item in before_report["events"]
        if item.get("event_type") == "payment_from_customer"
        and item.get("customer_id") == ids["customer_a"]
        and (item.get("source_id") == later_payment["id"] or item.get("id") == later_payment["id"])
    )
    assert before_later_event["wallet_before"] == 1000
    assert before_later_event["wallet_after"] == 1030

    earlier_payment = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 8),
        action_type="payment",
        amount_money=50,
    )

    after_report = _day_report(client, TODAY)
    earlier_event = next(
        item
        for item in after_report["events"]
        if item.get("event_type") == "payment_from_customer"
        and item.get("customer_id") == ids["customer_a"]
        and (item.get("source_id") == earlier_payment["id"] or item.get("id") == earlier_payment["id"])
    )
    later_event = next(
        item
        for item in after_report["events"]
        if item.get("event_type") == "payment_from_customer"
        and item.get("customer_id") == ids["customer_a"]
        and (item.get("source_id") == later_payment["id"] or item.get("id") == later_payment["id"])
    )

    assert earlier_event["wallet_before"] == 1000
    assert earlier_event["wallet_after"] == 1050
    assert later_event["wallet_before"] == 1050
    assert later_event["wallet_after"] == 1080

    delete_earlier = client.delete(f"/collections/{earlier_payment['id']}")
    assert delete_earlier.status_code == 204, delete_earlier.text
    delete_later = client.delete(f"/collections/{later_payment['id']}")
    assert delete_later.status_code == 204, delete_later.text


def test_backdated_payment_insert_and_delete_shift_later_wallet_and_same_customer_only(client) -> None:
    ids = _seed_default_state(client, day=YESTERDAY)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=YESTERDAY, money=100)
    _seed_customer_balances(client, customer_id=ids["customer_b"], day=YESTERDAY, money=100)

    later_a = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 9),
        action_type="payment",
        amount_money=20,
    )
    later_b = _create_collection(
        client,
        customer_id=ids["customer_b"],
        happened_at=_at(TODAY, 10),
        action_type="payment",
        amount_money=10,
    )

    before_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    before_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    before_report = _day_report(client, TODAY)
    before_a_event = _event(before_report, event_type="payment_from_customer", customer_id=ids["customer_a"])
    before_b_event = _event(before_report, event_type="payment_from_customer", customer_id=ids["customer_b"])

    backdated = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(YESTERDAY, 8),
        action_type="payment",
        amount_money=70,
    )

    yesterday_row = get_daily_row(client, YESTERDAY.isoformat())
    assert yesterday_row["net_today"] == 70
    assert yesterday_row.get("cash_end", yesterday_row.get("wallet_end")) == 1070

    after_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    after_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    assert before_a_collection["live_debt_cash"] == 80
    assert after_a_collection["live_debt_cash"] == 10
    assert before_b_collection["live_debt_cash"] == 90
    assert after_b_collection["live_debt_cash"] == 90

    after_report = _day_report(client, TODAY)
    after_a_event = _event(after_report, event_type="payment_from_customer", customer_id=ids["customer_a"])
    after_b_event = _event(after_report, event_type="payment_from_customer", customer_id=ids["customer_b"])
    assert after_a_event["wallet_before"] == before_a_event["wallet_before"] + 70
    assert after_a_event["wallet_after"] == before_a_event["wallet_after"] + 70
    assert after_a_event["customer_money_before"] == before_a_event["customer_money_before"] - 70
    assert after_a_event["customer_money_after"] == before_a_event["customer_money_after"] - 70
    assert after_b_event["wallet_before"] == before_b_event["wallet_before"] + 70
    assert after_b_event["wallet_after"] == before_b_event["wallet_after"] + 70
    assert after_b_event["customer_money_before"] == before_b_event["customer_money_before"]
    assert after_b_event["customer_money_after"] == before_b_event["customer_money_after"]

    today_row = get_daily_row(client, TODAY.isoformat())
    assert today_row["net_today"] == 30
    assert today_row.get("cash_end", today_row.get("wallet_end")) == 1100
    _assert_company_balances_unchanged(client)

    delete_resp = client.delete(f"/collections/{backdated['id']}")
    assert delete_resp.status_code == 204, delete_resp.text

    restored_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    restored_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    assert restored_a_collection["live_debt_cash"] == before_a_collection["live_debt_cash"]
    assert restored_b_collection["live_debt_cash"] == before_b_collection["live_debt_cash"]
    restored_report = _day_report(client, TODAY)
    restored_a_event = _event(restored_report, event_type="payment_from_customer", customer_id=ids["customer_a"])
    assert restored_a_event["wallet_before"] == before_a_event["wallet_before"]
    assert restored_a_event["customer_money_after"] == before_a_event["customer_money_after"]
    _assert_collection_reversal_rows(
        collection_id=backdated["id"],
        expected_cash_total=0,
        expected_customer_money_total=0,
    )


def test_backdated_payment_shifts_wallet_end_across_multiple_later_days(client) -> None:
    day = TODAY - timedelta(days=2)
    day_plus_1 = TODAY - timedelta(days=1)
    day_plus_2 = TODAY

    ids = _seed_default_state(client, day=day)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=day, money=100)

    _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(day_plus_1, 9),
        action_type="payment",
        amount_money=10,
    )
    _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(day_plus_2, 9),
        action_type="payment",
        amount_money=5,
    )

    before_day_plus_1 = get_daily_row(client, day_plus_1.isoformat())
    before_day_plus_2 = get_daily_row(client, day_plus_2.isoformat())

    _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(day, 8),
        action_type="payment",
        amount_money=70,
    )

    after_day_plus_1 = get_daily_row(client, day_plus_1.isoformat())
    after_day_plus_2 = get_daily_row(client, day_plus_2.isoformat())

    assert after_day_plus_1.get("cash_end", after_day_plus_1.get("wallet_end")) == before_day_plus_1.get(
        "cash_end", before_day_plus_1.get("wallet_end")
    ) + 70
    assert after_day_plus_2.get("cash_end", after_day_plus_2.get("wallet_end")) == before_day_plus_2.get(
        "cash_end", before_day_plus_2.get("wallet_end")
    ) + 70
    assert after_day_plus_1["net_today"] == before_day_plus_1["net_today"] == 10
    assert after_day_plus_2["net_today"] == before_day_plus_2["net_today"] == 5


def test_backdated_payout_insert_and_delete_shift_later_wallet_and_same_customer_only(client) -> None:
    ids = _seed_default_state(client, day=YESTERDAY)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=YESTERDAY, money=-100)
    _seed_customer_balances(client, customer_id=ids["customer_b"], day=YESTERDAY, money=-100)

    later_a = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 9),
        action_type="payout",
        amount_money=20,
    )
    later_b = _create_collection(
        client,
        customer_id=ids["customer_b"],
        happened_at=_at(TODAY, 10),
        action_type="payout",
        amount_money=10,
    )

    before_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    before_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    before_report = _day_report(client, TODAY)
    before_a_event = _event(before_report, event_type="payment_to_customer", customer_id=ids["customer_a"])
    before_b_event = _event(before_report, event_type="payment_to_customer", customer_id=ids["customer_b"])

    backdated = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(YESTERDAY, 8),
        action_type="payout",
        amount_money=40,
    )

    yesterday_row = get_daily_row(client, YESTERDAY.isoformat())
    assert yesterday_row["net_today"] == -40
    assert yesterday_row.get("cash_end", yesterday_row.get("wallet_end")) == 960

    after_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    after_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    assert before_a_collection["live_debt_cash"] == -80
    assert after_a_collection["live_debt_cash"] == -40
    assert before_b_collection["live_debt_cash"] == -90
    assert after_b_collection["live_debt_cash"] == -90

    after_report = _day_report(client, TODAY)
    after_a_event = _event(after_report, event_type="payment_to_customer", customer_id=ids["customer_a"])
    after_b_event = _event(after_report, event_type="payment_to_customer", customer_id=ids["customer_b"])
    assert after_a_event["wallet_before"] == before_a_event["wallet_before"] - 40
    assert after_a_event["wallet_after"] == before_a_event["wallet_after"] - 40
    assert after_a_event["customer_money_before"] == before_a_event["customer_money_before"] + 40
    assert after_a_event["customer_money_after"] == before_a_event["customer_money_after"] + 40
    assert after_b_event["wallet_before"] == before_b_event["wallet_before"] - 40
    assert after_b_event["wallet_after"] == before_b_event["wallet_after"] - 40
    assert after_b_event["customer_money_before"] == before_b_event["customer_money_before"]
    assert after_b_event["customer_money_after"] == before_b_event["customer_money_after"]

    today_row = get_daily_row(client, TODAY.isoformat())
    assert today_row["net_today"] == -30
    assert today_row.get("cash_end", today_row.get("wallet_end")) == 930
    _assert_company_balances_unchanged(client)

    delete_resp = client.delete(f"/collections/{backdated['id']}")
    assert delete_resp.status_code == 204, delete_resp.text

    restored_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    restored_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    assert restored_a_collection["live_debt_cash"] == before_a_collection["live_debt_cash"]
    assert restored_b_collection["live_debt_cash"] == before_b_collection["live_debt_cash"]
    restored_report = _day_report(client, TODAY)
    restored_a_event = _event(restored_report, event_type="payment_to_customer", customer_id=ids["customer_a"])
    assert restored_a_event["wallet_before"] == before_a_event["wallet_before"]
    assert restored_a_event["customer_money_after"] == before_a_event["customer_money_after"]
    _assert_collection_reversal_rows(
        collection_id=backdated["id"],
        expected_cash_total=0,
        expected_customer_money_total=0,
    )


def test_backdated_return_insert_and_delete_shift_later_inventory_and_same_customer_only(client) -> None:
    ids = _seed_default_state(client, day=YESTERDAY)
    _seed_customer_balances(client, customer_id=ids["customer_a"], day=YESTERDAY, cyl12=3, cyl48=2)
    _seed_customer_balances(client, customer_id=ids["customer_b"], day=YESTERDAY, cyl12=2)

    later_a = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(TODAY, 9),
        action_type="return",
        qty_12kg=1,
    )
    later_b = _create_collection(
        client,
        customer_id=ids["customer_b"],
        happened_at=_at(TODAY, 10),
        action_type="return",
        qty_12kg=1,
    )

    before_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    before_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    before_report = _day_report(client, TODAY)
    before_a_event = _event(before_report, event_type="customer_return_empties", customer_id=ids["customer_a"], gas_type="12kg")
    before_b_event = _event(before_report, event_type="customer_return_empties", customer_id=ids["customer_b"], gas_type="12kg")

    backdated = _create_collection(
        client,
        customer_id=ids["customer_a"],
        happened_at=_at(YESTERDAY, 8),
        action_type="return",
        qty_12kg=2,
        qty_48kg=1,
    )

    yesterday_row = get_daily_row(client, YESTERDAY.isoformat())
    assert yesterday_row["net_today"] == 0
    assert yesterday_row.get("cash_end", yesterday_row.get("wallet_end")) == 1000

    after_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    after_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    assert before_a_collection["live_debt_cylinders_12"] == 2
    assert after_a_collection["live_debt_cylinders_12"] == 0
    assert before_a_collection["live_debt_cylinders_48"] == 2
    assert after_a_collection["live_debt_cylinders_48"] == 1
    assert after_b_collection["live_debt_cylinders_12"] == before_b_collection["live_debt_cylinders_12"]
    assert after_b_collection["live_debt_cylinders_48"] == before_b_collection["live_debt_cylinders_48"]

    after_report = _day_report(client, TODAY)
    after_a_event = _event(after_report, event_type="customer_return_empties", customer_id=ids["customer_a"], gas_type="12kg")
    after_b_event = _event(after_report, event_type="customer_return_empties", customer_id=ids["customer_b"], gas_type="12kg")
    assert after_a_event["inventory_before"]["empty12"] == before_a_event["inventory_before"]["empty12"] + 2
    assert after_a_event["inventory_after"]["empty12"] == before_a_event["inventory_after"]["empty12"] + 2
    assert after_a_event["customer_12kg_before"] == before_a_event["customer_12kg_before"] - 2
    assert after_a_event["customer_12kg_after"] == before_a_event["customer_12kg_after"] - 2
    assert after_a_event["customer_48kg_before"] == before_a_event["customer_48kg_before"] - 1
    assert after_a_event["customer_48kg_after"] == before_a_event["customer_48kg_after"] - 1
    assert after_b_event["inventory_before"]["empty12"] == before_b_event["inventory_before"]["empty12"] + 2
    assert after_b_event["inventory_after"]["empty12"] == before_b_event["inventory_after"]["empty12"] + 2
    assert after_b_event["customer_12kg_before"] == before_b_event["customer_12kg_before"]
    assert after_b_event["customer_12kg_after"] == before_b_event["customer_12kg_after"]

    today_row = get_daily_row(client, TODAY.isoformat())
    assert today_row["net_today"] == 0
    assert today_row.get("cash_end", today_row.get("wallet_end")) == 1000
    company = _company_balances(client)
    _assert_company_balances_unchanged(client)
    assert company["inventory_empty_12"] == 9
    assert company["inventory_empty_48"] == 3

    delete_resp = client.delete(f"/collections/{backdated['id']}")
    assert delete_resp.status_code == 204, delete_resp.text

    restored_a_collection = next(item for item in _collections(client) if item["id"] == later_a["id"])
    restored_b_collection = next(item for item in _collections(client) if item["id"] == later_b["id"])
    assert restored_a_collection["live_debt_cylinders_12"] == before_a_collection["live_debt_cylinders_12"]
    assert restored_a_collection["live_debt_cylinders_48"] == before_a_collection["live_debt_cylinders_48"]
    assert restored_b_collection["live_debt_cylinders_12"] == before_b_collection["live_debt_cylinders_12"]
    restored_report = _day_report(client, TODAY)
    restored_a_event = _event(restored_report, event_type="customer_return_empties", customer_id=ids["customer_a"], gas_type="12kg")
    assert restored_a_event["inventory_before"]["empty12"] == before_a_event["inventory_before"]["empty12"]
    assert restored_a_event["customer_12kg_after"] == before_a_event["customer_12kg_after"]
    _assert_collection_reversal_rows(
        collection_id=backdated["id"],
        expected_cash_total=0,
        expected_inv_12_total=0,
        expected_inv_48_total=0,
        expected_cyl_12_total=0,
        expected_cyl_48_total=0,
    )
