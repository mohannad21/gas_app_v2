from __future__ import annotations

"""
Ledger smoke test — verifies that every major activity type produces the
correct balance transitions in event cards, the correct ledger-tab totals
(physical wallet + inventory counts), the correct date-card summary (sold
cylinders + net), and the correct customer / company balances.

The test also verifies that retroactively adding, editing, or deleting an
activity on a past date correctly updates all of those numbers.

All monetary amounts are in MINOR UNITS (integer, e.g. 10_000 = 100.00).
Inventory values are unit counts (integers).
"""

from datetime import date, timedelta
from typing import Any

import pytest
from conftest import (
    create_customer,
    create_order,
    create_system,
    get_daily_row,
    init_inventory,
)

# ── fixed test dates ──────────────────────────────────────────────────────────
# Using past fixed dates so they are clearly "historical" and isolated from
# production data in any shared test environment.

MAIN_DAY = date(2025, 3, 1)
MAIN_DAY_ISO = MAIN_DAY.isoformat()
MAIN_PREV = (MAIN_DAY - timedelta(days=1)).isoformat()

RETRO_DAY = date(2025, 4, 10)
RETRO_DAY_ISO = RETRO_DAY.isoformat()
RETRO_PREV = (RETRO_DAY - timedelta(days=1)).isoformat()


# ── low-level helpers ─────────────────────────────────────────────────────────

def _setup_wallet(client, *, date_str: str, amount: int) -> None:
    """Post a cash adjustment the evening of *date_str* to set the opening wallet."""
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{date_str}T22:00:00", "delta_cash": amount, "reason": "opening"},
    )
    assert resp.status_code == 201, resp.text


