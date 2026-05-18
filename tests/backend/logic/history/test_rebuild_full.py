from __future__ import annotations

from ..helpers import (
    DAY1,
    DAY2,
    DAY3,
    at,
    get_company_balances,
    get_customer_balances,
    get_daily_card,
    get_day_events,
    post_refill,
    post_replacement,
)
from .helpers import (
    delete_order,
    delete_refill,
    find_event_at,
    take_snapshot,
)


def _snap(client, world) -> dict:
    return take_snapshot(
        client,
        customer_a_id=world["customer_a_id"],
        customer_b_id=world["customer_b_id"],
        customer_c_id=world["customer_c_id"],
    )


# --- Replacement 12kg ─────────────────────────────────────────────────────────
#
# Insert at DAY1 09:15, Customer C, system_12kg
#   installed=2, received=0, price=200, paid=150
#
# Wallet delta   : +150  (paid_amount)
# Customer C money: +50  (price − paid = still owes)
# Customer C cyl_12: +2  (installed − received)
# Inventory      : full12 −2 on all 3 days (we deliver 2 full, get 0 back)

class TestInsertReplacement12kgCascade:
    def _insert(self, client, world) -> dict:
        return post_replacement(
            client,
            world["customer_c_id"],
            world["customer_c_system_12kg"],
            "12kg",
            cylinders_installed=2,
            cylinders_received=0,
            price_total=200,
            paid_amount=150,
            happened_at=at(DAY1, 9, 15),
        )

    def test_event_appears_at_insertion_slot(self, client, world):
        self._insert(client, world)
        events = get_day_events(client, DAY1)
        assert len(events) == 8
        assert find_event_at(events, at(DAY1, 9, 15)) is not None

    def test_wallet_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 + 150
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 + 150
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 + 150

    def test_customer_c_balance_updated(self, client, world):
        self._insert(client, world)
        b = get_customer_balances(client, world["customer_c_id"])
        assert b["money_balance"] == 50 + 50
        assert b["cylinder_balance_12kg"] == 0 + 2
        assert b["cylinder_balance_48kg"] == 0

    def test_inventory_full12_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["inventory_end"]["full12"] == 110 - 2
        assert get_daily_card(client, DAY1)["inventory_end"]["empty12"] == 47
        assert get_daily_card(client, DAY2)["inventory_end"]["full12"] == 115 - 2
        assert get_daily_card(client, DAY2)["inventory_end"]["empty12"] == 50
        assert get_daily_card(client, DAY3)["inventory_end"]["full12"] == 112 - 2
        assert get_daily_card(client, DAY3)["inventory_end"]["empty12"] == 49

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_order(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["customer_c"]["money_balance"] == snap["customer_c"]["money_balance"]
        assert after["customer_c"]["cylinder_balance_12kg"] == snap["customer_c"]["cylinder_balance_12kg"]
        assert after["customer_c"]["cylinder_balance_48kg"] == snap["customer_c"]["cylinder_balance_48kg"]
        assert after["day1_card"]["inventory_end"] == snap["day1_card"]["inventory_end"]
        assert after["day2_card"]["inventory_end"] == snap["day2_card"]["inventory_end"]
        assert after["day3_card"]["inventory_end"] == snap["day3_card"]["inventory_end"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- Replacement 48kg ─────────────────────────────────────────────────────────
#
# Insert at DAY1 09:15, Customer C, system_48kg
#   installed=1, received=0, price=100, paid=100
#
# Wallet delta    : +100  (paid_amount)
# Customer C money: 0     (fully paid)
# Customer C cyl_48: +1   (installed − received)
# Inventory       : full48 −1 on all 3 days

class TestInsertReplacement48kgCascade:
    def _insert(self, client, world) -> dict:
        return post_replacement(
            client,
            world["customer_c_id"],
            world["customer_c_system_48kg"],
            "48kg",
            cylinders_installed=1,
            cylinders_received=0,
            price_total=100,
            paid_amount=100,
            happened_at=at(DAY1, 9, 15),
        )

    def test_event_appears_at_insertion_slot(self, client, world):
        self._insert(client, world)
        events = get_day_events(client, DAY1)
        assert len(events) == 8
        assert find_event_at(events, at(DAY1, 9, 15)) is not None

    def test_wallet_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 + 100
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 + 100
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 + 100

    def test_customer_c_balance_updated(self, client, world):
        self._insert(client, world)
        b = get_customer_balances(client, world["customer_c_id"])
        assert b["money_balance"] == 50
        assert b["cylinder_balance_12kg"] == 0
        assert b["cylinder_balance_48kg"] == 0 + 1

    def test_inventory_full48_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["inventory_end"]["full48"] == 50 - 1
        assert get_daily_card(client, DAY1)["inventory_end"]["empty48"] == 30
        assert get_daily_card(client, DAY2)["inventory_end"]["full48"] == 48 - 1
        assert get_daily_card(client, DAY2)["inventory_end"]["empty48"] == 30
        assert get_daily_card(client, DAY3)["inventory_end"]["full48"] == 53 - 1
        assert get_daily_card(client, DAY3)["inventory_end"]["empty48"] == 30

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        result = self._insert(client, world)
        delete_order(client, result["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["customer_c"]["money_balance"] == snap["customer_c"]["money_balance"]
        assert after["customer_c"]["cylinder_balance_12kg"] == snap["customer_c"]["cylinder_balance_12kg"]
        assert after["customer_c"]["cylinder_balance_48kg"] == snap["customer_c"]["cylinder_balance_48kg"]
        assert after["day1_card"]["inventory_end"] == snap["day1_card"]["inventory_end"]
        assert after["day2_card"]["inventory_end"] == snap["day2_card"]["inventory_end"]
        assert after["day3_card"]["inventory_end"] == snap["day3_card"]["inventory_end"]
        assert len(after["day1_events"]) == len(snap["day1_events"])


# --- Refill ───────────────────────────────────────────────────────────────────
#
# Insert at DAY1 09:15
#   buy12=5, return12=0, total=300, paid=300
#
# Wallet delta     : −300  (paid_amount)
# Company money    : 0     (fully paid, no new debt)
# Company cyl_12   : −5    (we receive 5 full, owe 5 empties; −2 → −7)
# Inventory        : full12 +5 on all 3 days

class TestInsertRefillCascade:
    def _insert(self, client, world) -> dict:
        return post_refill(
            client,
            buy12=5,
            return12=0,
            buy48=0,
            return48=0,
            total_cost=300,
            paid_amount=300,
            happened_at=at(DAY1, 9, 15),
        )

    def test_event_appears_at_insertion_slot(self, client, world):
        self._insert(client, world)
        events = get_day_events(client, DAY1)
        assert len(events) == 8
        assert find_event_at(events, at(DAY1, 9, 15)) is not None

    def test_wallet_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["wallet_end"] == 670 - 300
        assert get_daily_card(client, DAY2)["wallet_end"] == 500 - 300
        assert get_daily_card(client, DAY3)["wallet_end"] == 350 - 300

    def test_company_cyl12_updated(self, client, world):
        self._insert(client, world)
        b = get_company_balances(client)
        assert b["company_money"] == 1700
        assert b["company_cyl_12"] == -2 - 5
        assert b["company_cyl_48"] == 0

    def test_inventory_full12_shifts_all_days(self, client, world):
        self._insert(client, world)
        assert get_daily_card(client, DAY1)["inventory_end"]["full12"] == 110 + 5
        assert get_daily_card(client, DAY1)["inventory_end"]["empty12"] == 47
        assert get_daily_card(client, DAY2)["inventory_end"]["full12"] == 115 + 5
        assert get_daily_card(client, DAY2)["inventory_end"]["empty12"] == 50
        assert get_daily_card(client, DAY3)["inventory_end"]["full12"] == 112 + 5
        assert get_daily_card(client, DAY3)["inventory_end"]["empty12"] == 49

    def test_delete_reverts_to_snapshot(self, client, world):
        snap = _snap(client, world)
        self._insert(client, world)
        # POST /inventory/refill does not return a top-level id; retrieve it
        # from the event that landed at the insertion slot.
        e = find_event_at(get_day_events(client, DAY1), at(DAY1, 9, 15))
        assert e is not None, "inserted refill event not found at 09:15"
        delete_refill(client, e["id"])
        after = _snap(client, world)
        assert after["day1_card"]["wallet_end"] == snap["day1_card"]["wallet_end"]
        assert after["day2_card"]["wallet_end"] == snap["day2_card"]["wallet_end"]
        assert after["day3_card"]["wallet_end"] == snap["day3_card"]["wallet_end"]
        assert after["company"]["company_money"] == snap["company"]["company_money"]
        assert after["company"]["company_cyl_12"] == snap["company"]["company_cyl_12"]
        assert after["company"]["company_cyl_48"] == snap["company"]["company_cyl_48"]
        assert after["day1_card"]["inventory_end"] == snap["day1_card"]["inventory_end"]
        assert after["day2_card"]["inventory_end"] == snap["day2_card"]["inventory_end"]
        assert after["day3_card"]["inventory_end"] == snap["day3_card"]["inventory_end"]
        assert len(after["day1_events"]) == len(snap["day1_events"])
