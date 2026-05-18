from __future__ import annotations

import pytest

from .helpers import (
    DAY1,
    at,
    get_customer_balances,
    post_replacement,
    post_sell_full,
    post_buy_empty,
    post_payment_from_customer,
    post_payout_to_customer,
    post_return_empties_from_customer,
    post_customer_balance_adjustment,
)


def _assert_balances(client, customer_id, *, money, cyl12, cyl48):
    b = get_customer_balances(client, customer_id)
    assert b["money_balance"] == money, f"money_balance: expected {money}, got {b['money_balance']}"
    assert b["cylinder_balance_12kg"] == cyl12, f"cyl12: expected {cyl12}, got {b['cylinder_balance_12kg']}"
    assert b["cylinder_balance_48kg"] == cyl48, f"cyl48: expected {cyl48}, got {b['cylinder_balance_48kg']}"


# --- Baseline sanity ─────────────────────────────────────────────────────────

class TestBaselineBalances:
    def test_customer_a_baseline(self, client, baseline):
        # Customer A starts with money=500 debt, 12kg=5 owed, 48kg=0
        _assert_balances(client, baseline["customer_a_id"], money=500, cyl12=5, cyl48=0)

    def test_customer_b_baseline(self, client, baseline):
        # Customer B starts with money=-200 (we owe them), 12kg=-3, 48kg=0
        _assert_balances(client, baseline["customer_b_id"], money=-200, cyl12=-3, cyl48=0)

    def test_customer_c_baseline(self, client, baseline):
        # Customer C starts at zero
        _assert_balances(client, baseline["customer_c_id"], money=0, cyl12=0, cyl48=0)


# --- Replacement ─────────────────────────────────────────────────────────────

class TestReplacement:
    def test_replacement_12kg_partial_payment(self, client, baseline):
        # Install 3, receive 2 back → customer owes 1 empty
        # price=300, paid=100 → customer owes 200 more money
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=100,
            happened_at=at(DAY1),
        )
        # money: 0 + (300 - 100) = 200
        # cyl12: 0 + (3 - 2) = 1
        _assert_balances(client, baseline["customer_c_id"], money=200, cyl12=1, cyl48=0)

    def test_replacement_12kg_full_payment(self, client, baseline):
        # Fully paid → no new money debt
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=2, cylinders_received=2,
            price_total=200, paid_amount=200,
            happened_at=at(DAY1),
        )
        # money: 0 + 0 = 0; cyl12: 0 + (2 - 2) = 0
        _assert_balances(client, baseline["customer_c_id"], money=0, cyl12=0, cyl48=0)

    def test_replacement_48kg_partial_payment(self, client, baseline):
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=2, cylinders_received=1,
            price_total=500, paid_amount=200,
            happened_at=at(DAY1),
        )
        # money: 0 + (500 - 200) = 300; cyl48: 0 + (2 - 1) = 1
        _assert_balances(client, baseline["customer_c_id"], money=300, cyl12=0, cyl48=1)

    def test_replacement_adds_to_existing_balance(self, client, baseline):
        # Customer A already has money=500, cyl12=5
        post_replacement(
            client, baseline["customer_a_id"], baseline["customer_a_system_12kg"],
            "12kg", cylinders_installed=4, cylinders_received=3,
            price_total=400, paid_amount=100,
            happened_at=at(DAY1),
        )
        # money: 500 + (400 - 100) = 800; cyl12: 5 + (4 - 3) = 6
        _assert_balances(client, baseline["customer_a_id"], money=800, cyl12=6, cyl48=0)

    def test_replacement_does_not_affect_other_customer(self, client, baseline):
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=2, cylinders_received=1,
            price_total=200, paid_amount=0,
            happened_at=at(DAY1),
        )
        # Customer A untouched
        _assert_balances(client, baseline["customer_a_id"], money=500, cyl12=5, cyl48=0)


# --- Sell full ───────────────────────────────────────────────────────────────

