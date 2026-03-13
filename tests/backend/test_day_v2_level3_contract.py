from datetime import date, timedelta

from conftest import create_customer, create_system, init_inventory, iso_at


def _major(amount: int, decimals: int = 2) -> int:
    scale = 10 ** decimals
    return int(round(amount / scale))


def _post_order(
    client,
    *,
    customer_id: str,
    system_id: str,
    happened_at: str,
    order_mode: str = "replacement",
    gas_type: str = "12kg",
    installed: int = 0,
    received: int = 0,
    total: int = 0,
    paid: int = 0,
) -> str:
    resp = client.post(
        "/orders",
        json={
            "customer_id": customer_id,
            "system_id": system_id,
            "happened_at": happened_at,
            "order_mode": order_mode,
            "gas_type": gas_type,
            "cylinders_installed": installed,
            "cylinders_received": received,
            "price_total": total,
            "paid_amount": paid,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _get_event(report_json: dict, source_id: str) -> dict:
    return next(event for event in report_json["events"] if event["source_id"] == source_id)


def test_level3_replacement_settled_fields(client) -> None:
    day = date(2025, 11, 1)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)
    customer_id = create_customer(client, name="Level3 Settled")
    system_id = create_system(client, customer_id=customer_id)

    order_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        installed=1,
        received=1,
        total=100,
        paid=100,
    )

    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = _get_event(report.json(), order_id)

    assert event["id"]
    assert event["counterparty"]["type"] == "customer"
    assert event["system"] is not None
    assert event["system"]["display_name"]
    assert event["hero_primary"].startswith("Installed")
    assert event["money_delta"] == _major(100)
    assert event["notes"] == []
    assert event["status"] == "atomic_ok"
    assert event["settlement"]["is_settled"] is True


def test_level3_replacement_unsettled_actions(client) -> None:
    day = date(2025, 11, 2)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)
    customer_id = create_customer(client, name="Level3 Unsettled")
    system_id = create_system(client, customer_id=customer_id)

    order_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        installed=2,
        received=1,
        total=100,
        paid=50,
    )

    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = _get_event(report.json(), order_id)

    assert event["settlement"]["is_settled"] is False
    assert event["status"] == "needs_action"
    notes = event["notes"]
    assert any(note["direction"] == "customer_pays_you" for note in notes)
    assert any(note["direction"] == "customer_returns_you" and note["kind"] == "cyl_12" for note in notes)


def test_level3_replacement_owe_full_action(client) -> None:
    day = date(2025, 11, 3)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)
    customer_id = create_customer(client, name="Level3 Owe Full")
    system_id = create_system(client, customer_id=customer_id)

    order_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        installed=1,
        received=2,
        total=0,
        paid=0,
    )

    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = _get_event(report.json(), order_id)

    notes = event["notes"]
    assert any(note["direction"] == "you_deliver_customer" and note["kind"] == "cyl_full_12" for note in notes)


def test_level3_late_pay_not_settled_with_cylinders(client) -> None:
    day = date(2025, 11, 4)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)
    customer_id = create_customer(client, name="Level3 Late Pay")
    system_id = create_system(client, customer_id=customer_id)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        installed=2,
        received=0,
        total=100,
        paid=0,
    )

    payment = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 100,
            "happened_at": iso_at(day.isoformat(), "evening"),
        },
    )
    assert payment.status_code == 201
    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = next(event for event in report.json()["events"] if event["event_type"] == "collection_money")

    assert event["event_type"] == "collection_money"
    assert event["settlement"]["is_settled"] is False
    assert event["status"] == "needs_action"
    notes = event["notes"]
    assert len(notes) == 1
    assert notes[0]["direction"] == "customer_pays_you"
    assert event["has_other_outstanding_cylinders"] is True


def test_level3_company_refill_unsettled_actions(client) -> None:
    day = date(2025, 11, 5)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)

    resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "buy12": 5,
            "return12": 2,
            "buy48": 0,
            "return48": 0,
            "total_cost": 500,
            "paid_now": 100,
        },
    )
    assert resp.status_code == 200

    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = next(event for event in report.json()["events"] if event["event_type"] == "refill")

    assert event["event_type"] == "refill"
    assert event["settlement"]["is_settled"] is False
    assert event["notes"] == []
    actions = event["action_pills"]
    assert any(action["direction"] == "dist->company" and action["kind"] == "money" for action in actions)
    assert any(action["direction"] == "dist->company" and action["kind"] == "empty_12" for action in actions)


def test_level3_company_settle_receive_full_is_distinguishable(client) -> None:
    day = date(2025, 11, 5)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)

    resp = client.post(
        "/company/cylinders/settle",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "gas_type": "12kg",
            "quantity": 3,
            "direction": "receive_full",
        },
    )
    assert resp.status_code == 201

    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = next(event for event in report.json()["events"] if event["event_type"] == "refill")

    assert event["label"] == "Company Settle"
    assert event["hero"]["text"] == "Company Settle"
    assert event["hero_text"] == "Received 3x12kg full from company"
    assert event["event_kind"] == "company_settle_receive_full"
    assert event["activity_type"] == "company_settle_receive_full"
    assert event["status_mode"] == "settlement"


def test_level3_company_settle_return_empty_is_distinguishable(client) -> None:
    day = date(2025, 11, 6)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)

    resp = client.post(
        "/company/cylinders/settle",
        json={
            "happened_at": iso_at(day.isoformat(), "morning"),
            "gas_type": "48kg",
            "quantity": 2,
            "direction": "return_empty",
        },
    )
    assert resp.status_code == 201

    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = next(event for event in report.json()["events"] if event["event_type"] == "refill")

    assert event["label"] == "Company Settle"
    assert event["hero"]["text"] == "Company Settle"
    assert event["hero_text"] == "Returned 2x48kg empties to company"
    assert event["event_kind"] == "company_settle_return_empty"
    assert event["activity_type"] == "company_settle_return_empty"
    assert event["status_mode"] == "settlement"


def test_level3_system_only_for_replacement(client) -> None:
    day = date(2025, 11, 6)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)
    customer_id = create_customer(client, name="Level3 System")
    system_id = create_system(client, customer_id=customer_id)

    sell_id = _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="sell_iron",
        installed=1,
        received=0,
        total=100,
        paid=100,
    )

    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = _get_event(report.json(), sell_id)

    assert event["event_type"] == "order"
    assert event["order_mode"] == "sell_iron"
    assert event["system"] is None


def test_level3_money_delta_matches_hero_primary(client) -> None:
    day = date(2025, 11, 7)
    init_inventory(client, date=(day - timedelta(days=1)).isoformat(), full12=10, empty12=5, full48=6, empty48=3)
    customer_id = create_customer(client, name="Level3 Money")
    system_id = create_system(client, customer_id=customer_id)

    _post_order(
        client,
        customer_id=customer_id,
        system_id=system_id,
        happened_at=iso_at(day.isoformat(), "morning"),
        order_mode="replacement",
        installed=1,
        received=1,
        total=12300,
        paid=12300,
    )

    payment = client.post(
        "/collections",
        json={
            "customer_id": customer_id,
            "action_type": "payment",
            "amount_money": 45600,
            "happened_at": iso_at(day.isoformat(), "evening"),
        },
    )
    assert payment.status_code == 201

    report = client.get("/reports/day_v2", params={"date": day.isoformat()})
    assert report.status_code == 200
    event = next(event for event in report.json()["events"] if event["event_type"] == "collection_money")

    assert event["hero_primary"] == f"Collected ₪{_major(45600)}"
    assert event["money_delta"] == _major(45600)
