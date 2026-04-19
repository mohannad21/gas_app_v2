from datetime import datetime, timedelta, timezone

from tests.backend.conftest import create_customer, create_order, create_system, init_inventory


def test_orders_default_limit(client) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Orders Limit Customer")
    system_id = create_system(client, customer_id=customer_id)

    for i in range(60):
        create_order(
            client,
            customer_id=customer_id,
            system_id=system_id,
            delivered_at=f"2025-01-10T10:{i:02d}:00",
        )

    resp = client.get("/orders")
    assert resp.status_code == 200
    assert len(resp.json()) <= 50


def test_orders_before_cursor(client) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Orders Cursor Customer")
    system_id = create_system(client, customer_id=customer_id)

    order_a = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at="2025-01-10T10:00:00",
    )
    order_b = create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at="2025-01-05T10:00:00",
    )

    resp = client.get("/orders", params={"before": "2025-01-08T00:00:00"})
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert order_a not in ids
    assert order_b in ids


def test_orders_limit_param(client) -> None:
    init_inventory(client, date="2025-01-01")
    customer_id = create_customer(client, name="Orders Param Customer")
    system_id = create_system(client, customer_id=customer_id)

    for i in range(10):
        create_order(
            client,
            customer_id=customer_id,
            system_id=system_id,
            delivered_at=f"2025-01-10T10:{i:02d}:00",
        )

    resp = client.get("/orders", params={"limit": 3})
    assert resp.status_code == 200
    assert len(resp.json()) == 3


def test_expenses_default_limit(client) -> None:
    for i in range(60):
        resp = client.post(
            "/expenses",
            json={
                "date": "2025-02-10",
                "expense_type": "fuel",
                "amount": 10,
                "note": f"expense-{i}",
                "happened_at": f"2025-02-10T10:{i:02d}:00",
            },
        )
        assert resp.status_code == 201

    resp = client.get("/expenses")
    assert resp.status_code == 200
    assert len(resp.json()) <= 50


def test_expenses_before_cursor(client) -> None:
    expense_a = client.post(
        "/expenses",
        json={
            "date": "2025-01-10",
            "expense_type": "fuel",
            "amount": 100,
            "note": "expense-a",
            "happened_at": "2025-01-10T10:00:00",
        },
    )
    assert expense_a.status_code == 201
    expense_b = client.post(
        "/expenses",
        json={
            "date": "2025-01-05",
            "expense_type": "fuel",
            "amount": 100,
            "note": "expense-b",
            "happened_at": "2025-01-05T10:00:00",
        },
    )
    assert expense_b.status_code == 201

    resp = client.get("/expenses", params={"before": "2025-01-08T00:00:00"})
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert expense_a.json()["id"] not in ids
    assert expense_b.json()["id"] in ids


def test_refills_default_limit(client) -> None:
    init_inventory(client, date="2025-03-01")

    for i in range(60):
        resp = client.post(
            "/inventory/refill",
            json={
                "happened_at": f"2025-03-02T10:{i:02d}:00",
                "buy12": 1,
                "return12": 0,
                "buy48": 0,
                "return48": 0,
                "note": f"refill-{i}",
                "total_cost": 0,
                "paid_now": 0,
            },
        )
        assert resp.status_code == 200

    resp = client.get("/inventory/refills")
    assert resp.status_code == 200
    assert len(resp.json()) <= 50


def test_cash_adjustments_default_limit(client) -> None:
    for i in range(60):
        resp = client.post(
            "/cash/adjust",
            json={
                "happened_at": f"2025-04-01T10:{i:02d}:00",
                "delta_cash": 10,
                "reason": f"adjust-{i}",
            },
        )
        assert resp.status_code == 201

    resp = client.get("/cash/adjustments")
    assert resp.status_code == 200
    assert len(resp.json()) <= 50


def test_daily_default_window(client) -> None:
    today = datetime.now(timezone.utc).date()
    old_day = today - timedelta(days=30)
    recent_day = today - timedelta(days=3)

    init_inventory(client, date=(old_day - timedelta(days=1)).isoformat())
    customer_id = create_customer(client, name="Daily Window Customer")
    system_id = create_system(client, customer_id=customer_id)

    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{old_day.isoformat()}T10:00:00",
    )
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{recent_day.isoformat()}T10:00:00",
    )

    resp = client.get("/reports/daily")
    assert resp.status_code == 200
    dates = {row["date"] for row in resp.json()}
    assert old_day.isoformat() not in dates
    assert recent_day.isoformat() in dates


def test_collections_customer_id_filter(client) -> None:
    customer_a = create_customer(client, name="Collection Customer A")
    customer_b = create_customer(client, name="Collection Customer B")

    resp_a = client.post(
        "/collections",
        json={
            "customer_id": customer_a,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": "2025-05-01T10:00:00",
        },
    )
    assert resp_a.status_code == 201
    resp_b = client.post(
        "/collections",
        json={
            "customer_id": customer_b,
            "action_type": "payment",
            "amount_money": 150,
            "happened_at": "2025-05-01T11:00:00",
        },
    )
    assert resp_b.status_code == 201

    resp = client.get("/collections", params={"customer_id": customer_a})
    assert resp.status_code == 200
    rows = resp.json()
    assert all(row["customer_id"] == customer_a for row in rows)
    assert all(row["id"] != resp_b.json()["id"] for row in rows)


def test_expense_patch_updates_fields(client) -> None:
    create_resp = client.post(
        "/expenses",
        json={"date": "2025-06-01", "expense_type": "fuel", "amount": 100, "note": "old"},
    )
    assert create_resp.status_code == 201
    expense_id = create_resp.json()["id"]

    patch_resp = client.patch(f"/expenses/{expense_id}", json={"amount": 200, "note": "new"})
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["amount"] == 200
    assert body["note"] == "new"


def test_expense_patch_returns_404(client) -> None:
    resp = client.patch("/expenses/nonexistent-id-xxxx", json={"amount": 200, "note": "new"})
    assert resp.status_code == 404


def test_expense_patch_ledger_consistency(client) -> None:
    init_inventory(client, date="2025-05-31")

    create_resp = client.post(
        "/expenses",
        json={
            "date": "2025-06-01",
            "expense_type": "fuel",
            "amount": 100,
            "note": "old",
            "happened_at": "2025-06-01T10:00:00",
        },
    )
    assert create_resp.status_code == 201
    expense_id = create_resp.json()["id"]

    patch_resp = client.patch(f"/expenses/{expense_id}", json={"amount": 200})
    assert patch_resp.status_code == 200

    report_resp = client.get("/reports/day", params={"date": "2025-06-01"})
    assert report_resp.status_code == 200
    expenses = [event for event in report_resp.json()["events"] if event["event_type"] == "expense"]
    assert len(expenses) == 1
    cash_delta = expenses[0]["cash_before"] - expenses[0]["cash_after"]
    assert cash_delta == 200
    assert cash_delta != 100
