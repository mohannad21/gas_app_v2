from __future__ import annotations

from .helpers import (
    DAY1, at,
    post_replacement, post_sell_full, post_buy_empty,
    post_payment_from_customer, post_payout_to_customer,
    post_return_empties_from_customer, post_customer_balance_adjustment,
    post_refill, post_inventory_adjustment,
    post_buy_full_from_company, post_return_empties_to_company,
    post_payment_to_company, post_payment_from_company,
    post_company_balance_adjustment,
    post_expense,
    post_wallet_adjustment, post_wallet_to_bank, post_bank_to_wallet,
    get_day_report,
)


def _assert_ledger(client, date, *, wallet_end, full12, empty12, full48, empty48):
    day = get_day_report(client, date)
    assert day["wallet_end"] == wallet_end, (
        f"wallet_end: expected {wallet_end}, got {day['wallet_end']}"
    )
    inv = day["inventory_end"]
    assert inv["full12"]  == full12,  f"full12:  expected {full12},  got {inv['full12']}"
    assert inv["empty12"] == empty12, f"empty12: expected {empty12}, got {inv['empty12']}"
    assert inv["full48"]  == full48,  f"full48:  expected {full48},  got {inv['full48']}"
    assert inv["empty48"] == empty48, f"empty48: expected {empty48}, got {inv['empty48']}"


# ── Replacement ───────────────────────────────────────────────────────────────

def test_replacement_12kg(client, baseline):
    """
    Replacement (12kg): deliver 2 full cylinders, collect 2 empties, receive partial cash.
    wallet += paid_amount (cash received now, not price_total).
    full12 -= installed; empty12 += received. 48kg untouched.
    """
    cid = baseline["customer_a_id"]
    post_replacement(client, cid, baseline["customer_a_system_12kg"], "12kg",
                     cylinders_installed=2, cylinders_received=2,
                     price_total=200, paid_amount=150,
                     happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1150,
                   full12=98, empty12=52, full48=50, empty48=30)


def test_replacement_48kg(client, baseline):
    """
    Replacement (48kg): deliver 1 full cylinder, collect 1 empty, receive full cash.
    wallet += paid_amount. full48 -= installed; empty48 += received. 12kg untouched.
    """
    cid = baseline["customer_a_id"]
    post_replacement(client, cid, baseline["customer_a_system_48kg"], "48kg",
                     cylinders_installed=1, cylinders_received=1,
                     price_total=500, paid_amount=500,
                     happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1500,
                   full12=100, empty12=50, full48=49, empty48=31)


def test_replacement_zero_payment(client, baseline):
    """
    Replacement with zero cash collected today (fully on credit).
    wallet unchanged (paid_amount=0). Inventory still changes — cylinders moved.
    """
    cid = baseline["customer_a_id"]
    post_replacement(client, cid, baseline["customer_a_system_12kg"], "12kg",
                     cylinders_installed=2, cylinders_received=1,
                     price_total=200, paid_amount=0,
                     happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=98, empty12=51, full48=50, empty48=30)


# ── Sell full ─────────────────────────────────────────────────────────────────

def test_sell_full_12kg(client, baseline):
    """
    Sell full (12kg): deliver cylinders, customer keeps them (no empty return).
    wallet += paid_amount. full12 -= installed. empty12 untouched.
    """
    cid = baseline["customer_c_id"]
    post_sell_full(client, cid, baseline["customer_c_system_12kg"], "12kg",
                   cylinders_installed=3, price_total=300, paid_amount=300,
                   happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1300,
                   full12=97, empty12=50, full48=50, empty48=30)


def test_sell_full_48kg(client, baseline):
    """
    Sell full (48kg): deliver cylinders, customer keeps them.
    wallet += paid_amount. full48 -= installed. empty48 untouched.
    """
    cid = baseline["customer_c_id"]
    post_sell_full(client, cid, baseline["customer_c_system_48kg"], "48kg",
                   cylinders_installed=1, price_total=600, paid_amount=400,
                   happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1400,
                   full12=100, empty12=50, full48=49, empty48=30)


# ── Buy empty ─────────────────────────────────────────────────────────────────

def test_buy_empty_12kg(client, baseline):
    """
    Buy empty (12kg): we purchase empty cylinders from customer and pay them.
    wallet -= paid_amount. empty12 += received. full12 untouched.
    """
    cid = baseline["customer_a_id"]
    post_buy_empty(client, cid, "12kg",
                   cylinders_received=4, price_total=80, paid_amount=80,
                   happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=920,
                   full12=100, empty12=54, full48=50, empty48=30)


