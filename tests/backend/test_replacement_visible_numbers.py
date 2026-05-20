from datetime import date, timedelta

from tests.backend.conftest import create_customer, create_order, get_daily_row, init_inventory


TODAY = date(2026, 5, 14)
YESTERDAY = date(2026, 5, 13)


def _at(day: date, hour: int) -> str:
    return f"{day.isoformat()}T{hour:02d}:00:00"


def _seed_wallet(client, *, day: date, amount: int = 1000) -> None:
    resp = client.post(
        "/cash/adjust",
        json={
            "happened_at": _at(day - timedelta(days=1), 18),
            "delta_cash": amount,
            "reason": "opening wallet",
        },
    )
    assert resp.status_code == 201, resp.text


def _seed_company_balances(client, *, day: date, money: int = 200, cyl12: int = 5, cyl48: int = 3) -> None:
    resp = client.post(
        "/company/balances/adjust",
        json={
            "happened_at": _at(day - timedelta(days=1), 19),
            "money_balance": money,
            "cylinder_balance_12": cyl12,
            "cylinder_balance_48": cyl48,
            "note": "opening company balance",
        },
    )
    assert resp.status_code == 201, resp.text


def _create_system(client, *, customer_id: str, gas_type: str = "12kg", name: str = "Kitchen") -> str:
    resp = client.post(
        "/systems",
        json={
            "customer_id": customer_id,
            "name": name,
            "gas_type": gas_type,
            "is_active": True,
            "requires_security_check": False,
            "security_check_exists": False,
            "last_security_check_at": None,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _seed_default_state(client, *, day: date = TODAY) -> dict[str, str]:
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=4, empty48=2)
    _seed_wallet(client, day=day, amount=1000)
    _seed_company_balances(client, day=day, money=200, cyl12=5, cyl48=3)

    customer_a = create_customer(client, name="Replacement Customer A")
    customer_b = create_customer(client, name="Replacement Customer B")
    return {
        "customer_a": customer_a,
        "customer_b": customer_b,
        "system_a_12": _create_system(client, customer_id=customer_a, gas_type="12kg", name="A 12kg"),
        "system_a_48": _create_system(client, customer_id=customer_a, gas_type="48kg", name="A 48kg"),
        "system_b_12": _create_system(client, customer_id=customer_b, gas_type="12kg", name="B 12kg"),
    }


def _day_report(client, day: date) -> dict:
    resp = client.get("/reports/day", params={"date": day.isoformat()})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _event_by_source(report: dict, source_id: str) -> dict:
    return next(event for event in report["events"] if event.get("source_id") == source_id)


def _transition(event: dict, *, scope: str, component: str) -> dict | None:
    return next(
        (
            transition
            for transition in event.get("balance_transitions", [])
            if transition["scope"] == scope and transition["component"] == component
        ),
        None,
    )


def _orders(client, *, customer_id: str | None = None, include_deleted: bool = False) -> list[dict]:
    params: dict[str, str | bool] = {"include_deleted": include_deleted}
    if customer_id:
        params["customerId"] = customer_id
    resp = client.get("/orders", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _customer_balances(client, customer_id: str) -> dict:
    resp = client.get(f"/customers/{customer_id}/balances")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _company_balances(client) -> dict:
    resp = client.get("/company/balances")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _assert_company_unchanged(client) -> None:
    company = _company_balances(client)
    assert company["company_money"] == 200
    assert company["company_cyl_12"] == 5
    assert company["company_cyl_48"] == 3


def _assert_inventory(snapshot: dict, *, full12: int, empty12: int, full48: int, empty48: int) -> None:
    assert snapshot["full12"] == full12
    assert snapshot["empty12"] == empty12
    assert snapshot["full48"] == full48
    assert snapshot["empty48"] == empty48


def _assert_activity_inventory(
    snapshot: dict,
    *,
    full12: int | None = None,
    empty12: int | None = None,
    full48: int | None = None,
    empty48: int | None = None,
) -> None:
    assert snapshot["full12"] == full12
    assert snapshot["empty12"] == empty12
    assert snapshot["full48"] == full48
    assert snapshot["empty48"] == empty48


def _assert_customer_totals(client, customer_id: str, *, money: int, cyl12: int, cyl48: int) -> None:
    balances = _customer_balances(client, customer_id)
    assert balances["money_balance"] == money
    assert balances["cylinder_balance_12kg"] == cyl12
    assert balances["cylinder_balance_48kg"] == cyl48


def _assert_order_event_fields(
    event: dict,
    *,
    gas_type: str,
    installed: int,
    received: int,
    total: int,
    paid: int,
    mode: str = "replacement",
) -> None:
    assert event["order_mode"] == mode
    assert event["gas_type"] == gas_type
    assert event["order_installed"] == installed
    assert event["order_received"] == received
    assert event["order_total"] == total
    assert event["order_paid"] == paid


def _assert_daily_row(row: dict, *, sold12: int, sold48: int, net: int, wallet: int) -> None:
    assert row["sold_12kg"] == sold12
    assert row["sold_48kg"] == sold48
    assert row["net_today"] == net
    assert row.get("cash_end", row.get("wallet_end")) == wallet


def _main_replacement(client, ids: dict[str, str], *, day: date = TODAY, hour: int = 9) -> str:
    return create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        delivered_at=_at(day, hour),
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=100,
        paid_amount=70,
    )


def test_add_and_delete_replacement_today_updates_every_visible_number(client) -> None:
    ids = _seed_default_state(client)

    order_id = _main_replacement(client, ids, day=TODAY, hour=9)

    report = _day_report(client, TODAY)
    event = _event_by_source(report, order_id)
    assert event["wallet_before"] == 1000
    assert event["wallet_after"] == 1070
    _assert_order_event_fields(event, gas_type="12kg", installed=2, received=1, total=100, paid=70)
    _assert_activity_inventory(event["inventory_before"], full12=10, empty12=5)
    _assert_activity_inventory(event["inventory_after"], full12=8, empty12=6)
    assert event["customer_money_before"] == 0
    assert event["customer_money_after"] == 30
    assert event["customer_12kg_before"] == 0
    assert event["customer_12kg_after"] == 1
    assert event["customer_48kg_before"] == 0
    assert event["customer_48kg_after"] == 0
    money_transition = _transition(event, scope="customer", component="money")
    assert money_transition["scope"] == "customer"
    assert money_transition["component"] == "money"
    assert money_transition["before"] == 0
    assert money_transition["after"] == 30
    assert money_transition["display_name"] == "Replacement Customer A"
    assert money_transition["display_description"] in (None, "")
    assert money_transition["intent"] is None
    assert _transition(event, scope="customer", component="cyl_12")["after"] == 1
    assert _transition(event, scope="customer", component="cyl_48") is None

    _assert_inventory(report["inventory_end"], full12=8, empty12=6, full48=4, empty48=2)
    assert report["wallet_end"] == 1070
    _assert_daily_row(get_daily_row(client, TODAY.isoformat()), sold12=2, sold48=0, net=70, wallet=1070)
    _assert_customer_totals(client, ids["customer_a"], money=30, cyl12=1, cyl48=0)
    _assert_customer_totals(client, ids["customer_b"], money=0, cyl12=0, cyl48=0)
    _assert_company_unchanged(client)

    orders = _orders(client, customer_id=ids["customer_a"])
    assert [order["id"] for order in orders] == [order_id]
    assert orders[0]["money_balance_before"] == 0
    assert orders[0]["money_balance_after"] == 30
    assert orders[0]["cyl_balance_before"] == {"12kg": 0, "48kg": 0}
    assert orders[0]["cyl_balance_after"] == {"12kg": 1, "48kg": 0}

    delete_resp = client.delete(f"/orders/{order_id}")
    assert delete_resp.status_code == 204

    report_after_delete = _day_report(client, TODAY)
    assert not any(event.get("source_id") == order_id for event in report_after_delete["events"])
    _assert_inventory(report_after_delete["inventory_end"], full12=10, empty12=5, full48=4, empty48=2)
    assert report_after_delete["wallet_end"] == 1000
    _assert_daily_row(get_daily_row(client, TODAY.isoformat()), sold12=0, sold48=0, net=0, wallet=1000)
    _assert_customer_totals(client, ids["customer_a"], money=0, cyl12=0, cyl48=0)
    assert not _orders(client, customer_id=ids["customer_a"])
    deleted_orders = _orders(client, customer_id=ids["customer_a"], include_deleted=True)
    assert deleted_orders[0]["id"] == order_id
    assert deleted_orders[0]["is_deleted"] is True
    _assert_company_unchanged(client)


def test_backdated_add_and_delete_recomputes_later_daily_and_order_snapshots(client) -> None:
    ids = _seed_default_state(client, day=YESTERDAY)
    later_order_id = create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        delivered_at=_at(TODAY, 9),
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=50,
        paid_amount=50,
    )

    before_today = _event_by_source(_day_report(client, TODAY), later_order_id)
    backdated_id = _main_replacement(client, ids, day=YESTERDAY, hour=10)

    yesterday = _day_report(client, YESTERDAY)
    backdated = _event_by_source(yesterday, backdated_id)
    assert backdated["wallet_before"] == 1000
    assert backdated["wallet_after"] == 1070
    _assert_order_event_fields(backdated, gas_type="12kg", installed=2, received=1, total=100, paid=70)
    _assert_activity_inventory(backdated["inventory_after"], full12=8, empty12=6)
    _assert_daily_row(get_daily_row(client, YESTERDAY.isoformat()), sold12=2, sold48=0, net=70, wallet=1070)

    after_today = _event_by_source(_day_report(client, TODAY), later_order_id)
    assert after_today["wallet_before"] == before_today["wallet_before"] + 70
    assert after_today["wallet_after"] == before_today["wallet_after"] + 70
    assert after_today["inventory_before"]["full12"] == before_today["inventory_before"]["full12"] - 2
    assert after_today["inventory_before"]["empty12"] == before_today["inventory_before"]["empty12"] + 1
    assert after_today["customer_money_before"] == before_today["customer_money_before"] + 30
    assert after_today["customer_money_after"] == before_today["customer_money_after"] + 30
    assert after_today["customer_12kg_before"] == before_today["customer_12kg_before"] + 1
    assert after_today["customer_12kg_after"] == before_today["customer_12kg_after"] + 1

    order_snapshot = next(order for order in _orders(client, customer_id=ids["customer_a"]) if order["id"] == later_order_id)
    assert order_snapshot["money_balance_before"] == 30
    assert order_snapshot["money_balance_after"] == 30
    assert order_snapshot["cyl_balance_before"] == {"12kg": 1, "48kg": 0}
    assert order_snapshot["cyl_balance_after"] == {"12kg": 2, "48kg": 0}
    _assert_customer_totals(client, ids["customer_a"], money=30, cyl12=2, cyl48=0)
    _assert_company_unchanged(client)

    delete_resp = client.delete(f"/orders/{backdated_id}")
    assert delete_resp.status_code == 204

    yesterday_after_delete = _day_report(client, YESTERDAY)
    assert not any(event.get("source_id") == backdated_id for event in yesterday_after_delete["events"])
    _assert_daily_row(get_daily_row(client, YESTERDAY.isoformat()), sold12=0, sold48=0, net=0, wallet=1000)
    restored_today = _event_by_source(_day_report(client, TODAY), later_order_id)
    assert restored_today["wallet_before"] == before_today["wallet_before"]
    assert restored_today["inventory_before"] == before_today["inventory_before"]
    assert restored_today["customer_money_before"] == before_today["customer_money_before"]
    assert restored_today["customer_12kg_before"] == before_today["customer_12kg_before"]
    _assert_customer_totals(client, ids["customer_a"], money=0, cyl12=1, cyl48=0)
    _assert_company_unchanged(client)


