from __future__ import annotations

import pytest

from .helpers import (
    DAY1,
    at,
    get_company_balances,
    post_refill,
    post_buy_full_from_company,
    post_return_empties_to_company,
    post_payment_to_company,
    post_payment_from_company,
    post_company_balance_adjustment,
)


def _assert_company(client, *, money, cyl12, cyl48):
    b = get_company_balances(client)
    assert b["company_money"] == money, f"company_money: expected {money}, got {b['company_money']}"
    assert b["company_cyl_12"] == cyl12, f"company_cyl_12: expected {cyl12}, got {b['company_cyl_12']}"
    assert b["company_cyl_48"] == cyl48, f"company_cyl_48: expected {cyl48}, got {b['company_cyl_48']}"


# --- Baseline sanity ─────────────────────────────────────────────────────────

class TestBaselineCompany:
    def test_company_baseline(self, client, baseline):
        # Baseline: we owe company 2000, no cylinder debt
        _assert_company(client, money=2000, cyl12=0, cyl48=0)


# --- Refill ──────────────────────────────────────────────────────────────────
# Cylinder sign: negative = we owe the company cylinders (took more than returned)

class TestRefill:
    def test_refill_partial_payment_increases_money_debt(self, client, baseline):
        post_refill(
            client,
            buy12=10, return12=5,
            buy48=4, return48=2,
            total_cost=1000, paid_amount=400,
            happened_at=at(DAY1),
        )
        # money: 2000 + (1000 - 400) = 2600
        # cyl12: return12 - buy12 = 5 - 10 = -5
        # cyl48: return48 - buy48 = 2 - 4 = -2
        _assert_company(client, money=2600, cyl12=-5, cyl48=-2)

    def test_refill_full_payment_no_money_change(self, client, baseline):
        post_refill(
            client,
            buy12=6, return12=6,
            buy48=3, return48=3,
            total_cost=800, paid_amount=800,
            happened_at=at(DAY1),
        )
        # money: 2000; cyl12: 6-6=0; cyl48: 3-3=0
        _assert_company(client, money=2000, cyl12=0, cyl48=0)

    def test_refill_no_return_max_cylinder_debt(self, client, baseline):
        post_refill(
            client,
            buy12=8, return12=0,
            buy48=0, return48=0,
            total_cost=400, paid_amount=0,
            happened_at=at(DAY1),
        )
        # money: 2000 + 400 = 2400; cyl12: 0 - 8 = -8
        _assert_company(client, money=2400, cyl12=-8, cyl48=0)

    def test_refill_only_12kg(self, client, baseline):
        post_refill(
            client,
            buy12=5, return12=2,
            buy48=0, return48=0,
            total_cost=300, paid_amount=100,
            happened_at=at(DAY1),
        )
        # money: 2000 + 200 = 2200; cyl12: 2 - 5 = -3
        _assert_company(client, money=2200, cyl12=-3, cyl48=0)

    def test_refill_only_48kg(self, client, baseline):
        post_refill(
            client,
            buy12=0, return12=0,
            buy48=3, return48=1,
            total_cost=600, paid_amount=300,
            happened_at=at(DAY1),
        )
        # money: 2000 + 300 = 2300; cyl48: 1 - 3 = -2
        _assert_company(client, money=2300, cyl12=0, cyl48=-2)


# --- Buy full from company ───────────────────────────────────────────────────
# buy_iron is an outright purchase — no cylinder exchange, no cylinder debt created

class TestBuyFullFromCompany:
    def test_buy_full_partial_payment(self, client, baseline):
        post_buy_full_from_company(
            client,
            new12=5, new48=2,
            total_cost=700, paid_amount=300,
            happened_at=at(DAY1),
        )
        # money: 2000 + (700 - 300) = 2400; cylinders unaffected
        _assert_company(client, money=2400, cyl12=0, cyl48=0)

    def test_buy_full_no_payment(self, client, baseline):
        post_buy_full_from_company(
            client,
            new12=3, new48=0,
            total_cost=300, paid_amount=0,
            happened_at=at(DAY1),
        )
        # money: 2000 + 300 = 2300; cylinders unaffected
        _assert_company(client, money=2300, cyl12=0, cyl48=0)

    def test_buy_full_full_payment(self, client, baseline):
        post_buy_full_from_company(
            client,
            new12=4, new48=1,
            total_cost=500, paid_amount=500,
            happened_at=at(DAY1),
        )
        # money: 2000 + 0 = 2000; cylinders unaffected
        _assert_company(client, money=2000, cyl12=0, cyl48=0)

    def test_buy_full_only_48kg(self, client, baseline):
        post_buy_full_from_company(
            client,
            new12=0, new48=3,
            total_cost=600, paid_amount=200,
            happened_at=at(DAY1),
        )
        # money: 2000 + 400 = 2400; cylinders unaffected
        _assert_company(client, money=2400, cyl12=0, cyl48=0)


# --- Return empties to company ───────────────────────────────────────────────

