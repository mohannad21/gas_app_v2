from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.db import init_db
from app.main import create_app


def _date_list(days: int) -> list[datetime]:
  now = datetime.now(timezone.utc)
  start_day = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
  return [start_day + timedelta(days=offset) for offset in range(days)]


def _post(client: TestClient, path: str, payload: dict) -> dict:
  response = client.post(path, json=payload)
  response.raise_for_status()
  return response.json()


def _seed_prices(client: TestClient, effective_from: str) -> None:
  prices = [
    {
      "gas_type": "12kg",
      "customer_type": "private",
      "selling_price": 90,
      "buying_price": 75,
      "effective_from": effective_from,
    },
    {
      "gas_type": "48kg",
      "customer_type": "private",
      "selling_price": 300,
      "buying_price": 300,
      "effective_from": effective_from,
    },
  ]
  for payload in prices:
    _post(client, "/prices", payload)


def _seed_customers_systems(client: TestClient, count: int) -> list[dict]:
  results = []
  for idx in range(count):
    customer = _post(
      client,
      "/customers",
      {
        "name": f"Customer {idx + 1}",
        "customer_type": "private",
        "notes": "seeded",
      },
    )
    gas_type = "12kg" if idx % 2 == 0 else "48kg"
    system = _post(
      client,
      "/systems",
      {
        "customer_id": customer["id"],
        "name": f"System {idx + 1}",
        "system_type": "main_kitchen",
        "gas_type": gas_type,
        "system_customer_type": "private",
        "is_active": True,
      },
    )
    results.append({"customer": customer, "system": system})
  return results


def _seed_inventory_init(client: TestClient, date_str: str) -> None:
  _post(
    client,
    "/inventory/init",
    {
      "date": date_str,
      "full12": 250,
      "empty12": 250,
      "full48": 140,
      "empty48": 120,
      "reason": "seed_init",
    },
  )


def _seed_cash_init(client: TestClient, date_str: str) -> None:
  _post(
    client,
    "/cash/init",
    {
      "date": date_str,
      "cash_start": 20000,
      "reason": "seed_init",
    },
  )


def _seed_refill(client: TestClient, date_str: str, time_str: str, day_idx: int) -> None:
  buy12 = 10 + (day_idx % 3)
  buy48 = 5 + (day_idx % 2)
  payload = {
    "date": date_str,
    "time": time_str,
    "buy12": buy12,
    "return12": buy12,
    "buy48": buy48,
    "return48": buy48,
  }
  _post(client, "/inventory/refill", payload)


def _seed_expenses(client: TestClient, date_str: str, day_idx: int) -> None:
  expense_types = ["fuel", "food"]
  for offset, expense_type in enumerate(expense_types):
    amount = 20 + day_idx * 3 + offset * 5
    _post(
      client,
      "/expenses",
      {
        "date": date_str,
        "expense_type": expense_type,
        "amount": float(amount),
        "note": "seeded",
      },
    )


def _iter_orders_for_day(
  date: datetime,
  systems: list[dict],
  count: int,
  day_idx: int,
) -> Iterable[dict]:
  for idx in range(count):
    customer = systems[idx % len(systems)]["customer"]
    system = systems[idx % len(systems)]["system"]
    gas_type = system["gas_type"]
    installed = 1 + (idx % 3)
    received = 1 if idx % 2 == 0 else 0
    unit_price = 90 if gas_type == "12kg" else 300
    price_total = float(installed * unit_price)
    paid_amount = price_total if idx % 4 != 0 else price_total * 0.5
    delivered_at = date.replace(hour=9, minute=10 + idx * 4)
    yield {
      "customer_id": customer["id"],
      "system_id": system["id"],
      "delivered_at": delivered_at.isoformat(),
      "gas_type": gas_type,
      "cylinders_installed": installed,
      "cylinders_received": received,
      "price_total": price_total,
      "paid_amount": paid_amount,
      "note": "seeded",
      "client_request_id": f"seed_{date.date().isoformat()}_{idx}",
    }


def seed_last_10_days() -> None:
  init_db()
  app = create_app()
  client = TestClient(app)

  days = _date_list(10)
  start_date_str = days[0].date().isoformat()
  effective_from = (days[0] - timedelta(days=1)).date().isoformat()

  _seed_prices(client, effective_from)
  systems = _seed_customers_systems(client, 4)
  _seed_inventory_init(client, start_date_str)
  _seed_cash_init(client, start_date_str)

  for day_idx, day in enumerate(days):
    date_str = day.date().isoformat()
    _seed_refill(client, date_str, "09:00", day_idx)
    _seed_expenses(client, date_str, day_idx)
    for payload in _iter_orders_for_day(day, systems, 10, day_idx):
      _post(client, "/orders", payload)


def main() -> None:
  seed_last_10_days()


if __name__ == "__main__":
  main()
