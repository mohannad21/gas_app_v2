from tests.conftest import init_inventory


def _get_daily_v2(client, day: str) -> dict:
    rows = client.get(f"/reports/daily_v2?from={day}&to={day}").json()
    assert rows
    return rows[0]


def test_refill_details_time_correct_after_edit(client) -> None:
    init_inventory(client, date="2025-01-01")

    refill_resp = client.post(
        "/inventory/refill",
        json={
            "date": "2025-01-01",
            "time_of_day": "morning",
            "buy12": 2,
            "return12": 3,
            "buy48": 1,
            "return48": 2,
            "reason": "first",
        },
    )
    assert refill_resp.status_code == 201

    refills = client.get("/inventory/refills").json()
    assert refills
    refill_id = refills[0]["refill_id"]

    details = client.get(f"/inventory/refills/{refill_id}").json()
    assert details["before_full_12"] == 50
    assert details["before_empty_12"] == 10
    assert details["before_full_48"] == 20
    assert details["before_empty_48"] == 5
    assert details["after_full_12"] == 52
    assert details["after_empty_12"] == 7
    assert details["after_full_48"] == 21
    assert details["after_empty_48"] == 3

    daily_before = _get_daily_v2(client, "2025-01-02")
    assert daily_before["inventory_start"]["full12"] == 52
    assert daily_before["inventory_start"]["empty12"] == 7
    assert daily_before["inventory_start"]["full48"] == 21
    assert daily_before["inventory_start"]["empty48"] == 3

    adjust_resp = client.post(
        "/inventory/adjust",
        json={
            "date": "2025-01-03",
            "gas_type": "12kg",
            "delta_full": -1,
            "delta_empty": 0,
            "reason": "later",
        },
    )
    assert adjust_resp.status_code == 201

    update_resp = client.put(
        f"/inventory/refills/{refill_id}",
        json={
            "buy12": 1,
            "return12": 2,
            "buy48": 0,
            "return48": 1,
            "reason": "edit",
        },
    )
    assert update_resp.status_code == 200

    details_updated = client.get(f"/inventory/refills/{refill_id}").json()
    assert details_updated["before_full_12"] == 50
    assert details_updated["before_empty_12"] == 10
    assert details_updated["before_full_48"] == 20
    assert details_updated["before_empty_48"] == 5
    assert details_updated["after_full_12"] == 51
    assert details_updated["after_empty_12"] == 8
    assert details_updated["after_full_48"] == 20
    assert details_updated["after_empty_48"] == 4

    daily_after = _get_daily_v2(client, "2025-01-02")
    assert daily_after["inventory_start"]["full12"] == 51
    assert daily_after["inventory_start"]["empty12"] == 8
    assert daily_after["inventory_start"]["full48"] == 20
    assert daily_after["inventory_start"]["empty48"] == 4