def test_buy_empty_48kg(client, baseline):
    """
    Buy empty (48kg): we purchase empty cylinders from customer and pay them.
    wallet -= paid_amount. empty48 += received. full48 untouched.
    """
    cid = baseline["customer_a_id"]
    post_buy_empty(client, cid, "48kg",
                   cylinders_received=2, price_total=200, paid_amount=200,
                   happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=800,
                   full12=100, empty12=50, full48=50, empty48=32)


# ── Collections ───────────────────────────────────────────────────────────────

def test_payment_from_customer(client, baseline):
    """
    Customer pays us cash (no cylinders).
    wallet += amount. Inventory entirely untouched.
    """
    cid = baseline["customer_a_id"]
    post_payment_from_customer(client, cid, amount=300, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1300,
                   full12=100, empty12=50, full48=50, empty48=30)


def test_payout_to_customer(client, baseline):
    """
    We pay customer cash (refund or credit settlement).
    wallet -= amount. Inventory entirely untouched.
    """
    cid = baseline["customer_b_id"]
    post_payout_to_customer(client, cid, amount=200, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=800,
                   full12=100, empty12=50, full48=50, empty48=30)


def test_return_empties_from_customer_12kg(client, baseline):
    """
    Customer returns empty 12kg cylinders — no money exchanged.
    wallet unchanged. empty12 += qty_12kg. All other inventory untouched.
    """
    cid = baseline["customer_a_id"]
    post_return_empties_from_customer(client, cid, qty_12kg=3, qty_48kg=0,
                                      happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=100, empty12=53, full48=50, empty48=30)


def test_return_empties_from_customer_48kg(client, baseline):
    """
    Customer returns empty 48kg cylinders — no money exchanged.
    wallet unchanged. empty48 += qty_48kg. All other inventory untouched.
    """
    cid = baseline["customer_a_id"]
    post_return_empties_from_customer(client, cid, qty_12kg=0, qty_48kg=2,
                                      happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=100, empty12=50, full48=50, empty48=32)


def test_customer_balance_adjustment(client, baseline):
    """
    Customer balance adjustment: sets the customer's ledger balance directly.
    No cash changes hands, no cylinders move. wallet and inventory both unchanged.
    """
    cid = baseline["customer_c_id"]
    post_customer_balance_adjustment(client, cid,
                                     amount_money=100, count_12kg=2, count_48kg=0,
                                     happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=100, empty12=50, full48=50, empty48=30)


# ── Refill ────────────────────────────────────────────────────────────────────

def test_refill_12kg(client, baseline):
    """
    Refill (12kg only): receive full cylinders from company, return empties, pay partially.
    wallet -= paid_amount. full12 += buy12; empty12 -= return12. 48kg untouched.
    """
    post_refill(client, buy12=10, return12=5, buy48=0, return48=0,
                total_cost=1000, paid_amount=800,
                happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=200,
                   full12=110, empty12=45, full48=50, empty48=30)


def test_refill_48kg(client, baseline):
    """
    Refill (48kg only): receive full cylinders from company, return empties, pay partially.
    wallet -= paid_amount. full48 += buy48; empty48 -= return48. 12kg untouched.
    """
    post_refill(client, buy12=0, return12=0, buy48=5, return48=3,
                total_cost=2500, paid_amount=500,
                happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=500,
                   full12=100, empty12=50, full48=55, empty48=27)


# ── Company cylinder settle ───────────────────────────────────────────────────

def test_buy_full_from_company_12kg(client, baseline):
    """
    Receive full 12kg cylinders from company (cylinder settle, no payment here).
    wallet unchanged. full12 += quantity. All other inventory untouched.
    """
    post_buy_full_from_company(client, "12kg", quantity=10, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=110, empty12=50, full48=50, empty48=30)


def test_buy_full_from_company_48kg(client, baseline):
    """
    Receive full 48kg cylinders from company (cylinder settle, no payment here).
    wallet unchanged. full48 += quantity. All other inventory untouched.
    """
    post_buy_full_from_company(client, "48kg", quantity=5, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=100, empty12=50, full48=55, empty48=30)


