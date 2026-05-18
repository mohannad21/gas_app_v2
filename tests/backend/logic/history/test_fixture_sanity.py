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
    get_day_events,
    post_expense,
)
from .helpers import (
    assert_wallet_continuity,
    delete_expense,
    find_event_at,
    take_snapshot,
)


# --- Event counts ─────────────────────────────────────────────────────────────

class TestWorldEventCounts:
    def test_day1_has_seven_events(self, client, world):
        assert len(get_day_events(client, DAY1)) == 7

    def test_day2_has_seven_events(self, client, world):
        assert len(get_day_events(client, DAY2)) == 7

    def test_day3_has_seven_events(self, client, world):
        assert len(get_day_events(client, DAY3)) == 7


# --- End-of-day wallet ────────────────────────────────────────────────────────

class TestWorldWallet:
    def test_day1_wallet(self, client, world):
        card = get_daily_card(client, DAY1)
        assert card["wallet_end"] == world["expected_wallet"][DAY1]

    def test_day2_wallet(self, client, world):
        card = get_daily_card(client, DAY2)
        assert card["wallet_end"] == world["expected_wallet"][DAY2]

    def test_day3_wallet(self, client, world):
        card = get_daily_card(client, DAY3)
        assert card["wallet_end"] == world["expected_wallet"][DAY3]


# --- End-of-day inventory ─────────────────────────────────────────────────────

class TestWorldInventory:
    def test_day1_inventory(self, client, world):
        inv = get_daily_card(client, DAY1)["inventory_end"]
        expected = world["expected_inventory"][DAY1]
        assert inv["full12"] == expected["full12"]
        assert inv["empty12"] == expected["empty12"]
        assert inv["full48"] == expected["full48"]
        assert inv["empty48"] == expected["empty48"]

    def test_day2_inventory(self, client, world):
        inv = get_daily_card(client, DAY2)["inventory_end"]
        expected = world["expected_inventory"][DAY2]
        assert inv["full12"] == expected["full12"]
        assert inv["empty12"] == expected["empty12"]
        assert inv["full48"] == expected["full48"]
        assert inv["empty48"] == expected["empty48"]

    def test_day3_inventory(self, client, world):
        inv = get_daily_card(client, DAY3)["inventory_end"]
        expected = world["expected_inventory"][DAY3]
        assert inv["full12"] == expected["full12"]
        assert inv["empty12"] == expected["empty12"]
        assert inv["full48"] == expected["full48"]
        assert inv["empty48"] == expected["empty48"]


# --- Daily card metrics ───────────────────────────────────────────────────────

class TestWorldDailyCardMetrics:
    def test_day1_net_today(self, client, world):
        assert get_daily_card(client, DAY1)["net_today"] == world["expected_net_today"][DAY1]

    def test_day2_net_today(self, client, world):
        assert get_daily_card(client, DAY2)["net_today"] == world["expected_net_today"][DAY2]

    def test_day3_net_today(self, client, world):
        assert get_daily_card(client, DAY3)["net_today"] == world["expected_net_today"][DAY3]

    def test_day1_sold_12kg(self, client, world):
        assert get_daily_card(client, DAY1)["sold_12kg"] == world["expected_sold_12kg"][DAY1]

    def test_day1_sold_48kg(self, client, world):
        assert get_daily_card(client, DAY1)["sold_48kg"] == world["expected_sold_48kg"][DAY1]

    def test_day2_sold_12kg(self, client, world):
        assert get_daily_card(client, DAY2)["sold_12kg"] == world["expected_sold_12kg"][DAY2]

    def test_day2_sold_48kg(self, client, world):
        assert get_daily_card(client, DAY2)["sold_48kg"] == world["expected_sold_48kg"][DAY2]

    def test_day3_sold_12kg(self, client, world):
        assert get_daily_card(client, DAY3)["sold_12kg"] == world["expected_sold_12kg"][DAY3]

    def test_day1_has_refill_true(self, client, world):
        assert get_daily_card(client, DAY1)["has_refill"] is True

    def test_day2_has_refill_false(self, client, world):
        # buy_iron (buy_full_from_company) is NOT a refill
        assert get_daily_card(client, DAY2)["has_refill"] is False

    def test_day3_has_refill_false(self, client, world):
        assert get_daily_card(client, DAY3)["has_refill"] is False


# --- Customer and company final balances ─────────────────────────────────────

