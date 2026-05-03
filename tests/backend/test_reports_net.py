from __future__ import annotations

from datetime import date

from tests.backend.conftest import create_customer, create_order, create_system, get_daily_row


def test_daily_net_excludes_same_day_system_init(client) -> None:
    day = date.today().isoformat()

    resp = client.post(
        "/system/initialize",
        json={
            "sell_price_12": 100,
            "sell_price_48": 200,
            "buy_price_12": 0,
            "buy_price_48": 0,
            "full_12": 50,
            "empty_12": 50,
            "full_48": 50,
            "empty_48": 50,
            "cash_start": 1000,
            "company_payable_money": 0,
            "company_full_12kg": 0,
            "company_full_48kg": 0,
            "company_empty_12kg": 0,
            "company_empty_48kg": 0,
        },
    )
    assert resp.status_code == 200, resp.text

    row = get_daily_row(client, day)
    assert row["cash_end"] == 1000
    assert row["net_today"] == 0


def test_daily_net_excludes_bank_transfers_but_keeps_customer_cash_events(client) -> None:
    day = date(2026, 5, 2)
    day_iso = day.isoformat()

    init_resp = client.post(
        "/system/initialize",
        json={
            "sell_price_12": 170,
            "sell_price_48": 200,
            "buy_price_12": 0,
            "buy_price_48": 0,
            "full_12": 50,
            "empty_12": 50,
            "full_48": 50,
            "empty_48": 50,
            "cash_start": 1000,
            "company_payable_money": 0,
            "company_full_12kg": 0,
            "company_full_48kg": 0,
            "company_empty_12kg": 0,
            "company_empty_48kg": 0,
        },
    )
    assert init_resp.status_code == 200, init_resp.text

    transfer = client.post(
        "/cash/bank_deposit",
        json={
            "happened_at": f"{day_iso}T09:00:00",
            "amount": 300,
            "direction": "wallet_to_bank",
            "note": "move to bank",
        },
    )
    assert transfer.status_code == 201, transfer.text

    customer_id = create_customer(client, name="Net Customer")
    system_id = create_system(client, customer_id=customer_id, name="Net System")
    create_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        delivered_at=f"{day_iso}T10:00:00",
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=170,
        paid_amount=170,
    )

    row = get_daily_row(client, day_iso)
    assert row["cash_end"] == 870
    assert row["net_today"] == 170