def test_return_empties_to_company_12kg(client, baseline):
    """
    Return empty 12kg cylinders to company (cylinder settle, no payment here).
    wallet unchanged. empty12 -= quantity. All other inventory untouched.
    """
    post_return_empties_to_company(client, "12kg", quantity=8, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=100, empty12=42, full48=50, empty48=30)


def test_return_empties_to_company_48kg(client, baseline):
    """
    Return empty 48kg cylinders to company (cylinder settle, no payment here).
    wallet unchanged. empty48 -= quantity. All other inventory untouched.
    """
    post_return_empties_to_company(client, "48kg", quantity=4, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=100, empty12=50, full48=50, empty48=26)


def test_payment_to_company(client, baseline):
    """
    We pay company in cash. wallet -= amount. Inventory entirely untouched.
    """
    post_payment_to_company(client, amount=500, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=500,
                   full12=100, empty12=50, full48=50, empty48=30)


def test_payment_from_company(client, baseline):
    """
    Company pays us cash. wallet += amount. Inventory entirely untouched.
    NOTE: if this test fails with a 4xx error, verify the sign convention in
    post_payment_from_company() in helpers.py — the endpoint may differ from the assumption.
    """
    post_payment_from_company(client, amount=300, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1300,
                   full12=100, empty12=50, full48=50, empty48=30)


def test_company_balance_adjustment(client, baseline):
    """
    Company balance adjustment: sets company's ledger balance directly.
    No cash changes hands, no cylinders move. wallet and inventory both unchanged.
    """
    post_company_balance_adjustment(client,
                                    money_balance=3000,
                                    cylinder_balance_12=10, cylinder_balance_48=5,
                                    happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=100, empty12=50, full48=50, empty48=30)


# ── Expense ───────────────────────────────────────────────────────────────────

def test_expense(client, baseline):
    """
    Business expense: cash leaves the wallet. wallet -= amount. Inventory untouched.
    """
    cat_id = baseline["expense_category_id"]
    post_expense(client, expense_type_id=cat_id, amount=150, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=850,
                   full12=100, empty12=50, full48=50, empty48=30)


# ── Cash / bank ───────────────────────────────────────────────────────────────

def test_wallet_to_bank(client, baseline):
    """
    Transfer from on-hand wallet to bank. wallet -= amount.
    Inventory untouched. (Bank balance is external; not tracked in wallet_end.)
    """
    post_wallet_to_bank(client, amount=400, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=600,
                   full12=100, empty12=50, full48=50, empty48=30)


def test_bank_to_wallet(client, baseline):
    """
    Transfer from bank to on-hand wallet. wallet += amount. Inventory untouched.
    """
    post_bank_to_wallet(client, amount=300, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1300,
                   full12=100, empty12=50, full48=50, empty48=30)


def test_wallet_adjustment_positive(client, baseline):
    """
    Positive wallet adjustment (e.g. found cash, correction).
    wallet += delta_cash. Inventory untouched.
    """
    post_wallet_adjustment(client, delta_cash=200, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1200,
                   full12=100, empty12=50, full48=50, empty48=30)


def test_wallet_adjustment_negative(client, baseline):
    """
    Negative wallet adjustment (e.g. correction for over-counted cash).
    wallet += delta_cash (delta is negative). Inventory untouched.
    """
    post_wallet_adjustment(client, delta_cash=-300, happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=700,
                   full12=100, empty12=50, full48=50, empty48=30)


# ── Inventory adjustment ──────────────────────────────────────────────────────

def test_inventory_adjustment_12kg(client, baseline):
    """
    Inventory adjustment (12kg): direct delta to full and empty counts.
    wallet unchanged. full12 += delta_full; empty12 += delta_empty. 48kg untouched.
    """
    post_inventory_adjustment(client, "12kg", delta_full=5, delta_empty=-3,
                              happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=105, empty12=47, full48=50, empty48=30)


def test_inventory_adjustment_48kg(client, baseline):
    """
    Inventory adjustment (48kg): direct delta to full and empty counts.
    wallet unchanged. full48 += delta_full; empty48 += delta_empty. 12kg untouched.
    """
    post_inventory_adjustment(client, "48kg", delta_full=-2, delta_empty=4,
                              happened_at=at(DAY1, 9, 0))
    _assert_ledger(client, DAY1,
                   wallet_end=1000,
                   full12=100, empty12=50, full48=48, empty48=34)