class TestSellFull:
    def test_sell_full_12kg_partial_payment(self, client, baseline):
        # Sell 3 full cylinders, no empties returned (sell_full takes no cylinders back)
        post_sell_full(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3,
            price_total=300, paid_amount=100,
            happened_at=at(DAY1),
        )
        # money: 0 + (300 - 100) = 200; cylinders unchanged
        _assert_balances(client, baseline["customer_c_id"], money=200, cyl12=0, cyl48=0)

    def test_sell_full_48kg_partial_payment(self, client, baseline):
        post_sell_full(
            client, baseline["customer_c_id"], baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=2,
            price_total=600, paid_amount=200,
            happened_at=at(DAY1),
        )
        # money: 0 + (600 - 200) = 400; cylinders unchanged
        _assert_balances(client, baseline["customer_c_id"], money=400, cyl12=0, cyl48=0)

    def test_sell_full_does_not_change_cylinder_balance(self, client, baseline):
        post_sell_full(
            client, baseline["customer_a_id"], baseline["customer_a_system_12kg"],
            "12kg", cylinders_installed=5,
            price_total=500, paid_amount=0,
            happened_at=at(DAY1),
        )
        # cyl12 stays at 5 — sell_full does not track cylinder exchange
        _assert_balances(client, baseline["customer_a_id"], money=1000, cyl12=5, cyl48=0)


# --- Buy empty ───────────────────────────────────────────────────────────────

class TestBuyEmpty:
    def test_buy_empty_12kg_partial_payment(self, client, baseline):
        # Distributor buys empties FROM customer C — customer receives money
        # price=100, paid=40 → customer gets 40 now, we owe them 60 more → money -= 60
        post_buy_empty(
            client, baseline["customer_c_id"], "12kg",
            cylinders_received=5,
            price_total=100, paid_amount=40,
            happened_at=at(DAY1),
        )
        # money: 0 - (100 - 40) = -60; cylinders UNCHANGED (purchase, not return)
        _assert_balances(client, baseline["customer_c_id"], money=-60, cyl12=0, cyl48=0)

    def test_buy_empty_48kg_partial_payment(self, client, baseline):
        post_buy_empty(
            client, baseline["customer_c_id"], "48kg",
            cylinders_received=3,
            price_total=150, paid_amount=150,
            happened_at=at(DAY1),
        )
        # money: 0 - (150 - 150) = 0; cylinders unchanged
        _assert_balances(client, baseline["customer_c_id"], money=0, cyl12=0, cyl48=0)

    def test_buy_empty_does_not_change_cylinder_balance(self, client, baseline):
        # This is the key rule: buying empties is a purchase, not a cylinder return
        post_buy_empty(
            client, baseline["customer_c_id"], "12kg",
            cylinders_received=10,
            price_total=200, paid_amount=0,
            happened_at=at(DAY1),
        )
        # cyl12 stays 0 regardless of how many empties were bought
        _assert_balances(client, baseline["customer_c_id"], money=-200, cyl12=0, cyl48=0)


# --- Payment from customer ───────────────────────────────────────────────────

class TestPaymentFromCustomer:
    def test_payment_reduces_money_debt(self, client, baseline):
        # Customer A owes 500; pays 200
        post_payment_from_customer(client, baseline["customer_a_id"], amount=200, happened_at=at(DAY1))
        # money: 500 - 200 = 300; cylinders unchanged
        _assert_balances(client, baseline["customer_a_id"], money=300, cyl12=5, cyl48=0)

    def test_payment_does_not_affect_cylinders(self, client, baseline):
        post_payment_from_customer(client, baseline["customer_a_id"], amount=500, happened_at=at(DAY1))
        # Fully paid — cyl12 still 5
        _assert_balances(client, baseline["customer_a_id"], money=0, cyl12=5, cyl48=0)

    def test_payment_overpayment_goes_negative(self, client, baseline):
        post_payment_from_customer(client, baseline["customer_a_id"], amount=700, happened_at=at(DAY1))
        # money: 500 - 700 = -200 (we now owe them)
        _assert_balances(client, baseline["customer_a_id"], money=-200, cyl12=5, cyl48=0)

    def test_payment_does_not_affect_other_customer(self, client, baseline):
        post_payment_from_customer(client, baseline["customer_a_id"], amount=500, happened_at=at(DAY1))
        _assert_balances(client, baseline["customer_c_id"], money=0, cyl12=0, cyl48=0)


# --- Payout to customer ──────────────────────────────────────────────────────

