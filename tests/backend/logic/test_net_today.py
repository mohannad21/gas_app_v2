from __future__ import annotations

from .helpers import (
    DAY0,
    DAY1,
    at,
    get_daily_card,
    post_replacement,
    post_sell_full,
    post_buy_empty,
    post_payment_from_customer,
    post_payout_to_customer,
    post_return_empties_from_customer,
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


def _net(client, date=DAY1) -> int:
    return get_daily_card(client, date)["net_today"]


# --- Contributing activities ──────────────────────────────────────────────────
# Business rule: net_today = sum of customer cash flows + expenses for the day.
# System initialization entries are excluded, so baseline net_today = 0.

class TestNetTodayContributing:
    def test_replacement_paid_contributes(self, client, baseline):
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=100,
            happened_at=at(DAY1),
        )
        assert _net(client) == 100

    def test_sell_full_paid_contributes(self, client, baseline):
        post_sell_full(
            client, baseline["customer_c_id"], baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=2,
            price_total=400, paid_amount=200,
            happened_at=at(DAY1),
        )
        assert _net(client) == 200

    def test_buy_empty_paid_reduces_net(self, client, baseline):
        # We pay the customer for their empties → net decreases
        post_buy_empty(
            client, baseline["customer_c_id"], "12kg",
            cylinders_received=5,
            price_total=100, paid_amount=50,
            happened_at=at(DAY1),
        )
        assert _net(client) == -50

    def test_payment_from_customer_contributes(self, client, baseline):
        post_payment_from_customer(
            client, baseline["customer_a_id"],
            amount=150,
            happened_at=at(DAY1),
        )
        assert _net(client) == 150

    def test_payout_to_customer_reduces_net(self, client, baseline):
        post_payout_to_customer(
            client, baseline["customer_c_id"],
            amount=80,
            happened_at=at(DAY1),
        )
        assert _net(client) == -80

    def test_expense_reduces_net(self, client, baseline):
        post_expense(
            client, baseline["expense_category_id"],
            amount=75,
            happened_at=at(DAY1),
        )
        assert _net(client) == -75


# --- Excluded activities ──────────────────────────────────────────────────────
# Business rule: company transactions, bank transfers, wallet adjustments,
# and non-cash activities must not affect net_today.

class TestNetTodayExcluded:
    def test_return_empties_from_customer_excluded(self, client, baseline):
        post_return_empties_from_customer(
            client, baseline["customer_a_id"],
            qty_12kg=3, qty_48kg=0,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_customer_balance_adjustment_excluded(self, client, baseline):
        post_customer_balance_adjustment(
            client, baseline["customer_a_id"],
            amount_money=200, count_12kg=0, count_48kg=0,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_refill_excluded(self, client, baseline):
        post_refill(
            client,
            buy12=10, return12=5,
            buy48=0, return48=0,
            total_cost=500, paid_amount=300,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_buy_iron_from_company_excluded(self, client, baseline):
        post_buy_full_from_company(
            client,
            new12=5, new48=0,
            total_cost=300, paid_amount=300,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_return_empties_to_company_excluded(self, client, baseline):
        # Create cylinder debt on DAY0 so the return on DAY1 is valid
        post_refill(
            client,
            buy12=5, return12=0,
            buy48=0, return48=0,
            total_cost=0, paid_amount=0,
            happened_at=at(DAY0),
        )
        post_return_empties_to_company(
            client, gas_type="12kg", quantity=3,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_payment_to_company_excluded(self, client, baseline):
        post_payment_to_company(
            client, amount=500,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_payment_from_company_excluded(self, client, baseline):
        # Set company balance negative on DAY0 so receive on DAY1 is valid
        post_company_balance_adjustment(
            client,
            money_balance=-500, cylinder_balance_12=0, cylinder_balance_48=0,
            happened_at=at(DAY0),
        )
        post_payment_from_company(
            client, amount=200,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_company_balance_adjustment_excluded(self, client, baseline):
        post_company_balance_adjustment(
            client,
            money_balance=500, cylinder_balance_12=0, cylinder_balance_48=0,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_wallet_to_bank_excluded(self, client, baseline):
        post_wallet_to_bank(
            client, amount=200,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_bank_to_wallet_excluded(self, client, baseline):
        post_bank_to_wallet(
            client, amount=100,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_wallet_adjustment_excluded(self, client, baseline):
        post_wallet_adjustment(
            client, delta_cash=500,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0

    def test_inventory_adjustment_excluded(self, client, baseline):
        post_inventory_adjustment(
            client, gas_type="12kg",
            delta_full=10, delta_empty=0,
            happened_at=at(DAY1),
        )
        assert _net(client) == 0


# --- Cumulative ───────────────────────────────────────────────────────────────

class TestNetTodayCumulative:
    def test_all_contributing_activities_accumulate(self, client, baseline):
        # replacement paid=100   → +100
        post_replacement(
            client, baseline["customer_c_id"], baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=100,
            happened_at=at(DAY1, 9, 0),
        )
        # sell_full paid=200     → +200
        post_sell_full(
            client, baseline["customer_c_id"], baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=2,
            price_total=400, paid_amount=200,
            happened_at=at(DAY1, 9, 1),
        )
        # buy_empty paid=50      → -50
        post_buy_empty(
            client, baseline["customer_c_id"], "12kg",
            cylinders_received=5,
            price_total=100, paid_amount=50,
            happened_at=at(DAY1, 9, 2),
        )
        # payment from customer=150  → +150
        post_payment_from_customer(
            client, baseline["customer_a_id"],
            amount=150,
            happened_at=at(DAY1, 9, 3),
        )
        # payout to customer=80  → -80
        post_payout_to_customer(
            client, baseline["customer_c_id"],
            amount=80,
            happened_at=at(DAY1, 9, 4),
        )
        # expense=75             → -75
        post_expense(
            client, baseline["expense_category_id"],
            amount=75,
            happened_at=at(DAY1, 9, 5),
        )
        # Total: 100 + 200 - 50 + 150 - 80 - 75 = 245
        assert _net(client) == 245