class TestWorldCustomerBalances:
    def test_customer_a_final(self, client, world):
        b = get_customer_balances(client, world["customer_a_id"])
        assert b["money_balance"] == 400
        assert b["cylinder_balance_12kg"] == 6
        assert b["cylinder_balance_48kg"] == 0

    def test_customer_b_unchanged(self, client, world):
        # Customer B has no activities — balances stay at initial values
        b = get_customer_balances(client, world["customer_b_id"])
        assert b["money_balance"] == -200
        assert b["cylinder_balance_12kg"] == -3

    def test_customer_c_final(self, client, world):
        b = get_customer_balances(client, world["customer_c_id"])
        assert b["money_balance"] == 50
        assert b["cylinder_balance_12kg"] == 0
        assert b["cylinder_balance_48kg"] == 0


class TestWorldCompanyBalance:
    def test_company_final(self, client, world):
        b = get_company_balances(client)
        assert b["company_money"] == 1700
        assert b["company_cyl_12"] == -2
        assert b["company_cyl_48"] == 0


# --- Snapshot helper ─────────────────────────────────────────────────────────

class TestSnapshotHelper:
    def test_snapshot_contains_all_groups(self, client, world):
        snap = take_snapshot(
            client,
            customer_a_id=world["customer_a_id"],
            customer_b_id=world["customer_b_id"],
            customer_c_id=world["customer_c_id"],
        )
        assert "day1_card" in snap
        assert "day2_card" in snap
        assert "day3_card" in snap
        assert "customer_a" in snap
        assert "customer_b" in snap
        assert "customer_c" in snap
        assert "company" in snap
        assert "day1_events" in snap
        assert len(snap["day1_events"]) == 7

    def test_snapshot_wallet_matches_expected(self, client, world):
        snap = take_snapshot(
            client,
            customer_a_id=world["customer_a_id"],
            customer_b_id=world["customer_b_id"],
            customer_c_id=world["customer_c_id"],
        )
        assert snap["day1_card"]["wallet_end"] == world["expected_wallet"][DAY1]
        assert snap["day3_card"]["wallet_end"] == world["expected_wallet"][DAY3]


# --- Event finder helper ──────────────────────────────────────────────────────

class TestEventFinderHelper:
    # find_event_at works for all event types where effective_at is returned
    # as local business time. bank_deposit and inventory_adjustment do not
    # reliably expose a matchable effective_at — those event types are never
    # the inserted event in Ticket 10/11 cascade tests so this is not a problem.

    def test_finds_replacement_at_09_00_on_day1(self, client, world):
        events = get_day_events(client, DAY1)
        e = find_event_at(events, at(DAY1, 9, 0))
        assert e is not None

    def test_finds_payment_from_customer_at_09_30_on_day1(self, client, world):
        events = get_day_events(client, DAY1)
        e = find_event_at(events, at(DAY1, 9, 30))
        assert e is not None

    def test_finds_expense_at_10_30_on_day1(self, client, world):
        events = get_day_events(client, DAY1)
        e = find_event_at(events, at(DAY1, 10, 30))
        assert e is not None

    def test_returns_none_for_nonexistent_time(self, client, world):
        events = get_day_events(client, DAY1)
        assert find_event_at(events, at(DAY1, 6, 0)) is None


# --- Delete smoke test ────────────────────────────────────────────────────────

class TestDeleteSmoke:
    def test_insert_and_delete_reverts_event_count(self, client, world):
        before_count = len(get_day_events(client, DAY1))
        result = post_expense(
            client,
            world["expense_category_id"],
            amount=999,
            happened_at="2024-01-02T14:00:00",
        )
        assert len(get_day_events(client, DAY1)) == before_count + 1

        delete_expense(client, result["id"])
        assert len(get_day_events(client, DAY1)) == before_count

    def test_insert_and_delete_reverts_wallet(self, client, world):
        wallet_before = get_daily_card(client, DAY1)["wallet_end"]
        result = post_expense(
            client,
            world["expense_category_id"],
            amount=999,
            happened_at="2024-01-02T14:00:00",
        )
        assert get_daily_card(client, DAY1)["wallet_end"] == wallet_before - 999

        delete_expense(client, result["id"])
        assert get_daily_card(client, DAY1)["wallet_end"] == wallet_before


# --- Wallet continuity invariant ─────────────────────────────────────────────

class TestWalletContinuityInvariant:
    def test_wallet_continuity_on_clean_world(self, client, world):
        assert_wallet_continuity(client)
