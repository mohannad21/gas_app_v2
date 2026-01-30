from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlmodel import Session, select

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.db import engine
from app.models import Customer, InventoryDelta, Order, System
from app.schemas import new_id
from app.services.inventory import add_inventory_delta


def _get_or_create_demo_customer(session: Session) -> Customer:
  customer = session.exec(select(Customer).where(Customer.name == "Demo Customer")).first()
  if customer:
    return customer
  customer = Customer(
    id=new_id("c"),
    name="Demo Customer",
    customer_type="private",
    phone=None,
    notes="seeded",
    created_at=datetime.now(timezone.utc),
    is_deleted=False,
  )
  session.add(customer)
  return customer


def _get_or_create_demo_system(session: Session, customer_id: str) -> System:
  system = session.exec(select(System).where(System.name == "Demo System")).first()
  if system:
    return system
  system = System(
    id=new_id("s"),
    customer_id=customer_id,
    name="Demo System",
    location=None,
    system_type="main_kitchen",
    gas_type="12kg",
    system_customer_type="private",
    is_active=True,
    require_security_check=False,
    security_check_exists=False,
    security_check_date=None,
    created_at=datetime.now(timezone.utc),
    is_deleted=False,
  )
  session.add(system)
  return system


def _ensure_init(session: Session, day: datetime) -> None:
  has_init = session.exec(
    select(InventoryDelta.id)
    .where(InventoryDelta.source_type == "init")
    .limit(1)
  ).first()
  if has_init:
    return
  add_inventory_delta(
    session,
    gas_type="12kg",
    delta_full=50,
    delta_empty=10,
    effective_at=day,
    source_type="init",
    reason="seed_init",
  )
  add_inventory_delta(
    session,
    gas_type="48kg",
    delta_full=20,
    delta_empty=5,
    effective_at=day,
    source_type="init",
    reason="seed_init",
  )


def seed_demo_data(days: int = 10) -> None:
  now = datetime.now(timezone.utc)
  start_day = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
  day_list = [start_day + timedelta(days=offset) for offset in range(days)]

  with Session(engine) as session:
    customer = _get_or_create_demo_customer(session)
    system = _get_or_create_demo_system(session, customer.id)
    session.commit()

    _ensure_init(session, day_list[0])

    for idx, day in enumerate(day_list):
      delivered_at = day.replace(hour=10)
      gas_type = "12kg" if idx % 2 == 0 else "48kg"
      installed = 1 + (idx % 3)
      received = 1 if idx % 2 == 0 else 0
      price_total = float(installed * (50 if gas_type == "12kg" else 180))

      order_id = new_id("o")
      order = Order(
        id=order_id,
        customer_id=customer.id,
        system_id=system.id,
        delivered_at=delivered_at,
        gas_type=gas_type,
        cylinders_installed=installed,
        cylinders_received=received,
        price_total=price_total,
        paid_amount=price_total,
        note="seeded",
        created_at=day.replace(hour=12),
        is_deleted=False,
      )
      session.add(order)
      add_inventory_delta(
        session,
        gas_type=gas_type,
        delta_full=-installed,
        delta_empty=received,
        effective_at=delivered_at,
        source_type="order",
        source_id=order_id,
        reason="seed_order",
      )

      if idx % 3 == 0:
        refill_id = f"refill_demo_{day.date().isoformat()}"
        add_inventory_delta(
          session,
          gas_type="12kg",
          delta_full=3,
          delta_empty=-1,
          effective_at=day.replace(hour=9),
          source_type="refill",
          source_id=refill_id,
          reason="seed_refill",
        )
        add_inventory_delta(
          session,
          gas_type="48kg",
          delta_full=2,
          delta_empty=0,
          effective_at=day.replace(hour=9),
          source_type="refill",
          source_id=refill_id,
          reason="seed_refill",
        )

      if idx % 5 == 0:
        adjust_id = f"adjust_demo_{day.date().isoformat()}"
        add_inventory_delta(
          session,
          gas_type="12kg",
          delta_full=-1,
          delta_empty=0,
          effective_at=day.replace(hour=12),
          source_type="adjust",
          source_id=adjust_id,
          reason="seed_adjust",
        )

    session.commit()


def main() -> None:
  seed_demo_data(days=10)


if __name__ == "__main__":
  main()