def test_insert_replacement_before_existing_chain_replays_global_and_customer_balances(client) -> None:
    ids = _seed_default_state(client)

    nine = create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        delivered_at=_at(TODAY, 9),
        gas_type="12kg",
        installed=1,
        received=1,
        price_total=50,
        paid_amount=50,
    )
    ten = create_order(
        client,
        customer_id=ids["customer_b"],
        system_id=ids["system_b_12"],
        delivered_at=_at(TODAY, 10),
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=80,
        paid_amount=30,
    )
    eleven = create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        delivered_at=_at(TODAY, 11),
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=40,
        paid_amount=0,
    )
    eight = _main_replacement(client, ids, day=TODAY, hour=8)

    report = _day_report(client, TODAY)
    event_08 = _event_by_source(report, eight)
    event_09 = _event_by_source(report, nine)
    event_10 = _event_by_source(report, ten)
    event_11 = _event_by_source(report, eleven)

    assert event_08["wallet_before"] == 1000
    assert event_08["wallet_after"] == 1070
    _assert_order_event_fields(event_08, gas_type="12kg", installed=2, received=1, total=100, paid=70)
    _assert_activity_inventory(event_08["inventory_before"], full12=10, empty12=5)
    _assert_activity_inventory(event_08["inventory_after"], full12=8, empty12=6)
    assert event_08["customer_money_before"] == 0
    assert event_08["customer_money_after"] == 30
    assert event_08["customer_12kg_before"] == 0
    assert event_08["customer_12kg_after"] == 1

    assert event_09["wallet_before"] == 1070
    assert event_09["wallet_after"] == 1120
    _assert_activity_inventory(event_09["inventory_before"], full12=8, empty12=6)
    _assert_activity_inventory(event_09["inventory_after"], full12=7, empty12=7)
    assert event_09["customer_money_before"] == 30
    assert event_09["customer_money_after"] == 30
    assert event_09["customer_12kg_before"] == 1
    assert event_09["customer_12kg_after"] == 1

    assert event_10["wallet_before"] == 1120
    assert event_10["wallet_after"] == 1150
    _assert_activity_inventory(event_10["inventory_before"], full12=7, empty12=7)
    _assert_activity_inventory(event_10["inventory_after"], full12=6, empty12=7)
    assert event_10["customer_money_before"] == 0
    assert event_10["customer_money_after"] == 50
    assert event_10["customer_12kg_before"] == 0
    assert event_10["customer_12kg_after"] == 1

    assert event_11["wallet_before"] == 1150
    assert event_11["wallet_after"] == 1150
    _assert_activity_inventory(event_11["inventory_before"], full12=6, empty12=7)
    _assert_activity_inventory(event_11["inventory_after"], full12=5, empty12=7)
    assert event_11["customer_money_before"] == 30
    assert event_11["customer_money_after"] == 70
    assert event_11["customer_12kg_before"] == 1
    assert event_11["customer_12kg_after"] == 2

    _assert_inventory(report["inventory_end"], full12=5, empty12=7, full48=4, empty48=2)
    assert report["wallet_end"] == 1150
    _assert_daily_row(get_daily_row(client, TODAY.isoformat()), sold12=5, sold48=0, net=150, wallet=1150)
    _assert_customer_totals(client, ids["customer_a"], money=70, cyl12=2, cyl48=0)
    _assert_customer_totals(client, ids["customer_b"], money=50, cyl12=1, cyl48=0)
    _assert_company_unchanged(client)