class TestReturnEmptiesToCompany:
    def test_return_12kg_reduces_cylinder_debt(self, client, baseline):
        # Create cylinder debt via refill: take 10, return 0 → cyl12 = -10
        post_refill(
            client,
            buy12=10, return12=0,
            buy48=0, return48=0,
            total_cost=500, paid_amount=500,
            happened_at=at(DAY1, 9, 0),
        )
        post_return_empties_to_company(client, gas_type="12kg", quantity=4, happened_at=at(DAY1, 9, 1))
        # cyl12: -10 + 4 = -6; money unchanged at 2000
        _assert_company(client, money=2000, cyl12=-6, cyl48=0)

    def test_return_48kg_reduces_cylinder_debt(self, client, baseline):
        post_refill(
            client,
            buy12=0, return12=0,
            buy48=6, return48=0,
            total_cost=600, paid_amount=600,
            happened_at=at(DAY1, 9, 0),
        )
        post_return_empties_to_company(client, gas_type="48kg", quantity=3, happened_at=at(DAY1, 9, 1))
        # cyl48: -6 + 3 = -3; money unchanged at 2000
        _assert_company(client, money=2000, cyl12=0, cyl48=-3)

    def test_return_does_not_affect_money(self, client, baseline):
        post_refill(
            client,
            buy12=5, return12=0,
            buy48=0, return48=0,
            total_cost=500, paid_amount=500,
            happened_at=at(DAY1, 9, 0),
        )
        post_return_empties_to_company(client, gas_type="12kg", quantity=5, happened_at=at(DAY1, 9, 1))
        # cyl12 fully settled: -5 + 5 = 0; money stays 2000
        _assert_company(client, money=2000, cyl12=0, cyl48=0)


# --- Payment to company ──────────────────────────────────────────────────────

class TestPaymentToCompany:
    def test_payment_reduces_money_debt(self, client, baseline):
        post_payment_to_company(client, amount=500, happened_at=at(DAY1))
        # money: 2000 - 500 = 1500; cylinders unchanged
        _assert_company(client, money=1500, cyl12=0, cyl48=0)

    def test_payment_full_clears_debt(self, client, baseline):
        post_payment_to_company(client, amount=2000, happened_at=at(DAY1))
        # money: 2000 - 2000 = 0
        _assert_company(client, money=0, cyl12=0, cyl48=0)

    def test_payment_overpayment_goes_negative(self, client, baseline):
        post_payment_to_company(client, amount=2500, happened_at=at(DAY1))
        # money: 2000 - 2500 = -500 (company owes us)
        _assert_company(client, money=-500, cyl12=0, cyl48=0)

    def test_payment_does_not_affect_cylinders(self, client, baseline):
        post_refill(
            client,
            buy12=5, return12=0,
            buy48=0, return48=0,
            total_cost=0, paid_amount=0,
            happened_at=at(DAY1, 9, 0),
        )
        post_payment_to_company(client, amount=1000, happened_at=at(DAY1, 9, 1))
        # cyl12: 0 - 5 = -5 (refill debt); money: 2000 - 1000 = 1000
        _assert_company(client, money=1000, cyl12=-5, cyl48=0)


# --- Payment from company ────────────────────────────────────────────────────
# "Receive" is only valid when the company already owes us (balance < 0).
# The UI disables "Receive" when companyBalance >= 0.

class TestPaymentFromCompany:
    def test_receive_reduces_negative_debt(self, client, baseline):
        # First overpay to make company owe us: 2000 - 2500 = -500
        post_payment_to_company(client, amount=2500, happened_at=at(DAY1, 9, 0))
        # Company now owes us 500. We receive 300 back.
        post_payment_from_company(client, amount=300, happened_at=at(DAY1, 9, 1))
        # money: -500 + 300 = -200 (they still owe us 200)
        _assert_company(client, money=-200, cyl12=0, cyl48=0)

    def test_receive_full_amount_settles_debt(self, client, baseline):
        # Overpay by 400 → company owes us 400
        post_payment_to_company(client, amount=2400, happened_at=at(DAY1, 9, 0))
        # Receive all 400 back
        post_payment_from_company(client, amount=400, happened_at=at(DAY1, 9, 1))
        # money: -400 + 400 = 0
        _assert_company(client, money=0, cyl12=0, cyl48=0)

    def test_receive_does_not_affect_cylinders(self, client, baseline):
        # Set a state where company owes us and we have cylinder debt
        post_company_balance_adjustment(
            client,
            money_balance=-300, cylinder_balance_12=-5, cylinder_balance_48=0,
            happened_at=at(DAY1, 9, 0),
        )
        post_payment_from_company(client, amount=200, happened_at=at(DAY1, 9, 1))
        # money: -300 + 200 = -100; cylinders unchanged at -5
        _assert_company(client, money=-100, cyl12=-5, cyl48=0)


# --- Company balance adjustment ──────────────────────────────────────────────
# This endpoint SETS the balance to the target value, it does not add a delta.
# Internally it reads the current balance and posts the difference needed.

class TestCompanyBalanceAdjustment:
    def test_adjustment_sets_all_dimensions(self, client, baseline):
        post_company_balance_adjustment(
            client,
            money_balance=500, cylinder_balance_12=3, cylinder_balance_48=2,
            happened_at=at(DAY1),
        )
        # money set TO 500 (not 2000+500); cyl12 set TO 3; cyl48 set TO 2
        _assert_company(client, money=500, cyl12=3, cyl48=2)

    def test_adjustment_negative_target(self, client, baseline):
        post_company_balance_adjustment(
            client,
            money_balance=-1000, cylinder_balance_12=-2, cylinder_balance_48=0,
            happened_at=at(DAY1),
        )
        # money set TO -1000; cyl12 set TO -2
        _assert_company(client, money=-1000, cyl12=-2, cyl48=0)

    def test_adjustment_sets_not_accumulates(self, client, baseline):
        # Two adjustments: second one wins, does not stack on top of first
        post_company_balance_adjustment(
            client,
            money_balance=300, cylinder_balance_12=0, cylinder_balance_48=4,
            happened_at=at(DAY1, 9, 0),
        )
        # money set TO 300; cyl48 set TO 4
        _assert_company(client, money=300, cyl12=0, cyl48=4)
