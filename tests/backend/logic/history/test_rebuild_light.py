from __future__ import annotations

import pytest

from ..helpers import (
    DAY1,
    DAY2,
    DAY3,
    at,
    get_company_balances,
    get_customer_balances,
    get_daily_card,
    post_bank_to_wallet,
    post_buy_empty,
    post_buy_full_from_company,
    post_company_balance_adjustment,
    post_customer_balance_adjustment,
    post_expense,
    post_inventory_adjustment,
    post_payment_from_company,
    post_payment_from_customer,
    post_payment_to_company,
    post_payout_to_customer,
    post_return_empties_from_customer,
    post_return_empties_to_company,
    post_wallet_adjustment,
    post_wallet_to_bank,
)
from .helpers import (
    delete_bank_deposit,
    delete_buy_iron,
    delete_collection,
    delete_company_balance_adjustment,
    delete_company_payment,
    delete_customer_adjustment,
    delete_cylinder_settle,
    delete_expense,
    delete_inventory_adjustment,
    delete_order,
    delete_wallet_adjustment,
    take_snapshot,
)


def _snap(client, world) -> dict:
    return take_snapshot(
        client,
        customer_a_id=world["customer_a_id"],
        customer_b_id=world["customer_b_id"],
        customer_c_id=world["customer_c_id"],
    )


# World baselines (verified by sanity tests):
#   wallet:     DAY1=670, DAY2=500, DAY3=350
#   net_today:  DAY1=170
#   inventory DAY1: full12=110, empty12=47, full48=50, empty48=30
#   inventory DAY2: full12=115, empty12=50, full48=48, empty48=30
#   inventory DAY3: full12=112, empty12=49, full48=53, empty48=30
#   Customer C final: money=50, cyl_12=0, cyl_48=0
#   Company final:    money=1700, cyl_12=-2, cyl_48=0
#
# Insertion slot: DAY1 09:15 (between 09:00 and 09:30)
# Customer C is the same-customer target (09:45 involves C).


# --- payment_from_customer ────────────────────────────────────────────────────
#
# Customer C pays us 100.
# Wallet +100 all days. Customer C money −100. Included in net_today.

