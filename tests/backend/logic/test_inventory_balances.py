from __future__ import annotations

from .helpers import (
    DAY0,
    DAY1,
    at,
    get_daily_card,
    post_replacement,
    post_sell_full,
    post_buy_empty,
    post_return_empties_from_customer,
    post_payment_from_customer,
    post_payout_to_customer,
    post_customer_balance_adjustment,
    post_refill,
    post_buy_full_from_company,
    post_return_empties_to_company,
    post_payment_to_company,
    post_payment_from_company,
    post_company_balance_adjustment,
    post_expense,
    post_wallet_to_bank,
    post_bank_to_wallet,
    post_wallet_adjustment,
    post_inventory_adjustment,
)

# Baseline inventory (set on DAY0, carried forward):
#   full12=100, empty12=50, full48=50, empty48=30


def _inv(client, date=DAY1) -> dict:
    return get_daily_card(client, date)["inventory_end"]


def _assert_inv(client, *, full12, empty12, full48, empty48, date=DAY1):
    inv = _inv(client, date)
    assert inv["full12"] == full12, f"full12: expected {full12}, got {inv['full12']}"
    assert inv["empty12"] == empty12, f"empty12: expected {empty12}, got {inv['empty12']}"
    assert inv["full48"] == full48, f"full48: expected {full48}, got {inv['full48']}"
    assert inv["empty48"] == empty48, f"empty48: expected {empty48}, got {inv['empty48']}"


# --- Baseline sanity ─────────────────────────────────────────────────────────

class TestInventoryBaseline:
    def test_baseline_inventory_on_day0(self, client, baseline):
        inv = get_daily_card(client, DAY0)["inventory_end"]
        assert inv["full12"] == 100
        assert inv["empty12"] == 50
        assert inv["full48"] == 50
        assert inv["empty48"] == 30

    def test_baseline_carries_forward_to_day1(self, client, baseline):
        # No activity on DAY1 — inventory_end should equal baseline
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)


# --- Replacement ─────────────────────────────────────────────────────────────
# Delivers full cylinders to customer, receives empties back.
# full -= installed, empty += received

class TestInventoryReplacement:
    def test_replacement_12kg(self, client, baseline):
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=300,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=97, empty12=52, full48=50, empty48=30)

    def test_replacement_48kg(self, client, baseline):
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=2, cylinders_received=1,
            price_total=400, paid_amount=400,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=48, empty48=31)

    def test_replacement_no_empties_received(self, client, baseline):
        # cylinders_received=0: full decreases, empty unchanged
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=4, cylinders_received=0,
            price_total=400, paid_amount=400,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=96, empty12=50, full48=50, empty48=30)


# --- Sell full ───────────────────────────────────────────────────────────────
# Delivers full cylinders, receives no empties.
# full -= installed, empty unchanged

class TestInventorySellFull:
    def test_sell_full_12kg(self, client, baseline):
        post_sell_full(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=5,
            price_total=500, paid_amount=500,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=95, empty12=50, full48=50, empty48=30)

    def test_sell_full_48kg(self, client, baseline):
        post_sell_full(
            client, baseline["customer_c_id"], baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=3,
            price_total=600, paid_amount=600,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=47, empty48=30)


# --- Buy empty ───────────────────────────────────────────────────────────────
# We buy empties from the customer — adds to our empty stock, no full change.
# empty += cylinders_received, full unchanged

class TestInventoryBuyEmpty:
    def test_buy_empty_12kg(self, client, baseline):
        post_buy_empty(
            client, baseline["customer_c_id"], "12kg",
            cylinders_received=6,
            price_total=60, paid_amount=60,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=56, full48=50, empty48=30)

    def test_buy_empty_48kg(self, client, baseline):
        post_buy_empty(
            client, baseline["customer_c_id"], "48kg",
            cylinders_received=4,
            price_total=80, paid_amount=80,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=34)


# --- Return empties from customer ────────────────────────────────────────────
# Customer returns empties to us — adds to our empty stock.
# empty += qty, full unchanged

