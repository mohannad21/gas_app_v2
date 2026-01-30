from __future__ import annotations

import random
import sys
import os
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient

from pathlib import Path

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("DEBUG", "false")
if hasattr(sys.stdout, "reconfigure"):
  sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)


@dataclass
class CustomerSeed:
  name: str
  notes: str
  customer_type: str = "private"


@dataclass
class OrderUpdateSeed:
  order_id: str
  cylinders_installed: int
  cylinders_received: int
  price_total: float
  gas_type: str
  paid_amount: float | None = None


def iso_date(dt: datetime) -> str:
  return dt.date().isoformat()


def make_time(day: datetime, hour_min: tuple[int, int]) -> str:
  return datetime(
    day.year, day.month, day.day, hour_min[0], hour_min[1], tzinfo=timezone.utc
  ).isoformat()


def pick_time(day: datetime, rng: random.Random) -> str:
  hour = rng.randint(9, 19)
  minute = rng.choice([0, 10, 20, 30, 40, 50])
  return make_time(day, (hour, minute))


def api_post(client: TestClient, path: str, payload: dict[str, Any]) -> dict[str, Any]:
  response = client.post(path, json=payload)
  if response.status_code >= 400:
    raise RuntimeError(f"POST {path} failed {response.status_code}: {response.text}")
  return response.json()


def api_put(client: TestClient, path: str, payload: dict[str, Any]) -> dict[str, Any]:
  response = client.put(path, json=payload)
  if response.status_code >= 400:
    raise RuntimeError(f"PUT {path} failed {response.status_code}: {response.text}")
  return response.json()