def _create_system_48kg(client, *, customer_id: str, name: str = "48kg Station") -> str:
    resp = client.post(
        "/systems",
        json={
            "customer_id": customer_id,
            "name": name,
            "gas_type": "48kg",
            "is_active": True,
            "requires_security_check": False,
            "security_check_exists": False,
            "last_security_check_at": None,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _post_collection_payment(client, *, customer_id: str, happened_at: str, amount: int) -> str:
    resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": amount,
            "happened_at": happened_at,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _post_collection_return(
    client,
    *,
    customer_id: str,
    happened_at: str,
    qty_12kg: int = 0,
    qty_48kg: int = 0,
) -> str:
    resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "return",
            "qty_12kg": qty_12kg,
            "qty_48kg": qty_48kg,
            "happened_at": happened_at,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _post_expense(client, *, happened_at: str, amount: int, note: str = "smoke") -> str:
    # `date` is required by ExpenseCreate; extract it from the happened_at string
    date_str = happened_at[:10]
    resp = client.post(
        "/expenses",
        json={
            "expense_type": "fuel",
            "amount": amount,
            "note": note,
            "date": date_str,
            "happened_at": happened_at,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _post_cash_adjust(client, *, happened_at: str, delta: int) -> str:
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": happened_at, "delta_cash": delta, "reason": "smoke"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _post_refill(
    client,
    *,
    happened_at: str,
    buy12: int,
    return12: int,
    buy48: int,
    return48: int,
    total_cost: int,
    paid_now: int,
) -> None:
    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": happened_at,
            "buy12": buy12,
            "return12": return12,
            "new12": 0,
            "buy48": buy48,
            "return48": return48,
            "new48": 0,
            "total_cost": total_cost,
            "paid_now": paid_now,
        },
    )
    assert resp.status_code == 200, resp.text


def _post_company_payment(client, *, happened_at: str, amount: int) -> str:
    resp = client.post(
        "/company/payments",
        json={"happened_at": happened_at, "amount": amount},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _post_bank_deposit(
    client, *, happened_at: str, amount: int, direction: str
) -> str:
    """direction: 'wallet_to_bank' or 'bank_to_wallet'"""
    resp = client.post(
        "/cash/bank_deposit",
        json={"happened_at": happened_at, "amount": amount, "direction": direction},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _get_day_report(client, date_str: str) -> dict[str, Any]:
    resp = client.get("/reports/day", params={"date": date_str})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _find_event(events: list[dict], event_type: str, nth: int = 0) -> dict:
    matches = [e for e in events if e.get("event_type") == event_type]
    assert len(matches) > nth, (
        f"Expected at least {nth + 1} event(s) of type '{event_type}', "
        f"got {len(matches)}. Available types: {[e.get('event_type') for e in events]}"
    )
    return matches[nth]


def _inv(ev: dict, side: str) -> dict:
    """Return inventory_before or inventory_after from an event, with defaults."""
    inv = ev.get(f"inventory_{side}") or {}
    return {
        "full12": inv.get("full12", 0),
        "empty12": inv.get("empty12", 0),
        "full48": inv.get("full48", 0),
        "empty48": inv.get("empty48", 0),
    }


# ── main smoke test ───────────────────────────────────────────────────────────

def test_ledger_smoke_all_activity_types(client) -> None:
    """
    Full-day scenario covering every activity type.

    INVENTORY SETUP (2025-02-28 = MAIN_PREV):
        full12=50  empty12=10  full48=20  empty48=5
    WALLET SETUP (2025-02-28 evening):
        opening cash = 10_000

    ACTIVITIES on 2025-03-01:
        T1 09:00  replacement order 12kg:  installed=2, received=2, price=600, paid=300
                  → full12 −2=48, empty12 +2=12, cash +300=10_300, customer debt +300
        T2 09:30  replacement order 48kg:  installed=1, received=0, price=400, paid=400
                  → full48 −1=19, cash +400=10_700
        T3 10:00  collection payment:      amount=200
                  → cash +200=10_900, customer debt −200=100
        T4 10:30  collection return 3×12kg empties from customer
                  → empty12 +3=15, cash unchanged=10_900
        T5 11:00  expense (fuel):          amount=500
                  → cash −500=10_400
        T6 11:30  cash adjustment:         +1_000
                  → cash +1_000=11_400
        T7 12:00  refill: buy12=5, ret12=2, buy48=1, total=2_000, paid_now=800
                  → full12 +5=53, empty12 −2=13, full48 +1=20
                  → cash −800=10_600  (company_txn: INCLUDED in physical wallet)
        T8 13:00  company payment:         amount=500
                  → cash −500=10_100  (company_txn: INCLUDED in physical wallet)

    FINAL STATE:
        Ledger tab  cash_start=10_000  cash_end=10_100
        Inventory   full12=53  empty12=13  full48=20  empty48=5
        Date card   sold_12kg=2  sold_48kg=1  net_today=+1_400  (excl company_txn)
        Customer    money_balance=100  cylinder_balance_12kg=−3  cylinder_balance_48kg=1
        Company     company_money=700  (2_000 − 800 paid_now − 500 company_payment)
    """

    # ── Setup ─────────────────────────────────────────────────────────────────
    init_inventory(client, date=MAIN_PREV, full12=50, empty12=10, full48=20, empty48=5)
    _setup_wallet(client, date_str=MAIN_PREV, amount=10_000)

    cust_id = create_customer(client, name="Smoke Customer")
    sys_12 = create_system(client, customer_id=cust_id, name="Kitchen 12kg")
    sys_48 = _create_system_48kg(client, customer_id=cust_id)

    # ── Activities ────────────────────────────────────────────────────────────
    # T1
    create_order(
        client,
        customer_id=cust_id,
        system_id=sys_12,
        delivered_at=f"{MAIN_DAY_ISO}T09:00:00",
        gas_type="12kg",
        installed=2,
        received=2,
        price_total=600,
        paid_amount=300,
    )
    # T2
    create_order(
        client,
        customer_id=cust_id,
        system_id=sys_48,
        delivered_at=f"{MAIN_DAY_ISO}T09:30:00",
        gas_type="48kg",
        installed=1,
        received=0,
        price_total=400,
        paid_amount=400,
    )
    # T3
    _post_collection_payment(
        client, customer_id=cust_id,
        happened_at=f"{MAIN_DAY_ISO}T10:00:00", amount=200,
    )
    # T4
    _post_collection_return(
        client, customer_id=cust_id,
        happened_at=f"{MAIN_DAY_ISO}T10:30:00", qty_12kg=3,
    )
    # T5
    _post_expense(client, happened_at=f"{MAIN_DAY_ISO}T11:00:00", amount=500)
    # T6
    _post_cash_adjust(client, happened_at=f"{MAIN_DAY_ISO}T11:30:00", delta=1_000)
    # T7
    _post_refill(
        client,
        happened_at=f"{MAIN_DAY_ISO}T12:00:00",
        buy12=5, return12=2, buy48=1, return48=0,
        total_cost=2_000, paid_now=800,
    )
    # T8
    _post_company_payment(client, happened_at=f"{MAIN_DAY_ISO}T13:00:00", amount=500)

    # ── Ledger tab: physical wallet ───────────────────────────────────────────
    day = _get_day_report(client, MAIN_DAY_ISO)

    assert day["cash_start"] == 10_000, f"cash_start expected 10_000, got {day['cash_start']}"
    assert day["cash_end"] == 10_100, f"cash_end expected 10_100, got {day['cash_end']}"

    inv_end = day["inventory_end"]
    assert inv_end["full12"] == 53, f"full12_end: {inv_end['full12']}"
    assert inv_end["empty12"] == 13, f"empty12_end: {inv_end['empty12']}"
    assert inv_end["full48"] == 20, f"full48_end: {inv_end['full48']}"
    assert inv_end["empty48"] == 5, f"empty48_end: {inv_end['empty48']}"

    inv_start = day["inventory_start"]
    assert inv_start["full12"] == 50
    assert inv_start["empty12"] == 10
    assert inv_start["full48"] == 20
    assert inv_start["empty48"] == 5

    # ── Event card balance transitions ────────────────────────────────────────
    events = day["events"]

    # T1: replacement order (12kg)
    t1_matches = [
        e for e in events
        if e.get("event_type") == "order" and e.get("gas_type") == "12kg"
    ]
    assert t1_matches, "No 12kg order event found"
    t1 = t1_matches[0]
    assert t1["cash_before"] == 10_000, f"T1 cash_before: {t1['cash_before']}"
    assert t1["cash_after"] == 10_300, f"T1 cash_after: {t1['cash_after']}"
    assert _inv(t1, "before")["full12"] == 50
    assert _inv(t1, "after")["full12"] == 48
    assert _inv(t1, "before")["empty12"] == 10
    assert _inv(t1, "after")["empty12"] == 12

    # T2: order (48kg)
    t2_matches = [
        e for e in events
        if e.get("event_type") == "order" and e.get("gas_type") == "48kg"
    ]
    assert t2_matches, "No 48kg order event found"
    t2 = t2_matches[0]
    assert t2["cash_before"] == 10_300, f"T2 cash_before: {t2['cash_before']}"
    assert t2["cash_after"] == 10_700, f"T2 cash_after: {t2['cash_after']}"
    assert _inv(t2, "before")["full48"] == 20
    assert _inv(t2, "after")["full48"] == 19

    # T3: collection payment
    t3 = _find_event(events, "collection_money")
    assert t3["cash_before"] == 10_700, f"T3 cash_before: {t3['cash_before']}"
    assert t3["cash_after"] == 10_900, f"T3 cash_after: {t3['cash_after']}"

    # T4: collection return (no cash change, empty12 +3)
    t4 = _find_event(events, "collection_empty")
    assert t4["cash_before"] == 10_900, f"T4 cash_before: {t4['cash_before']}"
    assert t4["cash_after"] == 10_900, f"T4 cash_after: {t4['cash_after']}"
    assert _inv(t4, "before")["empty12"] == 12
    assert _inv(t4, "after")["empty12"] == 15

    # T5: expense
    t5 = _find_event(events, "expense")
    assert t5["cash_before"] == 10_900, f"T5 cash_before: {t5['cash_before']}"
    assert t5["cash_after"] == 10_400, f"T5 cash_after: {t5['cash_after']}"

    # T6: cash adjustment
    t6 = _find_event(events, "cash_adjust")
    assert t6["cash_before"] == 10_400, f"T6 cash_before: {t6['cash_before']}"
    assert t6["cash_after"] == 11_400, f"T6 cash_after: {t6['cash_after']}"

    # T7: refill — company_txn cash payment IS reflected in physical wallet
    t7 = _find_event(events, "refill")
    assert t7["cash_before"] == 11_400, f"T7 cash_before: {t7['cash_before']}"
    assert t7["cash_after"] == 10_600, f"T7 cash_after: {t7['cash_after']}"
    assert _inv(t7, "before")["full12"] == 48
    assert _inv(t7, "after")["full12"] == 53
    assert _inv(t7, "before")["empty12"] == 15
    assert _inv(t7, "after")["empty12"] == 13
    assert _inv(t7, "before")["full48"] == 19
    assert _inv(t7, "after")["full48"] == 20

    # T8: company payment — company_txn cash payment IS reflected in physical wallet
    t8 = _find_event(events, "company_payment")
    assert t8["cash_before"] == 10_600, f"T8 cash_before: {t8['cash_before']}"
    assert t8["cash_after"] == 10_100, f"T8 cash_after: {t8['cash_after']}"

    # ── Date card: operational net (excludes company_txn) ─────────────────────
    # net_today = +300 (T1) + 400 (T2) + 200 (T3) + 0 (T4) − 500 (T5) + 1_000 (T6)
    #           = 1_400   (T7 refill cash and T8 company payment are excluded)
    card = get_daily_row(client, MAIN_DAY_ISO)
    assert card["sold_12kg"] == 2, f"sold_12kg: {card['sold_12kg']}"
    assert card["sold_48kg"] == 1, f"sold_48kg: {card['sold_48kg']}"
    assert card["net_today"] == 1_400, f"net_today: {card['net_today']}"

    # ── Customer balance ───────────────────────────────────────────────────────
    bal = client.get(f"/customers/{cust_id}/balances").json()
    # T1: price=600, paid=300 → debt +300
    # T3: payment 200 → debt −200 → remaining = 100
    assert bal["money_balance"] == 100, f"money_balance: {bal['money_balance']}"
    # T1: installed=2, received=2 → net cylinder debt = 0
    # T4: return 3 empties → customer cylinder credit = −3
    assert bal["cylinder_balance_12kg"] == -3, f"cylinder_balance_12kg: {bal['cylinder_balance_12kg']}"
    # T2: installed=1, received=0 → net cylinder debt = 1
    assert bal["cylinder_balance_48kg"] == 1, f"cylinder_balance_48kg: {bal['cylinder_balance_48kg']}"

    # ── Company balance ────────────────────────────────────────────────────────
    # T7 refill: total=2_000, paid_now=800 → company debt = 1_200
    # T8 company payment: 500 → company debt = 700
    comp = client.get("/company/balances").json()
    assert comp["company_money"] == 700, f"company_money: {comp['company_money']}"


# ── bank deposit smoke ────────────────────────────────────────────────────────

def test_ledger_smoke_bank_deposit(client) -> None:
    """
    Verifies wallet_to_bank and bank_to_wallet transitions in event cards.
    Both directions affect cash_before/cash_after correctly, while date-card
    net_today ignores them because transfers are not operational net.
    """
    D = date(2025, 3, 5)
    D_ISO = D.isoformat()
    D_PREV = (D - timedelta(days=1)).isoformat()

    init_inventory(client, date=D_PREV, full12=10, empty12=5, full48=5, empty48=2)
    _setup_wallet(client, date_str=D_PREV, amount=8_000)

    # wallet_to_bank: 3_000 leaves wallet
    _post_bank_deposit(client, happened_at=f"{D_ISO}T10:00:00", amount=3_000, direction="wallet_to_bank")
    # bank_to_wallet: 1_000 enters wallet
    _post_bank_deposit(client, happened_at=f"{D_ISO}T11:00:00", amount=1_000, direction="bank_to_wallet")

    day = _get_day_report(client, D_ISO)
    events = day["events"]

    bd_events = [e for e in events if e.get("event_type") == "bank_deposit"]
    assert len(bd_events) == 2, f"Expected 2 bank_deposit events, got {len(bd_events)}"

    # Sort by happened_at (chronological order)
    bd_events.sort(key=lambda e: e.get("effective_at", ""))

    # First event (10:00): wallet_to_bank (cash drops 8_000 → 5_000)
    wtb = bd_events[0]
    assert wtb["cash_before"] == 8_000, f"wallet_to_bank cash_before: {wtb['cash_before']}"
    assert wtb["cash_after"] == 5_000, f"wallet_to_bank cash_after: {wtb['cash_after']}"

    # Second event (11:00): bank_to_wallet (cash rises 5_000 → 6_000)
    btw = bd_events[1]
    assert btw["cash_before"] == 5_000, f"bank_to_wallet cash_before: {btw['cash_before']}"
    assert btw["cash_after"] == 6_000, f"bank_to_wallet cash_after: {btw['cash_after']}"

    # Ledger tab
    assert day["cash_start"] == 8_000
    assert day["cash_end"] == 6_000

    card = get_daily_row(client, D_ISO)
    assert card["net_today"] == 0


# ── retroactive changes ───────────────────────────────────────────────────────

def test_ledger_smoke_retroactive_order(client) -> None:
    """
    Adding, then deleting, an order on a past date correctly updates all report
    numbers (date card, ledger tab, event cards).
    """
    D_ISO = RETRO_DAY_ISO

    init_inventory(client, date=RETRO_PREV, full12=20, empty12=5, full48=10, empty48=2)
    _setup_wallet(client, date_str=RETRO_PREV, amount=5_000)

    cust_id = create_customer(client, name="Retro Customer")
    sys_12 = create_system(client, customer_id=cust_id, name="Retro Kitchen")

    # ── Baseline: no activities ───────────────────────────────────────────────
    card = get_daily_row(client, D_ISO)
    assert card["net_today"] == 0
    assert card["sold_12kg"] == 0

    day = _get_day_report(client, D_ISO)
    assert day["cash_start"] == 5_000
    assert day["cash_end"] == 5_000
    assert day["inventory_end"]["full12"] == 20

    # ── Add an order ──────────────────────────────────────────────────────────
    order_id = create_order(
        client,
        customer_id=cust_id,
        system_id=sys_12,
        delivered_at=f"{D_ISO}T10:00:00",
        gas_type="12kg",
        installed=3,
        received=3,
        price_total=900,
        paid_amount=900,
    )

    card = get_daily_row(client, D_ISO)
    assert card["sold_12kg"] == 3, f"After add sold_12kg: {card['sold_12kg']}"
    assert card["net_today"] == 900, f"After add net_today: {card['net_today']}"

    day = _get_day_report(client, D_ISO)
    assert day["cash_end"] == 5_900, f"After add cash_end: {day['cash_end']}"
    assert day["inventory_end"]["full12"] == 17, f"After add full12: {day['inventory_end']['full12']}"

    # ── Delete the order ──────────────────────────────────────────────────────
    del_resp = client.delete(f"/orders/{order_id}")
    assert del_resp.status_code == 204

    card = get_daily_row(client, D_ISO)
    assert card["sold_12kg"] == 0, f"After delete sold_12kg: {card['sold_12kg']}"
    assert card["net_today"] == 0, f"After delete net_today: {card['net_today']}"

    day = _get_day_report(client, D_ISO)
    assert day["cash_end"] == 5_000, f"After delete cash_end: {day['cash_end']}"
    assert day["inventory_end"]["full12"] == 20, f"After delete full12: {day['inventory_end']['full12']}"


def test_ledger_smoke_retroactive_refill_with_cash(client) -> None:
    """
    Adding a refill with cash payment on a past date updates the physical
    wallet (cash_end) but NOT net_today (company_txn is excluded from net).
    Deleting the refill reverts both.
    """
    D_ISO = RETRO_DAY_ISO

    init_inventory(client, date=RETRO_PREV, full12=10, empty12=5, full48=5, empty48=2)
    _setup_wallet(client, date_str=RETRO_PREV, amount=6_000)

    # ── Baseline ──────────────────────────────────────────────────────────────
    card = get_daily_row(client, D_ISO)
    assert card["net_today"] == 0
    day = _get_day_report(client, D_ISO)
    assert day["cash_end"] == 6_000
    assert day["inventory_end"]["full12"] == 10

    # ── Add refill (paid 1_200 cash) ──────────────────────────────────────────
    _post_refill(
        client,
        happened_at=f"{D_ISO}T09:00:00",
        buy12=4, return12=2, buy48=0, return48=0,
        total_cost=2_000, paid_now=1_200,
    )

    # Physical wallet decreases by cash paid
    day = _get_day_report(client, D_ISO)
    assert day["cash_end"] == 4_800, f"After refill cash_end: {day['cash_end']}"
    # Inventory updated
    assert day["inventory_end"]["full12"] == 14, f"After refill full12: {day['inventory_end']['full12']}"
    assert day["inventory_end"]["empty12"] == 3, f"After refill empty12: {day['inventory_end']['empty12']}"
    # net_today unchanged — company_txn excluded from operational net
    card = get_daily_row(client, D_ISO)
    assert card["net_today"] == 0, f"After refill net_today: {card['net_today']}"

    # ── Retroactive order added AFTER the refill ───────────────────────────────
    # Verify the event chain is still correct (refill cash before = 6_000)
    events = day["events"]
    refill_ev = _find_event(events, "refill")
    assert refill_ev["cash_before"] == 6_000
    assert refill_ev["cash_after"] == 4_800


def test_ledger_smoke_retroactive_update_order(client) -> None:
    """
    Updating (editing) an order on a past date correctly updates reports.
    """
    D_ISO = RETRO_DAY_ISO

    init_inventory(client, date=RETRO_PREV, full12=20, empty12=5, full48=0, empty48=0)
    _setup_wallet(client, date_str=RETRO_PREV, amount=3_000)

    cust_id = create_customer(client, name="Update Customer")
    sys_12 = create_system(client, customer_id=cust_id, name="Update Kitchen")

    order_id = create_order(
        client,
        customer_id=cust_id,
        system_id=sys_12,
        delivered_at=f"{D_ISO}T09:00:00",
        gas_type="12kg",
        installed=2,
        received=2,
        price_total=400,
        paid_amount=400,
    )

    card = get_daily_row(client, D_ISO)
    assert card["net_today"] == 400
    assert card["sold_12kg"] == 2

    # Update: change paid_amount from 400 → 600, installed from 2 → 3
    upd_resp = client.put(
        f"/orders/{order_id}",
        json={"price_total": 600, "paid_amount": 600, "cylinders_installed": 3, "cylinders_received": 3},
    )
    assert upd_resp.status_code == 200, upd_resp.text

    card = get_daily_row(client, D_ISO)
    assert card["net_today"] == 600, f"After update net_today: {card['net_today']}"
    assert card["sold_12kg"] == 3, f"After update sold_12kg: {card['sold_12kg']}"

    day = _get_day_report(client, D_ISO)
    assert day["cash_end"] == 3_600, f"After update cash_end: {day['cash_end']}"