def test_same_customer_same_day_sequence_chains_and_delete_second_only(client) -> None:
    ids = _seed_default_state(client)
    first = _main_replacement(client, ids, day=TODAY, hour=9)
    second = create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        delivered_at=_at(TODAY, 10),
        gas_type="12kg",
        installed=1,
        received=0,
        price_total=50,
        paid_amount=50,
    )

    report = _day_report(client, TODAY)
    first_event = _event_by_source(report, first)
    second_event = _event_by_source(report, second)
    assert first_event["wallet_after"] == 1070
    _assert_order_event_fields(first_event, gas_type="12kg", installed=2, received=1, total=100, paid=70)
    _assert_activity_inventory(first_event["inventory_after"], full12=8, empty12=6)
    assert first_event["customer_money_after"] == 30
    assert first_event["customer_12kg_after"] == 1

    assert second_event["wallet_before"] == 1070
    assert second_event["wallet_after"] == 1120
    _assert_order_event_fields(second_event, gas_type="12kg", installed=1, received=0, total=50, paid=50)
    _assert_activity_inventory(second_event["inventory_before"], full12=8, empty12=6)
    _assert_activity_inventory(second_event["inventory_after"], full12=7, empty12=6)
    assert second_event["customer_money_before"] == 30
    assert second_event["customer_money_after"] == 30
    assert second_event["customer_12kg_before"] == 1
    assert second_event["customer_12kg_after"] == 2

    delete_resp = client.delete(f"/orders/{second}")
    assert delete_resp.status_code == 204

    report_after_delete = _day_report(client, TODAY)
    first_after_delete = _event_by_source(report_after_delete, first)
    assert not any(event.get("source_id") == second for event in report_after_delete["events"])
    assert first_after_delete["wallet_after"] == 1070
    _assert_activity_inventory(first_after_delete["inventory_after"], full12=8, empty12=6)
    assert first_after_delete["customer_money_after"] == 30
    assert first_after_delete["customer_12kg_after"] == 1
    _assert_inventory(report_after_delete["inventory_end"], full12=8, empty12=6, full48=4, empty48=2)
    assert report_after_delete["wallet_end"] == 1070
    _assert_customer_totals(client, ids["customer_a"], money=30, cyl12=1, cyl48=0)
    _assert_company_unchanged(client)


