from app.constants import DEFAULT_CURRENCY_CODE


def test_system_settings_defaults(client) -> None:
    resp = client.get("/system/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["currency_code"] == DEFAULT_CURRENCY_CODE
    assert data["is_setup_completed"] is False
