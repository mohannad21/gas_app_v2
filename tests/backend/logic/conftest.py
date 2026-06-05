from __future__ import annotations

import pytest
from sqlalchemy import text

from .helpers import (
    DAY0, at,
    post_wallet_adjustment,
    post_company_balance_adjustment,
    post_customer_balance_adjustment,
    post_system,
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


@pytest.fixture(scope="module")
def shared_baseline(client):
    baseline_data = baseline.__wrapped__(client)

    import app.db as app_db

    snapshot: dict[str, set] = {}
    with app_db.engine.connect() as conn:
        for table in app_db.SQLModel.metadata.sorted_tables:
            if table.name in _AUTH_TABLES:
                continue
            if "id" in table.c:
                rows = conn.execute(table.select().with_only_columns(table.c.id)).fetchall()
                snapshot[table.name] = {row[0] for row in rows}
            else:
                snapshot[table.name] = set()
    baseline_data["_snapshot"] = snapshot

    yield baseline_data

    from app.config import DEFAULT_TENANT_ID

    data_tables = ", ".join(
        table.name
        for table in app_db.SQLModel.metadata.sorted_tables
        if table.name not in _AUTH_TABLES
    )
    with app_db.engine.begin() as conn:
        if data_tables:
            conn.execute(text(f"TRUNCATE TABLE {data_tables} CASCADE"))
        conn.execute(text("DELETE FROM tenants WHERE id != :id"), {"id": DEFAULT_TENANT_ID})
        conn.execute(text("DELETE FROM users WHERE id != :id"), {"id": "test-user"})
        conn.execute(text("DELETE FROM roles WHERE id != :id"), {"id": "test-role"})
        conn.execute(text("DELETE FROM plans WHERE id != :id"), {"id": "test-plan"})


@pytest.fixture(autouse=True)
def _baseline_cleanup(request):
    """Per-test cleanup for shared_baseline: removes test rows, preserves baseline rows."""
    if "shared_baseline" not in request.fixturenames:
        yield
        return
    yield
    shared = request.getfixturevalue("shared_baseline")
    snapshot = shared["_snapshot"]

    import app.db as app_db

    with app_db.engine.begin() as conn:
        for table in reversed(app_db.SQLModel.metadata.sorted_tables):
            if table.name in _AUTH_TABLES:
                continue
            if "id" not in table.c:
                continue
            baseline_ids = snapshot.get(table.name, set())
            if baseline_ids:
                conn.execute(table.delete().where(table.c.id.not_in(baseline_ids)))
            else:
                conn.execute(table.delete())