def test_payment_and_cylinder_edge_cases_control_visible_transition_pills(client) -> None:
    ids = _seed_default_state(client)
    fully_paid = create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        delivered_at=_at(TODAY, 9),
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=100,
        paid_amount=100,
    )
    zero_paid = create_order(
        client,
        customer_id=ids["customer_b"],
        system_id=ids["system_b_12"],
        delivered_at=_at(TODAY, 10),
        gas_type="12kg",
        installed=2,
        received=1,
        price_total=100,
        paid_amount=0,
    )
    equal_exchange = create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_12"],
        delivered_at=_at(TODAY, 11),
        gas_type="12kg",
        installed=2,
        received=2,
        price_total=100,
        paid_amount=70,
    )

    report = _day_report(client, TODAY)
    fully_paid_event = _event_by_source(report, fully_paid)
    _assert_order_event_fields(fully_paid_event, gas_type="12kg", installed=2, received=1, total=100, paid=100)
    assert fully_paid_event["wallet_after"] - fully_paid_event["wallet_before"] == 100
    assert fully_paid_event["customer_money_before"] == fully_paid_event["customer_money_after"] == 0
    assert _transition(fully_paid_event, scope="customer", component="money") is None
    assert _transition(fully_paid_event, scope="customer", component="cyl_12")["after"] == 1

    zero_paid_event = _event_by_source(report, zero_paid)
    _assert_order_event_fields(zero_paid_event, gas_type="12kg", installed=2, received=1, total=100, paid=0)
    assert zero_paid_event["wallet_after"] == zero_paid_event["wallet_before"]
    assert zero_paid_event["customer_money_before"] == 0
    assert zero_paid_event["customer_money_after"] == 100
    assert zero_paid_event["customer_12kg_after"] == 1
    assert _transition(zero_paid_event, scope="customer", component="money")["after"] == 100
    assert _transition(zero_paid_event, scope="customer", component="cyl_12")["after"] == 1

    equal_event = _event_by_source(report, equal_exchange)
    _assert_order_event_fields(equal_event, gas_type="12kg", installed=2, received=2, total=100, paid=70)
    assert equal_event["wallet_after"] - equal_event["wallet_before"] == 70
    assert equal_event["customer_money_before"] == 0
    assert equal_event["customer_money_after"] == 30
    assert equal_event["customer_12kg_before"] == equal_event["customer_12kg_after"] == 1
    assert _transition(equal_event, scope="customer", component="money")["after"] == 30
    assert _transition(equal_event, scope="customer", component="cyl_12") is None
    _assert_activity_inventory(equal_event["inventory_before"], full12=6, empty12=7)
    _assert_activity_inventory(equal_event["inventory_after"], full12=4, empty12=9)
    _assert_company_unchanged(client)


