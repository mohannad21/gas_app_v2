from __future__ import annotations

from ..helpers import (
    DAY1,
    DAY2,
    DAY3,
    get_daily_card,
    get_day_events,
    get_customer_balances,
    get_company_balances,
)


# --- Delete helpers ──────────────────────────────────────────────────────────

def delete_order(client, order_id: str) -> None:
    r = client.delete(f"/orders/{order_id}")
    assert r.status_code == 204, f"delete_order failed: {r.status_code} {r.text}"


def delete_collection(client, collection_id: str) -> None:
    r = client.delete(f"/collections/{collection_id}")
    assert r.status_code == 204, f"delete_collection failed: {r.status_code} {r.text}"


def delete_customer_adjustment(client, adjustment_id: str) -> None:
    r = client.delete(f"/customer-adjustments/{adjustment_id}")
    assert r.status_code == 204, f"delete_customer_adjustment failed: {r.status_code} {r.text}"


def delete_refill(client, refill_id: str) -> None:
    r = client.delete(f"/inventory/refills/{refill_id}")
    assert r.status_code == 204, f"delete_refill failed: {r.status_code} {r.text}"


def delete_inventory_adjustment(client, adjust_id: str) -> None:
    r = client.delete(f"/inventory/adjust/{adjust_id}")
    assert r.status_code == 204, f"delete_inventory_adjustment failed: {r.status_code} {r.text}"


def delete_company_payment(client, payment_id: str) -> None:
    r = client.delete(f"/company/payments/{payment_id}")
    assert r.status_code == 204, f"delete_company_payment failed: {r.status_code} {r.text}"


def delete_company_balance_adjustment(client, adjustment_id: str) -> None:
    r = client.delete(f"/company/balance-adjustments/{adjustment_id}")
    assert r.status_code == 204, f"delete_company_balance_adjustment failed: {r.status_code} {r.text}"


def delete_expense(client, expense_id: str) -> None:
    r = client.delete(f"/expenses/{expense_id}")
    assert r.status_code == 204, f"delete_expense failed: {r.status_code} {r.text}"


def delete_wallet_adjustment(client, adjust_id: str) -> None:
    r = client.delete(f"/cash/adjust/{adjust_id}")
    assert r.status_code == 204, f"delete_wallet_adjustment failed: {r.status_code} {r.text}"


def delete_bank_deposit(client, deposit_id: str) -> None:
    r = client.delete(f"/cash/bank_deposit/{deposit_id}")
    assert r.status_code == 204, f"delete_bank_deposit failed: {r.status_code} {r.text}"


def delete_buy_iron(client, buy_iron_id: str) -> None:
    r = client.delete(f"/company/buy_iron/{buy_iron_id}")
    assert r.status_code == 204, f"delete_buy_iron failed: {r.status_code} {r.text}"


def delete_cylinder_settle(client, settle_id: str) -> None:
    r = client.delete(f"/company/cylinders/settle/{settle_id}")
    assert r.status_code == 204, f"delete_cylinder_settle failed: {r.status_code} {r.text}"


# --- Snapshot ────────────────────────────────────────────────────────────────

def take_snapshot(
    client,
    *,
    customer_a_id: str,
    customer_b_id: str,
    customer_c_id: str,
) -> dict:
    """Capture the full observable state across all 3 days."""
    return {
        # Group 1: daily card metrics
        "day1_card": get_daily_card(client, DAY1),
        "day2_card": get_daily_card(client, DAY2),
        "day3_card": get_daily_card(client, DAY3),
        # Group 2: running balances
        "customer_a": get_customer_balances(client, customer_a_id),
        "customer_b": get_customer_balances(client, customer_b_id),
        "customer_c": get_customer_balances(client, customer_c_id),
        "company": get_company_balances(client),
        # Group 3: expanded event ledger for DAY1
        "day1_events": get_day_events(client, DAY1),
    }


# --- Event finder ────────────────────────────────────────────────────────────

def find_event_at(events: list[dict], happened_at: str) -> dict | None:
    """
    Return the first event whose effective_at matches happened_at.
    Pass the full timestamp from at() e.g. '2024-01-02T09:00:00'.
    Comparison uses only the first 16 characters (YYYY-MM-DDTHH:MM) so
    seconds and timezone suffixes are ignored.
    """
    prefix = happened_at[:16]
    for e in events:
        ea = e.get("effective_at") or ""
        if isinstance(ea, str) and ea[:16] == prefix:
            return e
    return None


# --- Continuity invariant ────────────────────────────────────────────────────

def assert_wallet_continuity(client) -> None:
    """
    Verify wallet continuity across all events for each day.

    The API returns events newest-first. For consecutive events [i] and [i+1],
    events[i+1] is chronologically earlier, so:
      events[i+1].wallet_after == events[i].wallet_before

    Cross-day: the chronologically last event of DAY N is events[0] (first in
    the newest-first list), and the chronologically first event of DAY N+1 is
    events[-1]. Their wallet_after and wallet_before must match.
    """
    events_by_day: dict[str, list[dict]] = {}
    for date in [DAY1, DAY2, DAY3]:
        events_by_day[date] = get_day_events(client, date)

    # Within-day: events are newest-first, so events[i+1] is the earlier event
    for date, events in events_by_day.items():
        for i in range(len(events) - 1):
            wa = events[i + 1].get("wallet_after")   # earlier event's end
            wb = events[i].get("wallet_before")       # later event's start
            if wa is not None and wb is not None:
                assert wa == wb, (
                    f"[{date}] Wallet continuity broken between events {i + 1} and {i}: "
                    f"wallet_after={wa}, next wallet_before={wb}"
                )

    # Cross-day: events[0] = last chronological event of day_a
    #            events[-1] = first chronological event of day_b
    for day_a, day_b in [(DAY1, DAY2), (DAY2, DAY3)]:
        last = events_by_day[day_a][0] if events_by_day[day_a] else None
        first = events_by_day[day_b][-1] if events_by_day[day_b] else None
        if last and first:
            wa = last.get("wallet_after")
            wb = first.get("wallet_before")
            if wa is not None and wb is not None:
                assert wa == wb, (
                    f"Cross-day wallet continuity broken {day_a}→{day_b}: "
                    f"wallet_after={wa}, next wallet_before={wb}"
                )