class TestInventoryReturnEmpties:
    def test_return_12kg(self, client, baseline):
        post_return_empties_from_customer(
            client, baseline["customer_a_id"],
            qty_12kg=5, qty_48kg=0,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=55, full48=50, empty48=30)

    def test_return_48kg(self, client, baseline):
        post_return_empties_from_customer(
            client, baseline["customer_a_id"],
            qty_12kg=0, qty_48kg=3,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=33)

    def test_return_both_gas_types(self, client, baseline):
        post_return_empties_from_customer(
            client, baseline["customer_a_id"],
            qty_12kg=4, qty_48kg=2,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=54, full48=50, empty48=32)


# --- Refill ──────────────────────────────────────────────────────────────────
# Take full cylinders from company, return empties to company.
# full += buy, empty -= return (per gas type)

class TestInventoryRefill:
    def test_refill_12kg_only(self, client, baseline):
        post_refill(
            client,
            buy12=10, return12=5,
            buy48=0, return48=0,
            total_cost=500, paid_amount=500,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=110, empty12=45, full48=50, empty48=30)

    def test_refill_48kg_only(self, client, baseline):
        post_refill(
            client,
            buy12=0, return12=0,
            buy48=4, return48=2,
            total_cost=400, paid_amount=400,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=54, empty48=28)

    def test_refill_both_gas_types(self, client, baseline):
        post_refill(
            client,
            buy12=8, return12=3,
            buy48=5, return48=2,
            total_cost=800, paid_amount=800,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=108, empty12=47, full48=55, empty48=28)

    def test_refill_no_return(self, client, baseline):
        # return=0: full increases, empty unchanged
        post_refill(
            client,
            buy12=6, return12=0,
            buy48=0, return48=0,
            total_cost=300, paid_amount=300,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=106, empty12=50, full48=50, empty48=30)


# --- Buy iron from company ───────────────────────────────────────────────────
# Outright purchase — adds full cylinders only, no empty exchange.
# full += new, empty unchanged

class TestInventoryBuyFullFromCompany:
    def test_buy_full_12kg(self, client, baseline):
        post_buy_full_from_company(
            client,
            new12=5, new48=0,
            total_cost=300, paid_amount=300,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=105, empty12=50, full48=50, empty48=30)

    def test_buy_full_48kg(self, client, baseline):
        post_buy_full_from_company(
            client,
            new12=0, new48=3,
            total_cost=400, paid_amount=400,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=53, empty48=30)

    def test_buy_full_both_gas_types(self, client, baseline):
        post_buy_full_from_company(
            client,
            new12=4, new48=2,
            total_cost=500, paid_amount=500,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=104, empty12=50, full48=52, empty48=30)


# --- Return empties to company ───────────────────────────────────────────────
# We send our empty cylinders back to the company.
# empty -= quantity, full unchanged

class TestInventoryReturnToCompany:
    def test_return_12kg_empties_to_company(self, client, baseline):
        # Create cylinder debt first on DAY0
        post_refill(
            client,
            buy12=5, return12=0,
            buy48=0, return48=0,
            total_cost=0, paid_amount=0,
            happened_at=at(DAY0),
        )
        post_return_empties_to_company(
            client, gas_type="12kg", quantity=4,
            happened_at=at(DAY1),
        )
        # empty12: 50 - 4 = 46; full unchanged at 105 (100 + 5 from DAY0 refill)
        _assert_inv(client, full12=105, empty12=46, full48=50, empty48=30)

    def test_return_48kg_empties_to_company(self, client, baseline):
        post_refill(
            client,
            buy12=0, return12=0,
            buy48=4, return48=0,
            total_cost=0, paid_amount=0,
            happened_at=at(DAY0),
        )
        post_return_empties_to_company(
            client, gas_type="48kg", quantity=3,
            happened_at=at(DAY1),
        )
        # empty48: 30 - 3 = 27; full unchanged at 54 (50 + 4 from DAY0 refill)
        _assert_inv(client, full12=100, empty12=50, full48=54, empty48=27)


# --- Inventory adjustment ────────────────────────────────────────────────────
# Direct correction to inventory counts. delta_full and delta_empty can be + or -.