def main() -> None:
  rng = random.Random(42)
  client = TestClient(app)

  today = datetime.now(timezone.utc).date()
  start_date = today - timedelta(days=39)
  start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)

  sell_price = {"12kg": 120.0, "48kg": 350.0}
  buy_price = {"12kg": 75.0, "48kg": 300.0}

  existing_customers = client.get("/customers").json()
  if existing_customers:
    raise RuntimeError("Customers already exist. Remove gas_app.db to reseed cleanly.")

  existing_prices = client.get("/prices").json()
  existing_key = {(p["gas_type"], p["customer_type"]) for p in existing_prices}
  for gas_type in ("12kg", "48kg"):
    key = (gas_type, "private")
    if key in existing_key:
      continue
    api_post(
      client,
      "/prices",
      {
        "gas_type": gas_type,
        "customer_type": "private",
        "selling_price": sell_price[gas_type],
        "buying_price": buy_price[gas_type],
        "effective_from": start_dt.isoformat(),
      },
    )

  customers: list[CustomerSeed] = [
    CustomerSeed("أحمد صالح", "بقالة الحي - زبون دائم"),
    CustomerSeed("خالد علي", "مطعم شعبي - طلبات متكررة"),
    CustomerSeed("محمود حسن", "مخبز صغير - حساس لمواعيد التسليم"),
    CustomerSeed("سارة يوسف", "شقة سكنية - طلبات قليلة"),
    CustomerSeed("ليلى عبد الله", "مقهى - يحتاج توصيل صباحي"),
    CustomerSeed("يوسف حمد", "ورشة - يفضل الدفع نهاية الأسبوع"),
    CustomerSeed("نور محمد", "منزل عائلي - تبديل اسطوانات سريع"),
    CustomerSeed("علي عمر", "مطعم جديد - متابعة الدفع مطلوبة"),
    CustomerSeed("إياد سمير", "كافتيريا - طلبات 48kg أحياناً"),
    CustomerSeed("هبة سعيد", "منزل خاص - تواصل واتساب"),
    CustomerSeed("رامي فؤاد", "محل شاورما - ضغط وقت الغداء"),
    CustomerSeed("مها طارق", "مخبز - احتياج دائم للـ12kg"),
  ]

  customer_ids: list[str] = []
  system_by_customer: dict[str, dict[str, str]] = {}
  for entry in customers:
    created = api_post(
      client,
      "/customers",
      {
        "name": entry.name,
        "notes": entry.notes,
        "customer_type": entry.customer_type,
      },
    )
    customer_id = created["id"]
    customer_ids.append(customer_id)
    system_by_customer[customer_id] = {}
    for gas_type in ("12kg", "48kg"):
      system = api_post(
        client,
        "/systems",
        {
          "customer_id": customer_id,
          "name": f"{entry.name} - {gas_type}",
          "system_type": "other",
          "gas_type": gas_type,
          "system_customer_type": "private",
          "is_active": True,
        },
      )
      system_by_customer[customer_id][gas_type] = system["id"]

  # Initial inventory and cash
  api_post(
    client,
    "/inventory/init",
    {
      "date": start_date.isoformat(),
      "full12": 30,
      "empty12": 20,
      "full48": 15,
      "empty48": 10,
      "reason": "initial_seed",
    },
  )
  api_post(
    client,
    "/cash/init",
    {"date": start_date.isoformat(), "cash_start": 5000, "reason": "initial_seed"},
  )

  refill_targets = {"12kg": 30, "48kg": 15}
  refill_threshold = {"12kg": 6, "48kg": 4}

  pending_updates: list[OrderUpdateSeed] = []
  pending_paid: list[OrderUpdateSeed] = []

  for day_offset in range(40):
    day = start_dt + timedelta(days=day_offset)

    # Apply pending returns (next-day empties) and payments.
    for update in list(pending_updates):
      api_put(
        client,
        f"/orders/{update.order_id}",
        {"cylinders_received": update.cylinders_installed},
      )
      pending_updates.remove(update)

    for update in list(pending_paid):
      api_put(
        client,
        f"/orders/{update.order_id}",
        {"paid_amount": update.price_total},
      )
      pending_paid.remove(update)

    # Expenses: 1-2 per day
    for _ in range(rng.randint(1, 2)):
      expense_type = rng.choice(["fuel", "food"])
      amount = 100 if expense_type == "fuel" else rng.randint(20, 50)
      if expense_type == "fuel":
        amount = rng.choice([100, 200])
      api_post(
        client,
        "/expenses",
        {"date": iso_date(day), "expense_type": expense_type, "amount": amount},
      )

    # Determine which orders will have missing returns or unpaid payments today.
    missing_returns = 2 if day_offset % 3 == 0 else 0
    unpaid_today = 1

    def snapshot_at(at_iso: str) -> dict[str, Any]:
      response = client.get("/inventory/snapshot", params={"at": at_iso})
      if response.status_code >= 400:
        raise RuntimeError(f"GET /inventory/snapshot failed {response.status_code}: {response.text}")
      return response.json()

    def maybe_refill(at_iso: str, use_date: datetime) -> None:
      snap = snapshot_at(at_iso)
      full12 = snap.get("full12", 0)
      full48 = snap.get("full48", 0)
      empty12 = snap.get("empty12", 0)
      empty48 = snap.get("empty48", 0)
      if full12 > refill_threshold["12kg"] and full48 > refill_threshold["48kg"]:
        return
      buy12 = max(0, refill_targets["12kg"] - full12)
      buy48 = max(0, refill_targets["48kg"] - full48)
      if buy12 == 0 and buy48 == 0:
        return
      payload = {
        "date": iso_date(use_date),
        "time": datetime.fromisoformat(at_iso).strftime("%H:%M"),
        "buy12": buy12,
        "return12": min(empty12, buy12),
        "buy48": buy48,
        "return48": min(empty48, buy48),
        "paid_now": buy12 * buy_price["12kg"] + buy48 * buy_price["48kg"],
      }
      try:
        api_post(client, "/inventory/refill", payload)
      except RuntimeError:
        # Skip refill if inventory state cannot accept it; orders will downscale.
        return

    orders: list[dict[str, Any]] = []
    for _ in range(10):
      orders.append(
        {
          "gas_type": "12kg",
          "installed": rng.choice([1, 1, 1, 2, 2, 2, 3]),
          "delivered_at": pick_time(day, rng),
        }
      )
    for _ in range(3):
      orders.append(
        {
          "gas_type": "48kg",
          "installed": rng.choice([1, 1, 2]),
          "delivered_at": pick_time(day, rng),
        }
      )
    orders.sort(key=lambda entry: entry["delivered_at"])
    for entry in orders:
      gas_type = entry["gas_type"]
      installed = entry["installed"]
      delivered_at = entry["delivered_at"]
      snap = snapshot_at(delivered_at)
      full_key = "full12" if gas_type == "12kg" else "full48"
      if snap.get(full_key, 0) < installed:
        earlier = (datetime.fromisoformat(delivered_at) - timedelta(minutes=30)).isoformat()
        maybe_refill(earlier, day)
        snap = snapshot_at(delivered_at)
      installed = min(installed, snap.get(full_key, 0))
      if installed == 0:
        continue
      received = installed
      if gas_type == "12kg" and missing_returns > 0:
        received = max(0, installed - 1)
        missing_returns -= 1
      total = installed * sell_price[gas_type]
      paid = total
      if unpaid_today > 0:
        paid = 0
        unpaid_today -= 1
      customer_id = rng.choice(customer_ids)
      order = api_post(
        client,
        "/orders",
        {
          "customer_id": customer_id,
          "system_id": system_by_customer[customer_id][gas_type],
          "delivered_at": delivered_at,
          "gas_type": gas_type,
          "cylinders_installed": installed,
          "cylinders_received": received,
          "price_total": total,
          "paid_amount": paid,
        },
      )
      if received < installed:
        pending_updates.append(
          OrderUpdateSeed(
            order_id=order["id"],
            cylinders_installed=installed,
            cylinders_received=received,
            price_total=total,
            gas_type=gas_type,
          )
        )
      if paid == 0:
        pending_paid.append(
          OrderUpdateSeed(
            order_id=order["id"],
            cylinders_installed=installed,
            cylinders_received=received,
            price_total=total,
            gas_type=gas_type,
          )
        )
    # End-of-day refill if running low
    maybe_refill(make_time(day, (17, 30)), day)

  print("Seed complete.")
  print("Customers created:")
  for entry in customers:
    print(f"- {entry.name}: {entry.notes}")


if __name__ == "__main__":
  main()
