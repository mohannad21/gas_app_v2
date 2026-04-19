from __future__ import annotations

from datetime import date, timedelta

from conftest import create_customer, init_inventory


def _cash_init(client, *, day: str, amount: float) -> None:
    resp = client.post(
        "/cash/adjust",
        json={"happened_at": f"{day}T08:00:00", "delta_cash": int(amount), "reason": "open"},
    )
    assert resp.status_code == 201


def test_daily_day_rows_do_not_embed_global_customer_totals(client) -> None:
    day = date(2025, 1, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=0, empty12=0, full48=0, empty48=0)
    _cash_init(client, day=day.isoformat(), amount=0)

    customer_id = create_customer(client, name="Osama")
    adj_resp = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 100,
            "reason": "test",
            "happened_at": f"{day.isoformat()}T08:00:00",
        },
    )
    assert adj_resp.status_code == 201

    pay_resp = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": f"{day.isoformat()}T09:00:00",
        },
    )
    assert pay_resp.status_code == 201

    report_resp = client.get("/reports/daily", params={"from": day.isoformat(), "to": day.isoformat()})
    assert report_resp.status_code == 200
    row = report_resp.json()[0]
    assert "customer_money_receivable" not in row
    assert "customer_money_payable" not in row
    assert "customer_12kg_receivable" not in row
    assert "customer_12kg_payable" not in row
    assert "customer_48kg_receivable" not in row
    assert "customer_48kg_payable" not in row

    day_resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert day_resp.status_code == 200
    day_row = day_resp.json()
    assert "customer_money_receivable" not in day_row
    assert "customer_money_payable" not in day_row


def test_daily_low_activity_day_only_shows_day_local_customer_transition(client) -> None:
    day1 = date(2025, 2, 1)
    day2 = day1 + timedelta(days=1)
    init_inventory(client, date=(day1 - timedelta(days=1)).isoformat(), full12=0, empty12=0, full48=0, empty48=0)
    _cash_init(client, day=day1.isoformat(), amount=0)

    customer_id = create_customer(client, name="Customer A")

    resp_a = client.post(
        "/customer-adjustments",
        json={
            "customer_id": customer_id,
            "amount_money": 1000,
            "reason": "historical debt",
            "happened_at": f"{day1.isoformat()}T08:00:00",
        },
    )
    assert resp_a.status_code == 201
    resp_b = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 50,
            "happened_at": f"{day2.isoformat()}T08:00:00",
        },
    )
    assert resp_b.status_code == 201

    report_resp = client.get("/reports/daily", params={"from": day1.isoformat(), "to": day2.isoformat()})
    assert report_resp.status_code == 200
    rows = {row["date"]: row for row in report_resp.json()}
    row = rows[day2.isoformat()]

    assert "customer_money_receivable" not in row
    assert "customer_money_payable" not in row
    assert len(row["problem_transitions"]) == 1
    transition = row["problem_transitions"][0]
    assert transition["scope"] == "customer"
    assert transition["component"] == "money"
    assert transition["before"] == 1000
    assert transition["after"] == 950
