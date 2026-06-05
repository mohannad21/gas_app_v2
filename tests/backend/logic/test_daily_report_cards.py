from __future__ import annotations

import pytest

from .helpers import (
    DAY1,
    at,
    get_daily_card,
    post_replacement,
    post_sell_full,
    post_buy_empty,
    post_return_empties_from_customer,
    post_payment_from_customer,
    post_refill,
    post_buy_full_from_company,
    post_inventory_adjustment,
    post_wallet_adjustment,
)


# --- sold_12kg and sold_48kg ──────────────────────────────────────────────────
# Only cylinders physically delivered to customers count as sold.
# replacement: sold += cylinders_installed
# sell_full:   sold += cylinders_installed
# buy_empty, return empties, payments, refills → do NOT contribute to sold counts

class TestSoldCylinders:
    def test_replacement_12kg_adds_to_sold_12kg(self, client, shared_baseline):
        post_replacement(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=300,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 3
        assert card["sold_48kg"] == 0

    def test_replacement_48kg_adds_to_sold_48kg(self, client, shared_baseline):
        post_replacement(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=2, cylinders_received=1,
            price_total=400, paid_amount=400,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 0
        assert card["sold_48kg"] == 2

    def test_sell_full_12kg_adds_to_sold_12kg(self, client, shared_baseline):
        post_sell_full(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=5,
            price_total=500, paid_amount=500,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 5
        assert card["sold_48kg"] == 0

    def test_sell_full_48kg_adds_to_sold_48kg(self, client, shared_baseline):
        post_sell_full(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=3,
            price_total=600, paid_amount=600,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 0
        assert card["sold_48kg"] == 3

    def test_multiple_orders_accumulate_sold_counts(self, client, shared_baseline):
        # replacement: 3x12kg installed
        post_replacement(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=300,
            happened_at=at(DAY1, 9, 0),
        )
        # sell_full: 2x12kg installed
        post_sell_full(
            client, shared_baseline["customer_a_id"], shared_baseline["customer_a_system_12kg"],
            "12kg", cylinders_installed=2,
            price_total=200, paid_amount=200,
            happened_at=at(DAY1, 9, 1),
        )
        # replacement: 1x48kg installed
        post_replacement(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_48kg"],
            "48kg", cylinders_installed=1, cylinders_received=0,
            price_total=100, paid_amount=100,
            happened_at=at(DAY1, 9, 2),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 5  # 3 + 2
        assert card["sold_48kg"] == 1

    def test_buy_empty_does_not_count_as_sold(self, client, shared_baseline):
        post_buy_empty(
            client, shared_baseline["customer_c_id"], "12kg",
            cylinders_received=10,
            price_total=100, paid_amount=100,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 0
        assert card["sold_48kg"] == 0

    def test_return_empties_does_not_count_as_sold(self, client, shared_baseline):
        post_return_empties_from_customer(
            client, shared_baseline["customer_a_id"],
            qty_12kg=5, qty_48kg=0,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 0
        assert card["sold_48kg"] == 0

    def test_payment_does_not_count_as_sold(self, client, shared_baseline):
        post_payment_from_customer(
            client, shared_baseline["customer_a_id"],
            amount=500,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 0
        assert card["sold_48kg"] == 0

    def test_refill_does_not_count_as_sold(self, client, shared_baseline):
        post_refill(
            client,
            buy12=10, return12=5,
            buy48=4, return48=2,
            total_cost=1000, paid_amount=1000,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["sold_12kg"] == 0
        assert card["sold_48kg"] == 0


# --- has_refill ───────────────────────────────────────────────────────────────

class TestHasRefill:
    def test_has_refill_true_when_refill_posted(self, client, shared_baseline):
        post_refill(
            client,
            buy12=10, return12=5,
            buy48=0, return48=0,
            total_cost=500, paid_amount=500,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["has_refill"] is True

    def test_has_refill_false_when_only_orders(self, client, shared_baseline):
        post_replacement(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=300,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["has_refill"] is False

    def test_has_refill_false_when_only_buy_full_from_company(self, client, shared_baseline):
        # buy_iron is NOT a refill — it's an outright purchase
        post_buy_full_from_company(
            client,
            new12=5, new48=0,
            total_cost=300, paid_amount=300,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["has_refill"] is False

    def test_has_refill_false_when_only_inventory_adjustment(self, client, shared_baseline):
        post_inventory_adjustment(
            client, gas_type="12kg",
            delta_full=10, delta_empty=0,
            happened_at=at(DAY1),
        )
        card = get_daily_card(client, DAY1)
        assert card["has_refill"] is False

    def test_has_refill_true_mixed_day(self, client, shared_baseline):
        # Refill + orders on same day: has_refill must still be True
        post_replacement(
            client, shared_baseline["customer_c_id"], shared_baseline["customer_c_system_12kg"],
            "12kg", cylinders_installed=3, cylinders_received=2,
            price_total=300, paid_amount=300,
            happened_at=at(DAY1, 9, 0),
        )
        post_refill(
            client,
            buy12=10, return12=5,
            buy48=0, return48=0,
            total_cost=500, paid_amount=500,
            happened_at=at(DAY1, 9, 1),
        )
        card = get_daily_card(client, DAY1)
        assert card["has_refill"] is True
