from conftest import init_inventory, iso_at


def _get_daily(client, day: str) -> dict:
    rows = client.get(f"/reports/daily?from={day}&to={day}").json()
    assert rows
    return rows[0]


def test_refill_details_time_correct_after_edit(client) -> None:
    init_inventory(client, date="2025-01-01")

    refill_resp = client.post(
        "/inventory/refill",
        json={
            "happened_at": iso_at("2025-01-01", "morning"),
            "buy12": 2,
            "return12": 3,
            "buy48": 1,
            "return48": 2,
            "note": "first",
            "total_cost": 0,
            "paid_now": 0,
        },
    )
    assert refill_resp.status_code == 200

    refills = client.get("/inventory/refills").json()
    assert refills
    refill_id = refills[0]["refill_id"]

    details = client.get(f"/inventory/refills/{refill_id}").json()
    assert details["buy12"] == 2
    assert details["return12"] == 3
    assert details["buy48"] == 1
    assert details["return48"] == 2
    assert details["notes"] == "first"

    daily_before = _get_daily(client, "2025-01-02")
    assert daily_before["inventory_start"]["full12"] == 52
    assert daily_before["inventory_start"]["empty12"] == 7
    assert daily_before["inventory_start"]["full48"] == 21
    assert daily_before["inventory_start"]["empty48"] == 3

    adjust_resp = client.post(
        "/inventory/adjust",
        json={
            "happened_at": iso_at("2025-01-03", "morning"),
            "gas_type": "12kg",
            "delta_full": -1,
            "delta_empty": 0,
            "reason": "later",
        },
    )
    assert adjust_resp.status_code == 200

    update_resp = client.put(
        f"/inventory/refills/{refill_id}",
        json={
            "buy12": 1,
            "return12": 2,
            "buy48": 0,
            "return48": 1,
            "note": "edit",
        },
    )
    assert update_resp.status_code == 200

    details_updated = client.get(f"/inventory/refills/{refill_id}").json()
    assert details_updated["buy12"] == 1
    assert details_updated["return12"] == 2
    assert details_updated["buy48"] == 0
    assert details_updated["return48"] == 1
    assert details_updated["notes"] == "edit"

    daily_after = _get_daily(client, "2025-01-02")
    assert daily_after["inventory_start"]["full12"] == 51
    assert daily_after["inventory_start"]["empty12"] == 8
    assert daily_after["inventory_start"]["full48"] == 20
    assert daily_after["inventory_start"]["empty48"] == 4
