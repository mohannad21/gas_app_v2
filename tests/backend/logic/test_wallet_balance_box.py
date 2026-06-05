from __future__ import annotations

from .helpers import (
    DAY1,
    at,
    get_day_report,
    post_replacement,
    post_sell_full,
    post_buy_empty,
    post_payment_from_customer,
    post_payout_to_customer,
    post_return_empties_from_customer,
    post_return_empties_to_company,
    post_refill,
    post_buy_full_from_company,
    post_payment_to_company,
    post_payment_from_company,
    post_expense,
    post_wallet_to_bank,
    post_bank_to_wallet,
    post_wallet_adjustment,
    post_inventory_adjustment,
    post_customer_balance_adjustment,
    post_company_balance_adjustment,
)


def _wallet_end(client, date=DAY1) -> int:
    return get_day_report(client, date)["wallet_end"]


# --- Non-cash activities must not affect wallet ───────────────────────────────

class TestWalletUnchangedByNonCashActivities:
    def test_return_empties_from_customer(self, client, shared_baseline):
        post_return_empties_from_customer(
            client, shared_baseline["customer_a_id"],
            qty_12kg=3, qty_48kg=0,
            happened_at=at(DAY1),
        )
        assert _wallet_end(client) == 1000

    def test_return_empties_to_company(self, client, shared_baseline):
        # First create cylinder debt so the return is valid
        post_refill(
            client,
            buy12=5, return12=0,
            buy48=0, return48=0,
            total_cost=0, paid_amount=0,
            happened_at=at(DAY1, 9, 0),
        )
        post_return_empties_to_company(
            client, gas_type="12kg", quantity=3,
            happened_at=at(DAY1, 9, 1),
        )
        # refill had paid=0 so wallet unchanged; return empties has no cash effect
        assert _wallet_end(client) == 1000

    def test_inventory_adjustment(self, client, shared_baseline):
        post_inventory_adjustment(
            client, gas_type="12kg",
            delta_full=10, delta_empty=-5,
            happened_at=at(DAY1),
        )
        assert _wallet_end(client) == 1000

    def test_customer_balance_adjustment(self, client, shared_baseline):
        post_customer_balance_adjustment(
            client, shared_baseline["customer_a_id"],
            money_balance=700, cylinder_balance_12kg=7, cylinder_balance_48kg=0,
            happened_at=at(DAY1),
        )
        assert _wallet_end(client) == 1000

    def test_company_balance_adjustment(self, client, shared_baseline):
        post_company_balance_adjustment(
            client,
            money_balance=3000, cylinder_balance_12=5, cylinder_balance_48=0,
            happened_at=at(DAY1),
        )
        assert _wallet_end(client) == 1000


# --- Wallet accumulates correctly across all cash-affecting activities ─────────

class TestWalletCumulative:
    def test_all_cash_activities_in_one_day(self, client, shared_baseline):
        # Baseline wallet: 1000
        # Each step shows running wallet after the activity.

        # 1. Replacement: paid=100 → wallet += 100 → 1100
        post_replacement(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=100,
            happened_at=at(DAY1, 9, 0),
        )

        # 2. Sell full: paid=200 → wallet += 200 → 1300
        post_sell_full(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=2,
            price_total=400, paid_amount=200,
            happened_at=at(DAY1, 9, 1),
        )

        # 3. Buy empty: paid=50 → wallet -= 50 → 1250
        post_buy_empty(
            client, shared_baseline["customer_c_id"], "12kg",
            cylinders_received=5,
            price_total=100, paid_amount=50,
            happened_at=at(DAY1, 9, 2),
        )

        # 4. Payment from customer: amount=150 → wallet += 150 → 1400
        post_payment_from_customer(
            client, shared_baseline["customer_a_id"],
            amount=150,
            happened_at=at(DAY1, 9, 3),
        )

        # 5. Payout to customer: amount=80 → wallet -= 80 → 1320
        post_payout_to_customer(
            client, shared_baseline["customer_c_id"],
            amount=80,
            happened_at=at(DAY1, 9, 4),
        )

        # 6. Refill: paid=200 → wallet -= 200 → 1120
        post_refill(
            client,
            buy12=10, return12=5,
            buy48=0, return48=0,
            total_cost=500, paid_amount=200,
            happened_at=at(DAY1, 9, 5),
        )

        # 7. Buy full from company: paid=150 → wallet -= 150 → 970
        post_buy_full_from_company(
            client,
            new12=3, new48=0,
            total_cost=300, paid_amount=150,
            happened_at=at(DAY1, 9, 6),
        )

        # 8. Payment to company: amount=100 → wallet -= 100 → 870
        post_payment_to_company(
            client, amount=100,
            happened_at=at(DAY1, 9, 7),
        )

        # 9. Payment from company (receive): amount=50 → wallet += 50 → 920
        post_payment_from_company(
            client, amount=50,
            happened_at=at(DAY1, 9, 8),
        )

        # 10. Expense: amount=75 → wallet -= 75 → 845
        post_expense(
            client, shared_baseline["expense_category_id"],
            amount=75,
            happened_at=at(DAY1, 9, 9),
        )

        # 11. Wallet to bank: amount=100 → wallet -= 100 → 745
        post_wallet_to_bank(
            client, amount=100,
            happened_at=at(DAY1, 9, 10),
        )

        # 12. Bank to wallet: amount=60 → wallet += 60 → 805
        post_bank_to_wallet(
            client, amount=60,
            happened_at=at(DAY1, 9, 11),
        )

        # 13. Wallet adjustment: delta=+200 → wallet += 200 → 1005
        post_wallet_adjustment(
            client, delta_cash=200,
            happened_at=at(DAY1, 9, 12),
        )

        # Final: 1000 +100 +200 -50 +150 -80 -200 -150 -100 +50 -75 -100 +60 +200 = 1005
        assert _wallet_end(client) == 1005