class TestInsertPaymentFromCustomerCascade:
    def _insert(self, client, world) -> dict:
        return post_payment_from_customer(
            client, world["customer_c_id"], amount=100,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 + 100
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 + 100
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 + 100

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_collection(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["customer_c"]["money_balance"] == snap["customer_c"]["money_balance"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- payout_to_customer ───────────────────────────────────────────────────────
#
# We pay Customer C 50.
# Wallet −50 all days. Customer C money +50. Included in net_today.

class TestInsertPayoutToCustomerCascade:
    def _insert(self, client, world) -> dict:
        return post_payout_to_customer(
            client, world["customer_c_id"], amount=50,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 - 50
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 - 50
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 - 50

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_collection(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["customer_c"]["money_balance"] == snap["customer_c"]["money_balance"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- payment_to_company ───────────────────────────────────────────────────────
#
# We pay the company 100.
# Wallet −100 all days. Company money −100. Excluded from net_today.

class TestInsertPaymentToCompanyCascade:
    def _insert(self, client, world) -> dict:
        return post_payment_to_company(
            client, amount=100,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 - 100
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 - 100
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 - 100

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_company_payment(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["company"]["company_money"] == snap["company"]["company_money"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- payment_from_company ─────────────────────────────────────────────────────
#
# Company pays us 100.
# Wallet +100 all days. Company money −100. Excluded from net_today.

class TestInsertPaymentFromCompanyCascade:
    def _insert(self, client, world) -> dict:
        return post_payment_from_company(
            client, amount=100,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 + 100
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 + 100
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 + 100

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_company_payment(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["company"]["company_money"] == snap["company"]["company_money"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- expense ──────────────────────────────────────────────────────────────────
#
# Expense of 50.
# Wallet −50 all days. Included in net_today.

class TestInsertExpenseCascade:
    def _insert(self, client, world) -> dict:
        return post_expense(
            client, world["expense_category_id"], amount=50,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 - 50
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 - 50
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 - 50

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_expense(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- wallet_to_bank ───────────────────────────────────────────────────────────
#
# Transfer 100 from wallet to bank.
# Wallet −100 all days. net_today unchanged (excluded).

class TestInsertWalletToBankCascade:
    def _insert(self, client, world) -> dict:
        return post_wallet_to_bank(
            client, amount=100,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_shifts_but_not_net_today(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 - 100
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 - 100
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 - 100
        assert get_daily_card(client, DAY1)["net_today"] == 170

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_bank_deposit(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["day1_card"]["net_today"] == snap["day1_card"]["net_today"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- bank_to_wallet ───────────────────────────────────────────────────────────
#
# Transfer 100 from bank to wallet.
# Wallet +100 all days. net_today unchanged (excluded).

class TestInsertBankToWalletCascade:
    def _insert(self, client, world) -> dict:
        return post_bank_to_wallet(
            client, amount=100,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_shifts_but_not_net_today(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 + 100
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 + 100
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 + 100
        assert get_daily_card(client, DAY1)["net_today"] == 170

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_bank_deposit(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["day1_card"]["net_today"] == snap["day1_card"]["net_today"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- wallet_adjustment ────────────────────────────────────────────────────────
#
# Wallet adjustment of +100.
# Wallet +100 all days. net_today unchanged (excluded).

class TestInsertWalletAdjustmentCascade:
    def _insert(self, client, world) -> dict:
        return post_wallet_adjustment(
            client, delta_cash=100,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_shifts_but_not_net_today(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 + 100
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 + 100
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 + 100
        assert get_daily_card(client, DAY1)["net_today"] == 170

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_wallet_adjustment(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["day1_card"]["net_today"] == snap["day1_card"]["net_today"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- buy_empty ────────────────────────────────────────────────────────────────
#
# Buy 3 empty 12kg cylinders from Customer A, pay 60.
# Wallet −60 all days. Inventory empty12 +3 on all days.
# Customer balance unchanged (cash purchase, not a debt settlement).
# Included in net_today.

class TestInsertBuyEmptyCascade:
    def _insert(self, client, world) -> dict:
        return post_buy_empty(
            client, world["customer_a_id"], "12kg",
            cylinders_received=3, price_total=60, paid_amount=60,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_and_inventory_shift(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 - 60
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 - 60
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 - 60
        assert get_daily_card(client, DAY1)["inventory_end"]["empty12"] == 47 + 3

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_order(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["day1_card"]["inventory_end"]["empty12"] == snap["day1_card"]["inventory_end"]["empty12"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- return_empties_from_customer ─────────────────────────────────────────────
#
# Customer C returns 2 empty 12kg cylinders (settling cylinder debt).
# No wallet effect. Inventory empty12 +2 on all days. Customer C cyl_12 −2.

class TestInsertReturnEmptiesFromCustomerCascade:
    def _insert(self, client, world) -> dict:
        return post_return_empties_from_customer(
            client, world["customer_c_id"], qty_12kg=2, qty_48kg=0,
            happened_at=at(DAY1, 9, 15),
        )

    def test_inventory_and_customer_cyl_shift(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["inventory_end"]["empty12"] == 47 + 2
        b = get_customer_balances(client, world["customer_c_id"])
        assert b["cylinder_balance_12kg"] == 0 - 2

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_collection(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["inventory_end"]["empty12"] == snap["day1_card"]["inventory_end"]["empty12"]
        assert after["customer_c"]["cylinder_balance_12kg"] == snap["customer_c"]["cylinder_balance_12kg"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- buy_iron (buy_full_from_company) ─────────────────────────────────────────
#
# Buy 3 full 12kg cylinders from the company, fully paid (150).
# Wallet −150 all days. Inventory full12 +3 on all days.
# Company money unchanged (fully paid). Excluded from net_today.

class TestInsertBuyIronCascade:
    def _insert(self, client, world) -> dict:
        return post_buy_full_from_company(
            client, new12=3, new48=0,
            total_cost=150, paid_amount=150,
            happened_at=at(DAY1, 9, 15),
        )

    def test_wallet_and_inventory_shift(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 - 150
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 - 150
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 - 150
        assert get_daily_card(client, DAY1)["inventory_end"]["full12"] == 110 + 3

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_buy_iron(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["day1_card"]["inventory_end"]["full12"] == snap["day1_card"]["inventory_end"]["full12"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- return_empties_to_company ────────────────────────────────────────────────
#
# Return 2 empty 12kg cylinders to the company.
# No wallet effect. Inventory empty12 −2 on all days. Company cyl_12 +2.

class TestInsertReturnEmptiesToCompanyCascade:
    def _insert(self, client, world) -> dict:
        return post_return_empties_to_company(
            client, gas_type="12kg", quantity=2,
            happened_at=at(DAY1, 9, 15),
        )

    def test_inventory_and_company_cyl_shift(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["inventory_end"]["empty12"] == 47 - 2
        b = get_company_balances(client)
        assert b["company_cyl_12"] == -2 + 2

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_cylinder_settle(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["inventory_end"]["empty12"] == snap["day1_card"]["inventory_end"]["empty12"]
        assert after["company"]["company_cyl_12"] == snap["company"]["company_cyl_12"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- inventory_adjustment ─────────────────────────────────────────────────────
#
# Inventory adjustment: +5 full 12kg.
# No wallet effect. Inventory full12 +5 cascades through DAY1, DAY2, DAY3.

class TestInsertInventoryAdjustmentCascade:
    def _insert(self, client, world) -> dict:
        return post_inventory_adjustment(
            client, gas_type="12kg", delta_full=5, delta_empty=0,
            happened_at=at(DAY1, 9, 15),
        )

    def test_inventory_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["inventory_end"]["full12"] == 110 + 5
        assert get_daily_card(client, DAY2)["inventory_end"]["full12"] == 115 + 5
        assert get_daily_card(client, DAY3)["inventory_end"]["full12"] == 112 + 5

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_inventory_adjustment(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["inventory_end"]["full12"] == snap["day1_card"]["inventory_end"]["full12"]
        assert after["day2_card"]["inventory_end"]["full12"] == snap["day2_card"]["inventory_end"]["full12"]
        assert after["day3_card"]["inventory_end"]["full12"] == snap["day3_card"]["inventory_end"]["full12"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- customer_adjustment ──────────────────────────────────────────────────────
#
# Adjust Customer C money balance by +50.
# No wallet effect. Customer C money +50.

class TestInsertCustomerAdjustmentCascade:
    def _insert(self, client, world) -> dict:
        return post_customer_balance_adjustment(
            client, world["customer_c_id"],
            money_balance=100, cylinder_balance_12kg=0, cylinder_balance_48kg=0,
            happened_at=at(DAY1, 9, 15),
        )

    def test_customer_balance_shifts(self, client, world):
        self._insert(client, world)
        b = get_customer_balances(client, world["customer_c_id"])
        assert b["money_balance"] == 50 + 50

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_customer_adjustment(client, result["id"])
        after = _snap(client, world)
        assert after["customer_c"]["money_balance"] == snap["customer_c"]["money_balance"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- company_balance_adjustment ───────────────────────────────────────────────
#
# Adjust company money balance by +100.
# No wallet effect. Company money +100.

class TestInsertCompanyBalanceAdjustmentCascade:
    def _insert(self, client, world) -> dict:
        # money_balance is an absolute SET at the adjustment point.
        # Company balance at DAY1 09:15 = 2000 (set on DAY0, no prior DAY1 transactions).
        # Setting to 2100 shifts the balance by +100, making final company_money = 1700 + 100.
        return post_company_balance_adjustment(
            client,
            money_balance=2100, cylinder_balance_12=0, cylinder_balance_48=0,
            happened_at=at(DAY1, 9, 15),
        )

    def test_company_balance_shifts(self, client, world):
        self._insert(client, world)
        b = get_company_balances(client)
        assert b["company_money"] == 1700 + 100

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_company_balance_adjustment(client, result["id"])
        after = _snap(client, world)
        assert after["company"]["company_money"] == snap["company"]["company_money"]
        assert len(after["day1_events"]) == len(snap["day1_events"])