class TestInventoryAdjustment:
    def test_adjustment_12kg_positive(self, client, baseline):
        post_inventory_adjustment(
            client, gas_type="12kg",
            delta_full=5, delta_empty=3,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=105, empty12=53, full48=50, empty48=30)

    def test_adjustment_12kg_negative(self, client, baseline):
        post_inventory_adjustment(
            client, gas_type="12kg",
            delta_full=-10, delta_empty=-5,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=90, empty12=45, full48=50, empty48=30)

    def test_adjustment_48kg_positive(self, client, baseline):
        post_inventory_adjustment(
            client, gas_type="48kg",
            delta_full=4, delta_empty=2,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=54, empty48=32)

    def test_adjustment_48kg_negative(self, client, baseline):
        post_inventory_adjustment(
            client, gas_type="48kg",
            delta_full=-5, delta_empty=-3,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=45, empty48=27)

    def test_adjustment_full_only(self, client, baseline):
        post_inventory_adjustment(
            client, gas_type="12kg",
            delta_full=8, delta_empty=0,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=108, empty12=50, full48=50, empty48=30)


# --- Excluded activities ─────────────────────────────────────────────────────
# None of these should change any inventory count.

class TestInventoryExcluded:
    def test_payment_from_customer_excluded(self, client, baseline):
        post_payment_from_customer(
            client, baseline["customer_a_id"],
            amount=500,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)

    def test_payout_to_customer_excluded(self, client, baseline):
        post_payout_to_customer(
            client, baseline["customer_c_id"],
            amount=100,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)

    def test_customer_balance_adjustment_excluded(self, client, baseline):
        post_customer_balance_adjustment(
            client, baseline["customer_a_id"],
            money_balance=700, cylinder_balance_12kg=7, cylinder_balance_48kg=0,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)

    def test_payment_to_company_excluded(self, client, baseline):
        post_payment_to_company(
            client, amount=500,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)

    def test_company_balance_adjustment_excluded(self, client, baseline):
        post_company_balance_adjustment(
            client,
            money_balance=500, cylinder_balance_12=0, cylinder_balance_48=0,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)

    def test_expense_excluded(self, client, baseline):
        post_expense(
            client, baseline["expense_category_id"],
            amount=100,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)

    def test_wallet_to_bank_excluded(self, client, baseline):
        post_wallet_to_bank(
            client, amount=200,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)

    def test_bank_to_wallet_excluded(self, client, baseline):
        post_bank_to_wallet(
            client, amount=100,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)

    def test_wallet_adjustment_excluded(self, client, baseline):
        post_wallet_adjustment(
            client, delta_cash=500,
            happened_at=at(DAY1),
        )
        _assert_inv(client, full12=100, empty12=50, full48=50, empty48=30)


# --- Cumulative ───────────────────────────────────────────────────────────────

class TestInventoryCumulative:
    def test_mixed_activities_accumulate(self, client, baseline):
        # replacement 12kg: installed=3, received=2 → full12=97, empty12=52
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=300,
            happened_at=at(DAY1, 9, 0),
        )
        # sell full 48kg: installed=2 → full48=48
        post_sell_full(
            client, baseline["customer_c_id"], baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=2,
            price_total=400, paid_amount=400,
            happened_at=at(DAY1, 9, 1),
        )
        # refill: buy12=10, return12=5, buy48=4, return48=2
        # → full12=107, empty12=47, full48=52, empty48=28
        post_refill(
            client,
            buy12=10, return12=5,
            buy48=4, return48=2,
            total_cost=800, paid_amount=800,
            happened_at=at(DAY1, 9, 2),
        )
        # buy empty 12kg: received=3 → empty12=50
        post_buy_empty(
            client, baseline["customer_c_id"], "12kg",
            cylinders_received=3,
            price_total=30, paid_amount=30,
            happened_at=at(DAY1, 9, 3),
        )
        # inventory adjustment 48kg: delta_full=+2, delta_empty=+1 → full48=54, empty48=29
        post_inventory_adjustment(
            client, gas_type="48kg",
            delta_full=2, delta_empty=1,
            happened_at=at(DAY1, 9, 4),
        )
        # Final: full12=107, empty12=50, full48=54, empty48=29
        _assert_inv(client, full12=107, empty12=50, full48=54, empty48=29)
