from __future__ import annotations

import pytest

from .helpers import (
    DAY0, at,
    post_wallet_adjustment,
    post_company_balance_adjustment,
    post_customer_balance_adjustment,
    post_system,
)


@pytest.fixture()
def baseline(client):
    # Inventory starting state on DAY0
    r = client.post("/inventory/init", json={
        "full12": 100, "empty12": 50,
        "full48": 50,  "empty48": 30,
        "date": DAY0,
    })
    assert r.status_code < 300, r.text

    # Wallet starts at 1000
    post_wallet_adjustment(client, delta_cash=1000, happened_at=at(DAY0, 8, 0))

    # Company: we owe them 2000 at the start
    post_company_balance_adjustment(
        client,
        money_balance=2000, cylinder_balance_12=0, cylinder_balance_48=0,
        happened_at=at(DAY0, 8, 1),
    )

    # Expense category
    r = client.post("/expenses/categories", json={"name": "fuel"})
    assert r.status_code < 300, r.text
    expense_category_id = r.json()["id"]

    # Customer A: debt profile — owes us 500 money and 5 empty 12kg cylinders
    r = client.post("/customers", json={"name": "Customer A"})
    assert r.status_code < 300, r.text
    customer_a_id = r.json()["id"]
    post_customer_balance_adjustment(
        client, customer_a_id,
        money_balance=500, cylinder_balance_12kg=5, cylinder_balance_48kg=0,
        happened_at=at(DAY0, 8, 2),
    )
    customer_a_system_12kg = post_system(client, customer_a_id, "12kg", "A Kitchen 12kg")
    customer_a_system_48kg = post_system(client, customer_a_id, "48kg", "A Kitchen 48kg")

    # Customer B: credit profile — we owe them 200 money and 3 full 12kg cylinders
    # VERIFY: negative values are accepted by the customer adjustment endpoint.
    r = client.post("/customers", json={"name": "Customer B"})
    assert r.status_code < 300, r.text
    customer_b_id = r.json()["id"]
    post_customer_balance_adjustment(
        client, customer_b_id,
        money_balance=-200, cylinder_balance_12kg=-3, cylinder_balance_48kg=0,
        happened_at=at(DAY0, 8, 3),
    )

    # Customer C: zero balance
    r = client.post("/customers", json={"name": "Customer C"})
    assert r.status_code < 300, r.text
    customer_c_id = r.json()["id"]
    customer_c_system_12kg = post_system(client, customer_c_id, "12kg", "C Kitchen 12kg")
    customer_c_system_48kg = post_system(client, customer_c_id, "48kg", "C Kitchen 48kg")

    return {
        "customer_a_id": customer_a_id,
        "customer_a_system_12kg": customer_a_system_12kg,
        "customer_a_system_48kg": customer_a_system_48kg,
        "customer_b_id": customer_b_id,
        "customer_c_id": customer_c_id,
        "customer_c_system_12kg": customer_c_system_12kg,
        "customer_c_system_48kg": customer_c_system_48kg,
        "expense_category_id": expense_category_id,
    }
