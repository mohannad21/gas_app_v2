from __future__ import annotations

import pytest
from sqlalchemy import text

from ..helpers import (
    DAY0,
    DAY1,
    DAY2,
    DAY3,
    at,
    post_buy_empty,
    post_buy_full_from_company,
    post_company_balance_adjustment,
    post_customer_balance_adjustment,
    post_expense,
    post_inventory_adjustment,
    post_payment_from_customer,
    post_payment_to_company,
    post_payout_to_customer,
    post_refill,
    post_replacement,
    post_return_empties_from_customer,
    post_return_empties_to_company,
    post_system,
    post_wallet_adjustment,
    post_wallet_to_bank,
)

_AUTH_TABLES = frozenset({
    "plans",
    "tenants",
    "users",
    "roles",
    "role_permissions",
    "tenant_memberships",
    "tenant_plan_subscriptions",
})


@pytest.fixture()
def world(client):
    """
    3-day world fixture used by Layer 2 cascade (history-rebuild) tests.

    DAY0  — initial state: inventory, wallet, company balance, customer balances
    DAY1  — 7 events at 09:00, 09:30, 09:45, 10:00, 10:15, 10:30, 11:00
    DAY2  — 7 events at 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00
    DAY3  — 7 events at 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00

    Known end-of-day wallet (verified by sanity tests):
      DAY1 = 670, DAY2 = 500, DAY3 = 350

    Known end-of-day inventory:
      DAY1: full12=110, empty12=47, full48=50,  empty48=30
      DAY2: full12=115, empty12=50, full48=48,  empty48=30
      DAY3: full12=112, empty12=49, full48=53,  empty48=30

    Cascade insertion slot: DAY1 09:15 (between 09:00 and 09:30).
    The 09:45 event involves Customer C — use Customer C as the
    "same-customer" target when inserting at 09:15 in Ticket 10 tests.
    """

    # ── Initial state (DAY0) ─────────────────────────────────────────────────

    r = client.post("/inventory/init", json={
        "full12": 100, "empty12": 50,
        "full48": 50, "empty48": 30,
        "date": DAY0,
    })
    assert r.status_code < 300, r.text

    post_wallet_adjustment(client, delta_cash=1000, happened_at=at(DAY0, 8, 0))

    post_company_balance_adjustment(
        client,
        money_balance=2000, cylinder_balance_12=0, cylinder_balance_48=0,
        happened_at=at(DAY0, 8, 1),
    )

    r = client.post("/expenses/categories", json={"name": "fuel"})
    assert r.status_code < 300, r.text
    expense_category_id = r.json()["id"]

    # Customer A: owes us 500 money, 5 empty 12kg cylinders
    r = client.post("/customers", json={"name": "Customer A"})
    assert r.status_code < 300, r.text
    customer_a_id = r.json()["id"]
    post_customer_balance_adjustment(
        client, customer_a_id,
        money_balance=500, cylinder_balance_12kg=5, cylinder_balance_48kg=0,
        happened_at=at(DAY0, 8, 2),
    )
    customer_a_system_12kg = post_system(client, customer_a_id, "12kg", "A Kitchen 12kg")

    # Customer B: we owe them 200 money, 3 empty 12kg cylinders
    r = client.post("/customers", json={"name": "Customer B"})
    assert r.status_code < 300, r.text
    customer_b_id = r.json()["id"]
    post_customer_balance_adjustment(
        client, customer_b_id,
        money_balance=-200, cylinder_balance_12kg=-3, cylinder_balance_48kg=0,
        happened_at=at(DAY0, 8, 3),
    )

    # Customer C: zero balance, has systems for both gas types
    r = client.post("/customers", json={"name": "Customer C"})
    assert r.status_code < 300, r.text
    customer_c_id = r.json()["id"]
    customer_c_system_12kg = post_system(client, customer_c_id, "12kg", "C Kitchen 12kg")
    customer_c_system_48kg = post_system(client, customer_c_id, "48kg", "C Kitchen 48kg")

    # ── DAY1 (7 events) ──────────────────────────────────────────────────────
    #
    # Running wallet: 1000 → 1200 → 1300 → 1250 → 950 → 750 → 670 → 670
    # Insertion slot for Ticket 10/11: 09:15 (between 09:00 and 09:30)
    # 09:45 involves Customer C → use C as same-customer target in Ticket 10

    # 09:00  replacement 12kg Customer A  (+200 wallet)
    post_replacement(
        client, customer_a_id, customer_a_system_12kg,
        "12kg", cylinders_installed=2, cylinders_received=2,
        price_total=200, paid_amount=200,
        happened_at=at(DAY1, 9, 0),
    )
    # 09:30  payment from Customer A  (+100 wallet)
    post_payment_from_customer(
        client, customer_a_id, amount=100,
        happened_at=at(DAY1, 9, 30),
    )
    # 09:45  payout to Customer C  (-50 wallet, C money +=50)
    post_payout_to_customer(
        client, customer_c_id, amount=50,
        happened_at=at(DAY1, 9, 45),
    )
    # 10:00  refill buy12=10 return12=5  (-300 wallet, company money +=200, company cyl12=-5)
    post_refill(
        client,
        buy12=10, return12=5, buy48=0, return48=0,
        total_cost=500, paid_amount=300,
        happened_at=at(DAY1, 10, 0),
    )
    # 10:15  payment to company  (-200 wallet, company money -=200)
    post_payment_to_company(client, amount=200, happened_at=at(DAY1, 10, 15))
    # 10:30  expense  (-80 wallet)
    post_expense(client, expense_category_id, amount=80, happened_at=at(DAY1, 10, 30))
    # 11:00  inventory adjustment 12kg +2 full  (no wallet change)
    post_inventory_adjustment(
        client, gas_type="12kg", delta_full=2, delta_empty=0,
        happened_at=at(DAY1, 11, 0),
    )

    # ── DAY2 (7 events) ──────────────────────────────────────────────────────
    #
    # Running wallet: 670 → 970 → 910 → 760 → 760 → 560 → 500 → 500

    # 09:00  replacement 48kg Customer C  (+300 wallet, C money +=100, C cyl48+=1)
    post_replacement(
        client, customer_c_id, customer_c_system_48kg,
        "48kg", cylinders_installed=2, cylinders_received=1,
        price_total=400, paid_amount=300,
        happened_at=at(DAY2, 9, 0),
    )
    # 09:30  buy_empty 12kg from Customer A  (-60 wallet, A money -=0)
    post_buy_empty(
        client, customer_a_id, "12kg",
        cylinders_received=3, price_total=60, paid_amount=60,
        happened_at=at(DAY2, 9, 30),
    )
    # 10:00  payment to company  (-150 wallet, company money -=150)
    post_payment_to_company(client, amount=150, happened_at=at(DAY2, 10, 0))
    # 10:30  return empties from Customer C (48kg)  (no wallet, C cyl48 -=1)
    post_return_empties_from_customer(
        client, customer_c_id, qty_12kg=0, qty_48kg=1,
        happened_at=at(DAY2, 10, 30),
    )
    # 11:00  buy_iron 5×12kg partial pay  (-200 wallet, full12+=5, company money +=50)
    post_buy_full_from_company(
        client, new12=5, new48=0,
        total_cost=250, paid_amount=200,
        happened_at=at(DAY2, 11, 0),
    )
    # 11:30  expense  (-60 wallet)
    post_expense(client, expense_category_id, amount=60, happened_at=at(DAY2, 11, 30))
    # 12:00  inventory adjustment 48kg -2 empty  (no wallet)
    post_inventory_adjustment(
        client, gas_type="48kg", delta_full=0, delta_empty=-2,
        happened_at=at(DAY2, 12, 0),
    )

    # ── DAY3 (7 events) ──────────────────────────────────────────────────────
    #
    # Running wallet: 500 → 800 → 900 → 900 → 700 → 650 → 350 → 350

    # 09:00  replacement 12kg Customer A  (+300 wallet, A cyl12 +=1)
    post_replacement(
        client, customer_a_id, customer_a_system_12kg,
        "12kg", cylinders_installed=3, cylinders_received=2,
        price_total=300, paid_amount=300,
        happened_at=at(DAY3, 9, 0),
    )
    # 09:30  payment from Customer C  (+100 wallet, C money -=100)
    post_payment_from_customer(
        client, customer_c_id, amount=100,
        happened_at=at(DAY3, 9, 30),
    )
    # 10:00  return empties to company 12kg qty=3  (no wallet, company cyl12 +=3)
    # NOTE: no DELETE endpoint for this activity type
    post_return_empties_to_company(
        client, gas_type="12kg", quantity=3,
        happened_at=at(DAY3, 10, 0),
    )
    # 10:30  payment to company  (-200 wallet, company money -=200)
    post_payment_to_company(client, amount=200, happened_at=at(DAY3, 10, 30))
    # 11:00  expense  (-50 wallet)
    post_expense(client, expense_category_id, amount=50, happened_at=at(DAY3, 11, 0))
    # 11:30  wallet to bank  (-300 wallet, excluded from net_today)
    post_wallet_to_bank(client, amount=300, happened_at=at(DAY3, 11, 30))
    # 12:00  inventory adjustment 48kg +5 full  (no wallet)
    post_inventory_adjustment(
        client, gas_type="48kg", delta_full=5, delta_empty=0,
        happened_at=at(DAY3, 12, 0),
    )

    return {
        "customer_a_id": customer_a_id,
        "customer_b_id": customer_b_id,
        "customer_c_id": customer_c_id,
        "customer_a_system_12kg": customer_a_system_12kg,
        "customer_c_system_12kg": customer_c_system_12kg,
        "customer_c_system_48kg": customer_c_system_48kg,
        "expense_category_id": expense_category_id,
        # Expected end-of-day wallet values
        "expected_wallet": {DAY1: 670, DAY2: 500, DAY3: 350},
        # Expected end-of-day inventory
        "expected_inventory": {
            DAY1: {"full12": 110, "empty12": 47, "full48": 50, "empty48": 30},
            DAY2: {"full12": 115, "empty12": 50, "full48": 48, "empty48": 30},
            DAY3: {"full12": 112, "empty12": 49, "full48": 53, "empty48": 30},
        },
        # Expected net_today per day
        "expected_net_today": {DAY1: 170, DAY2: 180, DAY3: 350},
        # Expected sold cylinders per day
        "expected_sold_12kg": {DAY1: 2, DAY2: 0, DAY3: 3},
        "expected_sold_48kg": {DAY1: 0, DAY2: 2, DAY3: 0},
    }


@pytest.fixture(scope="module")
def shared_world(client):
    """Module-scoped world for read-only sanity tests.
    Built once per test file. Do not use in tests that mutate world data.
    """
    world_data = world.__wrapped__(client)
    yield world_data

    import app.db as app_db
    from app.config import DEFAULT_TENANT_ID

    data_tables = ", ".join(
        t.name
        for t in app_db.SQLModel.metadata.sorted_tables
        if t.name not in _AUTH_TABLES
    )
    with app_db.engine.begin() as conn:
        if data_tables:
            conn.execute(text(f"TRUNCATE TABLE {data_tables} CASCADE"))
        conn.execute(text("DELETE FROM tenants WHERE id != :id"), {"id": DEFAULT_TENANT_ID})
        conn.execute(text("DELETE FROM users WHERE id != :id"), {"id": "test-user"})
        conn.execute(text("DELETE FROM roles WHERE id != :id"), {"id": "test-role"})
        conn.execute(text("DELETE FROM plans WHERE id != :id"), {"id": "test-plan"})