def test_48kg_replacement_isolated_from_12kg_and_delete_only_48kg(client) -> None:
    ids = _seed_default_state(client)
    order_48 = create_order(
        client,
        customer_id=ids["customer_a"],
        system_id=ids["system_a_48"],
        delivered_at=_at(TODAY, 9),
        gas_type="48kg",
        installed=1,
        received=0,
        price_total=200,
        paid_amount=150,
    )
    order_12 = _main_replacement(client, ids, day=TODAY, hour=10)

    report = _day_report(client, TODAY)
    event_48 = _event_by_source(report, order_48)
    event_12 = _event_by_source(report, order_12)
    _assert_order_event_fields(event_48, gas_type="48kg", installed=1, received=0, total=200, paid=150)
    _assert_activity_inventory(event_48["inventory_before"], full48=4, empty48=2)
    _assert_activity_inventory(event_48["inventory_after"], full48=3, empty48=2)
    assert event_48["customer_money_after"] == 50
    assert event_48["customer_12kg_before"] == event_48["customer_12kg_after"] == 0
    assert event_48["customer_48kg_before"] == 0
    assert event_48["customer_48kg_after"] == 1

    _assert_activity_inventory(event_12["inventory_before"], full12=10, empty12=5)
    _assert_order_event_fields(event_12, gas_type="12kg", installed=2, received=1, total=100, paid=70)
    _assert_activity_inventory(event_12["inventory_after"], full12=8, empty12=6)
    assert event_12["customer_money_before"] == 50
    assert event_12["customer_money_after"] == 80
    assert event_12["customer_12kg_before"] == 0
    assert event_12["customer_12kg_after"] == 1
    assert event_12["customer_48kg_before"] == event_12["customer_48kg_after"] == 1
    _assert_daily_row(get_daily_row(client, TODAY.isoformat()), sold12=2, sold48=1, net=220, wallet=1220)

    delete_resp = client.delete(f"/orders/{order_48}")
    assert delete_resp.status_code == 204

    report_after_delete = _day_report(client, TODAY)
    event_12_after_delete = _event_by_source(report_after_delete, order_12)
    assert not any(event.get("source_id") == order_48 for event in report_after_delete["events"])
    _assert_activity_inventory(event_12_after_delete["inventory_before"], full12=10, empty12=5)
    _assert_activity_inventory(event_12_after_delete["inventory_after"], full12=8, empty12=6)
    assert event_12_after_delete["customer_money_before"] == 0
    assert event_12_after_delete["customer_money_after"] == 30
    assert event_12_after_delete["customer_12kg_after"] == 1
    assert event_12_after_delete["customer_48kg_after"] == 0
    _assert_inventory(report_after_delete["inventory_end"], full12=8, empty12=6, full48=4, empty48=2)
    assert report_after_delete["wallet_end"] == 1070
    _assert_daily_row(get_daily_row(client, TODAY.isoformat()), sold12=2, sold48=0, net=70, wallet=1070)
    _assert_company_unchanged(client)
