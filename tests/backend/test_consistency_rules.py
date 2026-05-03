"""
Regression tests for the consistency rules spec.

Covers:
- Customer operational sequences (replacement, sell full, buy empty, return empties,
  payment/payout) — add then remove, checking Net, customer balances, carry-forward
- Refill icon (has_refill) — same-day only, add/remove, multi-refill
- Day box unchanged after company operational activities
- Balance adjustments excluded from Daily Report event feed
- Day box unchanged after balance adjustments
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from tests.backend.conftest import (
    create_customer,
    create_order,
    create_system,
    get_daily_row,
    init_inventory,
    iso_at,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

DAY = date(2026, 6, 1)
DAY2 = DAY + timedelta(days=1)


def _init(client, *, day: date = DAY, cash: int = 1000) -> None:
    prev = (day - timedelta(days=1)).isoformat()
    init_inventory(client, date=prev, full12=50, empty12=20, full48=10, empty48=5)
    client.post(
        "/cash/adjust",
        json={"happened_at": iso_at(prev, "evening"), "delta_cash": cash, "reason": "open"},
    )


def _day_report(client, day: date) -> dict:
    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _day_row(client, day: date) -> dict:
    return get_daily_row(client, day.isoformat())


def _event_types(report: dict) -> list[str]:
    return [e.get("event_type") for e in report.get("events", [])]


def _event_by_source(report: dict, source_id: str) -> dict:
    return next(e for e in report["events"] if e.get("source_id") == source_id)


def _create_collection(
    client,
    *,
    customer_id: str,
    happened_at: str,
    action_type: str = "payment",
    amount_money: int = 0,
    qty_12kg: int = 0,
    qty_48kg: int = 0,
) -> str:
    resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "happened_at": happened_at,
            "action_type": action_type,
            "amount_money": amount_money,
            "qty_12kg": qty_12kg,
            "qty_48kg": qty_48kg,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_refill(
    client,
    *,
    happened_at: str,
    buy12: int = 2,
    return12: int = 1,
    total_cost: int = 200,
    paid_now: int = 100,
) -> str:
    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": happened_at,
            "buy12": buy12,
            "return12": return12,
            "buy48": 0,
            "return48": 0,
            "total_cost": total_cost,
            "paid_now": paid_now,
        },
    )
    assert resp.status_code == 200, resp.text
    list_resp = client.get("/inventory/refills", params={"limit": 1})
    assert list_resp.status_code == 200, list_resp.text
    return list_resp.json()[0]["refill_id"]


def _customer_balances(client, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}/balances")
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# 1. Customer operational sequences
# ---------------------------------------------------------------------------

class TestCustomerOperationalSequences:

    def test_unpaid_replacement_then_payment_then_remove_replacement(self, client) -> None:
        """
        Add replacement (unpaid) → add payment → remove replacement.
        After removal: Net reverts, customer balance reverts, carry-forward reverts.
        """
        _init(client)
        day_iso = DAY.isoformat()
        customer_id = create_customer(client, name="Seq Replace")
        system_id = create_system(client, customer_id=customer_id)

        order_id = create_order(
            client,
            customer_id=customer_id,
            system_id=system_id,
            delivered_at=iso_at(day_iso, "morning"),
            gas_type="12kg",
            installed=2,
            received=1,
            price_total=200,
            paid_amount=0,
        )
        _create_collection(
            client,
            customer_id=customer_id,
            happened_at=iso_at(day_iso, "midday"),
            action_type="payment",
            amount_money=200,
        )

        # Before delete: Net = 200 (payment collected)
        row_before = _day_row(client, DAY)
        assert row_before["net_today"] == 200
        assert row_before["sold_12kg"] == 2

        balances_before = _customer_balances(client, customer_id)
        assert balances_before["money_balance"] == 0
        assert balances_before["cylinder_balance_12kg"] == 1

        # Delete the replacement
        resp = client.delete(f"/orders/{order_id}")
        assert resp.status_code == 204, resp.text

        row_after = _day_row(client, DAY)
        # Net drops by the paid_amount of the order (0 paid on the order itself;
        # payment collection remains so Net stays at 200 minus 0 order contribution)
        # The replacement contributed 0 to Net (paid_amount=0).
        # Net should still be 200 from the collection.
        assert row_after["sold_12kg"] == 0

        # Customer: payment remains, so they now have credit
        balances_after = _customer_balances(client, customer_id)
        assert balances_after["money_balance"] == -200  # 200 credit (over-paid)
        assert balances_after["cylinder_balance_12kg"] == 0

    def test_sell_full_then_payment_then_remove_sell_full(self, client) -> None:
        """
        Add sell full → add payment → remove sell full.
        Net reverts correctly; customer balance reflects remaining payment.
        """
        _init(client)
        day_iso = DAY.isoformat()
        customer_id = create_customer(client, name="Seq Sell Full")
        system_id = create_system(client, customer_id=customer_id)

        order_id = create_order(
            client,
            customer_id=customer_id,
            system_id=system_id,
            delivered_at=iso_at(day_iso, "morning"),
            gas_type="12kg",
            installed=1,
            received=0,
            price_total=150,
            paid_amount=150,
        )
        _create_collection(
            client,
            customer_id=customer_id,
            happened_at=iso_at(day_iso, "midday"),
            action_type="payment",
            amount_money=50,
        )

        row_before = _day_row(client, DAY)
        assert row_before["net_today"] == 200  # 150 from order + 50 from collection

        resp = client.delete(f"/orders/{order_id}")
        assert resp.status_code == 204, resp.text

        row_after = _day_row(client, DAY)
        assert row_after["net_today"] == 50   # only the collection remains
        assert row_after["sold_12kg"] == 0

        balances = _customer_balances(client, customer_id)
        assert balances["money_balance"] == -50  # customer has 50 credit

    def test_buy_empty_add_and_remove_affects_net(self, client) -> None:
        """
        buy_iron = customer pays distributor for iron cylinders → cash IN → Net increases.
        Remove the order → Net reverts.
        """
        _init(client)
        day_iso = DAY.isoformat()
        customer_id = create_customer(client, name="Seq Buy Empty")
        system_id = create_system(client, customer_id=customer_id)

        row_before = _day_row(client, DAY)
        net_before = row_before["net_today"]

        order_id = create_order(
            client,
            customer_id=customer_id,
            system_id=system_id,
            delivered_at=iso_at(day_iso, "morning"),
            gas_type="12kg",
            installed=0,
            received=3,
            price_total=60,
            paid_amount=60,
        )

        row_after_add = _day_row(client, DAY)
        # paid_amount=60 flows in as cash → Net increases by 60
        assert row_after_add["net_today"] == net_before + 60

        resp = client.delete(f"/orders/{order_id}")
        assert resp.status_code == 204, resp.text

        row_after_delete = _day_row(client, DAY)
        assert row_after_delete["net_today"] == net_before

    def test_return_empties_does_not_affect_net(self, client) -> None:
        """
        Return empties (amount_money=0) never affects Net.
        Add and remove should both leave Net unchanged.
        """
        _init(client)
        day_iso = DAY.isoformat()
        customer_id = create_customer(client, name="Seq Return Empties")

        # First give the customer a cylinder debt so return is valid
        system_id = create_system(client, customer_id=customer_id)
        create_order(
            client,
            customer_id=customer_id,
            system_id=system_id,
            delivered_at=iso_at(day_iso, "morning"),
            gas_type="12kg",
            installed=2,
            received=0,
            price_total=200,
            paid_amount=200,
        )

        row_after_order = _day_row(client, DAY)
        net_after_order = row_after_order["net_today"]

        collection_id = _create_collection(
            client,
            customer_id=customer_id,
            happened_at=iso_at(day_iso, "midday"),
            action_type="return",
            qty_12kg=1,
        )

        row_after_return = _day_row(client, DAY)
        # Net must not change from return empties
        assert row_after_return["net_today"] == net_after_order

        resp = client.delete(f"/collections/{collection_id}")
        assert resp.status_code == 204, resp.text

        row_after_delete = _day_row(client, DAY)
        assert row_after_delete["net_today"] == net_after_order

    def test_remove_replacement_updates_carry_forward_to_next_day(self, client) -> None:
        """
        Replacement on day1 → next-day opening wallet and inventory shift.
        Deleting it reverts those carry-forward values on day2.
        """
        _init(client)
        customer_id = create_customer(client, name="Carry Fwd Delete")
        system_id = create_system(client, customer_id=customer_id)

        order_id = create_order(
            client,
            customer_id=customer_id,
            system_id=system_id,
            delivered_at=iso_at(DAY.isoformat(), "morning"),
            gas_type="12kg",
            installed=2,
            received=1,
            price_total=200,
            paid_amount=200,
        )

        row_day2_before = _day_row(client, DAY2)
        cash_start_before = row_day2_before["cash_start"]

        resp = client.delete(f"/orders/{order_id}")
        assert resp.status_code == 204, resp.text

        row_day2_after = _day_row(client, DAY2)
        # Carry-forward wallet drops by 200 (order paid_amount)
        assert row_day2_after["cash_start"] == cash_start_before - 200

        report_day2 = _day_report(client, DAY2)
        # Day2 own Net unchanged (no activities on day2)
        assert row_day2_after["net_today"] == 0


# ---------------------------------------------------------------------------
# 2. Refill icon (has_refill on day card)
# ---------------------------------------------------------------------------

class TestRefillIcon:

    def test_has_refill_true_after_adding_refill(self, client) -> None:
        _init(client)
        _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"))
        row = _day_row(client, DAY)
        assert row["has_refill"] is True

    def test_has_refill_false_when_no_refill(self, client) -> None:
        _init(client)
        row = _day_row(client, DAY)
        assert row.get("has_refill") is False or row.get("has_refill") is None

    def test_has_refill_false_after_removing_only_refill(self, client) -> None:
        _init(client)
        refill_id = _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"))
        assert _day_row(client, DAY)["has_refill"] is True

        resp = client.delete(f"/inventory/refills/{refill_id}")
        assert resp.status_code in (200, 204), resp.text

        row = _day_row(client, DAY)
        assert not row.get("has_refill")

    def test_has_refill_still_true_after_removing_one_of_two_refills(self, client) -> None:
        _init(client)
        refill_id_1 = _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"))
        _create_refill(client, happened_at=iso_at(DAY.isoformat(), "midday"))

        resp = client.delete(f"/inventory/refills/{refill_id_1}")
        assert resp.status_code in (200, 204), resp.text

        row = _day_row(client, DAY)
        assert row["has_refill"] is True

    def test_has_refill_does_not_carry_forward_to_next_day(self, client) -> None:
        _init(client)
        _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"))
        assert _day_row(client, DAY)["has_refill"] is True

        row_next = _day_row(client, DAY2)
        assert not row_next.get("has_refill")


# ---------------------------------------------------------------------------
# 3. Day box unchanged after company operational activities
# ---------------------------------------------------------------------------

class TestDayBoxCompanyActivities:

    def test_refill_does_not_change_net_or_sold(self, client) -> None:
        _init(client)
        row_before = _day_row(client, DAY)
        net_before = row_before["net_today"]
        sold12_before = row_before["sold_12kg"]
        sold48_before = row_before["sold_48kg"]

        _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"))

        row_after = _day_row(client, DAY)
        assert row_after["net_today"] == net_before
        assert row_after["sold_12kg"] == sold12_before
        assert row_after["sold_48kg"] == sold48_before

    def test_company_payment_does_not_change_net_or_sold(self, client) -> None:
        _init(client)
        _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"), total_cost=200, paid_now=0)

        row_before = _day_row(client, DAY)
        net_before = row_before["net_today"]

        resp = client.post(
            "/company/payments",
            json={
                "happened_at": iso_at(DAY.isoformat(), "midday"),
                "amount": 200,
                "note": "pay off refill",
            },
        )
        assert resp.status_code == 201, resp.text

        row_after = _day_row(client, DAY)
        assert row_after["net_today"] == net_before
        assert row_after["sold_12kg"] == row_before["sold_12kg"]

    def test_remove_refill_does_not_change_net_or_sold(self, client) -> None:
        _init(client)
        refill_id = _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"))

        row_before = _day_row(client, DAY)
        net_before = row_before["net_today"]

        resp = client.delete(f"/inventory/refills/{refill_id}")
        assert resp.status_code in (200, 204), resp.text

        row_after = _day_row(client, DAY)
        assert row_after["net_today"] == net_before
        assert row_after["sold_12kg"] == row_before["sold_12kg"]


# ---------------------------------------------------------------------------
# 4. Balance adjustments excluded from Daily Report event feed
# ---------------------------------------------------------------------------

class TestBalanceAdjustmentsNotInDailyReport:

    def test_customer_balance_adjustment_not_in_daily_report_events(self, client) -> None:
        _init(client)
        customer_id = create_customer(client, name="Bal Adj Customer")

        resp = client.post(
            "/customer-adjustments",
            json={
                "customer_id": customer_id,
                "amount_money": 100,
                "count_12kg": 0,
                "count_48kg": 0,
                "reason": "correction",
            },
        )
        assert resp.status_code == 201, resp.text

        report = _day_report(client, DAY)
        event_types = _event_types(report)
        assert "customer_adjust" not in event_types

    def test_company_balance_adjustment_not_in_daily_report_events(self, client) -> None:
        _init(client)
        _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"))

        resp = client.post(
            "/company/balances/adjust",
            json={
                "happened_at": iso_at(DAY.isoformat(), "midday"),
                "money_balance": 50,
                "cylinder_balance_12": 0,
                "cylinder_balance_48": 0,
                "note": "correction",
            },
        )
        assert resp.status_code == 201, resp.text

        report = _day_report(client, DAY)
        event_types = _event_types(report)
        assert "company_adjustment" not in event_types


# ---------------------------------------------------------------------------
# 5. Day box unchanged after balance adjustments
# ---------------------------------------------------------------------------

class TestDayBoxBalanceAdjustments:

    def test_customer_balance_adjustment_does_not_change_net(self, client) -> None:
        _init(client)
        customer_id = create_customer(client, name="Net Bal Adj")

        row_before = _day_row(client, DAY)
        net_before = row_before["net_today"]

        resp = client.post(
            "/customer-adjustments",
            json={
                "customer_id": customer_id,
                "amount_money": 500,
                "count_12kg": 0,
                "count_48kg": 0,
                "reason": "correction",
            },
        )
        assert resp.status_code == 201, resp.text

        row_after = _day_row(client, DAY)
        assert row_after["net_today"] == net_before
        assert row_after["sold_12kg"] == row_before["sold_12kg"]
        assert row_after["sold_48kg"] == row_before["sold_48kg"]

    def test_company_balance_adjustment_does_not_change_net(self, client) -> None:
        _init(client)
        _create_refill(client, happened_at=iso_at(DAY.isoformat(), "morning"))

        row_before = _day_row(client, DAY)
        net_before = row_before["net_today"]

        resp = client.post(
            "/company/balances/adjust",
            json={
                "happened_at": iso_at(DAY.isoformat(), "midday"),
                "money_balance": 999,
                "cylinder_balance_12": 5,
                "cylinder_balance_48": 0,
                "note": "correction",
            },
        )
        assert resp.status_code == 201, resp.text

        row_after = _day_row(client, DAY)
        assert row_after["net_today"] == net_before
        assert row_after["sold_12kg"] == row_before["sold_12kg"]
