from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import create_customer, create_system, init_inventory


def _get_order(client: TestClient, order_id: str) -> dict:
  resp = client.get("/orders")
  assert resp.status_code == 200
  return next(item for item in resp.json() if item["id"] == order_id)


def _get_collection(client: TestClient, collection_id: str) -> dict:
  resp = client.get("/collections")
  assert resp.status_code == 200
  return next(item for item in resp.json() if item["id"] == collection_id)


def _get_customer(client: TestClient, customer_id: str) -> dict:
  resp = client.get("/customers")
  assert resp.status_code == 200
  return next(item for item in resp.json() if item["id"] == customer_id)


def test_rebuild_customer_ledger_updates_snapshots(client: TestClient) -> None:
  init_inventory(client, date="2025-01-01", full12=10, empty12=0, full48=0, empty48=0)
  customer_id = create_customer(client, name="Ledger Tester")
  system_id = create_system(client, customer_id=customer_id)

  order_payload = {
    "customer_id": customer_id,
    "system_id": system_id,
    "delivered_at": "2025-01-02T10:00:00",
    "gas_type": "12kg",
    "cylinders_installed": 0,
    "cylinders_received": 0,
    "price_total": 140.0,
    "paid_amount": 0.0,
    "money_received": 0.0,
    "money_given": 0.0,
  }
  order_resp = client.post("/orders", json=order_payload)
  assert order_resp.status_code == 201
  order_id = order_resp.json()["id"]

  collection_payload = {
    "customer_id": customer_id,
    "action_type": "payment",
    "amount_money": 100.0,
    "effective_at": "2025-01-02T12:00:00",
  }
  collection_resp = client.post("/collections", json=collection_payload)
  assert collection_resp.status_code == 201

  update_resp = client.put(f"/orders/{order_id}", json={"price_total": 200.0})
  assert update_resp.status_code == 200

  customer = _get_customer(client, customer_id)
  assert customer["money_balance"] == 100.0