class TestPayoutToCustomer:
    def test_payout_increases_money_owed(self, client, baseline):
        # We pay out 100 to customer C (zero balance) → we now owe them 100 → money = -100
        post_payout_to_customer(client, baseline["customer_c_id"], amount=100, happened_at=at(DAY1))
        # money: 0 + 100 = +100 on our books... wait — payout means we give them money
        # → they no longer owe us, we owe them → money goes more negative
        # Payout to customer reduces what they owe us: money -= amount? No.
        # Payout = distributor gives money to customer → customer's debt decreases (or goes negative)
        # It is the opposite of payment_from_customer
        # payment_from_customer: money -= amount (customer pays us, debt decreases)
        # payout_to_customer: money += amount (we pay them, debt increases — we owe them more)
        _assert_balances(client, baseline["customer_c_id"], money=100, cyl12=0, cyl48=0)

    def test_payout_does_not_affect_cylinders(self, client, baseline):
        post_payout_to_customer(client, baseline["customer_a_id"], amount=50, happened_at=at(DAY1))
        # money: 500 + 50 = 550; cyl12 unchanged
        _assert_balances(client, baseline["customer_a_id"], money=550, cyl12=5, cyl48=0)


# --- Return empties from customer ────────────────────────────────────────────

class TestReturnEmpties:
    def test_return_12kg_reduces_cylinder_debt(self, client, baseline):
        # Customer A owes 5 empties 12kg; returns 3
        post_return_empties_from_customer(
            client, baseline["customer_a_id"],
            qty_12kg=3, qty_48kg=0,
            happened_at=at(DAY1),
        )
        # cyl12: 5 - 3 = 2; money unchanged
        _assert_balances(client, baseline["customer_a_id"], money=500, cyl12=2, cyl48=0)

    def test_return_48kg_reduces_cylinder_debt(self, client, baseline):
        post_return_empties_from_customer(
            client, baseline["customer_c_id"],
            qty_12kg=0, qty_48kg=2,
            happened_at=at(DAY1),
        )
        # cyl48: 0 - 2 = -2 (we now owe them full cylinders)
        _assert_balances(client, baseline["customer_c_id"], money=0, cyl12=0, cyl48=-2)

    def test_return_both_gas_types(self, client, baseline):
        # Give customer C some cylinder debt first via replacement
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=4, cylinders_received=0,
            price_total=400, paid_amount=400,
            happened_at=at(DAY1, 9, 0),
        )
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=3, cylinders_received=0,
            price_total=300, paid_amount=300,
            happened_at=at(DAY1, 9, 1),
        )
        post_return_empties_from_customer(
            client, baseline["customer_c_id"],
            qty_12kg=2, qty_48kg=1,
            happened_at=at(DAY1, 9, 2),
        )
        # cyl12: 0+4-2=2; cyl48: 0+3-1=2; money: 0
        _assert_balances(client, baseline["customer_c_id"], money=0, cyl12=2, cyl48=2)

    def test_return_does_not_affect_money(self, client, baseline):
        post_return_empties_from_customer(
            client, baseline["customer_a_id"],
            qty_12kg=5, qty_48kg=0,
            happened_at=at(DAY1),
        )
        # money stays 500
        _assert_balances(client, baseline["customer_a_id"], money=500, cyl12=0, cyl48=0)


# --- Customer balance adjustment ─────────────────────────────────────────────

class TestCustomerBalanceAdjustment:
    def test_adjustment_adds_to_all_dimensions(self, client, baseline):
        post_customer_balance_adjustment(
            client, baseline["customer_c_id"],
            amount_money=300, count_12kg=2, count_48kg=1,
            happened_at=at(DAY1),
        )
        _assert_balances(client, baseline["customer_c_id"], money=300, cyl12=2, cyl48=1)

    def test_adjustment_negative_values(self, client, baseline):
        post_customer_balance_adjustment(
            client, baseline["customer_a_id"],
            amount_money=-100, count_12kg=-2, count_48kg=0,
            happened_at=at(DAY1),
        )
        # money: 500 + (-100) = 400; cyl12: 5 + (-2) = 3
        _assert_balances(client, baseline["customer_a_id"], money=400, cyl12=3, cyl48=0)

