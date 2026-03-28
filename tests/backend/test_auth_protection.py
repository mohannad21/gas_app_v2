def test_health_route_remains_public(client):
    saved = client.headers.pop("Authorization", None)
    try:
        response = client.get("/health")
    finally:
        if saved:
            client.headers["Authorization"] = saved
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_protected_route_rejects_missing_auth(client):
    saved = client.headers.pop("Authorization", None)
    try:
        response = client.get("/customers")
    finally:
        if saved:
            client.headers["Authorization"] = saved
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_protected_route_allows_valid_auth(client):
    response = client.get("/customers")
    assert response.status_code == 200
