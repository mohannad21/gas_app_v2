from datetime import datetime
from typing import Optional

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Date
from sqlmodel import Session, select

from app.db import get_session
from app.events import add_activity
from app.models import Customer, InventoryVersion, Order, PriceSetting, System
from app.schemas import OrderCreate, OrderUpdate, new_id


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/orders", tags=["orders"])


def latest_inventory(session: Session, gas_type: str) -> InventoryVersion | None:
  stmt = (
    select(InventoryVersion)
    .where(InventoryVersion.gas_type == gas_type)
    .order_by(InventoryVersion.effective_at.desc())
  )
  return session.exec(stmt).first()


@router.get("")
def list_orders(date: Optional[str] = Query(default=None), session: Session = Depends(get_session)) -> list[Order]:
  stmt = (
    select(Order)
    .where(Order.is_deleted == False)  # noqa: E712
    .order_by(Order.created_at.desc())
  )
  if date:
    stmt = stmt.where(Order.delivered_at.cast(Date) == date)  # type: ignore[name-defined]
  return session.exec(stmt).all()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, session: Session = Depends(get_session)) -> Order:
  logger.info("create_order payload=%s", payload.dict())
  customer = session.get(Customer, payload.customer_id)
  system = session.get(System, payload.system_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
  if not system or system.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
  if not system.is_active:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="System is inactive, orders cannot be created against it",
    )

  delivered_at = payload.delivered_at or datetime.utcnow()
  effective_customer_type = system.system_customer_type or customer.customer_type

  def resolve_price_setting() -> PriceSetting | None:
    stmt = (
      select(PriceSetting)
      .where(PriceSetting.gas_type == payload.gas_type)
      .where(PriceSetting.effective_from <= delivered_at)
      .order_by(PriceSetting.effective_from.desc())
    )
    settings = session.exec(stmt).all()
    specific = next((s for s in settings if s.customer_type == effective_customer_type), None)
    fallback = next((s for s in settings if s.customer_type == "any"), None)
    return specific or fallback

  price_setting = resolve_price_setting()

  order_id = new_id("o")
  order = Order(
    id=order_id,
    customer_id=payload.customer_id,
    system_id=payload.system_id,
    delivered_at=delivered_at,
    price_setting_id=price_setting.id if price_setting else None,
    unit_price_sell=price_setting.selling_price if price_setting else None,
    unit_price_buy=price_setting.buying_price if price_setting else None,
    gas_type=payload.gas_type,
    cylinders_installed=payload.cylinders_installed,
    cylinders_received=payload.cylinders_received,
    price_total=payload.price_total,
    paid_amount=payload.paid_amount,
    note=payload.note,
    created_at=datetime.utcnow(),
    is_deleted=False,
  )

  # Inventory adjustment for the order gas type
  prev_inv = latest_inventory(session, payload.gas_type)
  if not prev_inv:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="inventory_not_initialized")
  new_full = prev_inv.full_count - payload.cylinders_installed
  new_empty = prev_inv.empty_count + payload.cylinders_received
  inv_version = InventoryVersion(
    gas_type=payload.gas_type,
    full_count=new_full,
    empty_count=new_empty,
    reason="order",
    event_type="order",
    event_id=order_id,
    effective_at=delivered_at,
    created_at=datetime.utcnow(),
  )

  session.add(order)
  session.add(inv_version)
  balance_delta = payload.price_total - payload.paid_amount
  customer.money_balance += balance_delta
  customer.number_of_orders += payload.cylinders_installed
  cylinder_delta = payload.cylinders_installed - payload.cylinders_received
  if payload.gas_type == "12kg":
    customer.cylinder_balance_12kg += cylinder_delta
  elif payload.gas_type == "48kg":
    customer.cylinder_balance_48kg += cylinder_delta
  customer.updated_at = datetime.utcnow()
  session.add(customer)
  add_activity(
    session,
    "order",
    "created",
    f"Order for {customer.name} on {system.name} (gas {order.gas_type}, installed {order.cylinders_installed}, received {order.cylinders_received}, total ${order.price_total})",
    order.id,
    metadata=f"gas={order.gas_type};installed={order.cylinders_installed};received={order.cylinders_received};total={order.price_total}",
  )
  session.commit()
  session.refresh(order)
  logger.info("create_order created id=%s customer=%s system=%s", order.id, order.customer_id, order.system_id)
  return order


@router.put("/{order_id}")
def update_order(order_id: str, payload: OrderUpdate, session: Session = Depends(get_session)) -> Order:
  order = session.get(Order, order_id)
  if not order or order.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

  logger.info("update_order id=%s payload=%s", order_id, payload.dict(exclude_unset=True))

  prev_customer_id = order.customer_id
  prev_price_total = order.price_total
  prev_paid_amount = order.paid_amount
  prev_cyl_installed = order.cylinders_installed
  prev_cyl_received = order.cylinders_received
  prev_gas_type = order.gas_type

  payload_data = payload.dict(exclude_unset=True)
  changes: list[str] = []
  if payload_data.get("customer_id"):
    customer = session.get(Customer, payload.customer_id)
    if not customer or customer.is_deleted:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
    if order.customer_id != payload.customer_id:
      changes.append(
        f"customer_id: '{order.customer_id}' -> '{payload.customer_id}'"
      )
      order.customer_id = payload.customer_id
  if payload.system_id:
    system = session.get(System, payload.system_id)
    if not system or system.is_deleted:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
    if order.system_id != payload.system_id:
      changes.append(f"system_id: '{order.system_id}' -> '{payload.system_id}'")
      order.system_id = payload.system_id

  for field, value in payload_data.items():
    if field in {"customer_id", "system_id"}:
      continue
    old = getattr(order, field)
    if old == value:
      continue
    changes.append(f"{field}: '{old}' -> '{value}'")
    setattr(order, field, value)
  order.updated_at = datetime.utcnow()
  updated_customer = session.get(Customer, order.customer_id)
  customer_label = updated_customer.name if updated_customer else order.customer_id
  description = (
    f"Order for '{customer_label}' updated: {', '.join(changes)}"
    if changes
    else f"Order for '{customer_label}' updated"
  )
  add_activity(
    session,
    "order",
    "updated",
    description,
    order.id,
    metadata=";".join(changes) if changes else None,
  )

  def apply_cylinder_delta(customer: Customer, gas_type: str, delta: int) -> None:
    if gas_type == "12kg":
      customer.cylinder_balance_12kg += delta
    elif gas_type == "48kg":
      customer.cylinder_balance_48kg += delta

  # Adjust customer balances to reflect updated totals/payments and cylinders
  if order.customer_id != prev_customer_id:
    # Undo old impact
    old_customer = session.get(Customer, prev_customer_id)
    if old_customer and not old_customer.is_deleted:
      old_customer.money_balance -= prev_price_total - prev_paid_amount
      old_customer.number_of_orders -= prev_cyl_installed
      apply_cylinder_delta(old_customer, prev_gas_type, -(prev_cyl_installed - prev_cyl_received))
      old_customer.updated_at = datetime.utcnow()
      session.add(old_customer)

    # Apply new impact
    new_customer = session.get(Customer, order.customer_id)
    if new_customer and not new_customer.is_deleted:
      new_customer.money_balance += order.price_total - order.paid_amount
      new_customer.number_of_orders += order.cylinders_installed
      apply_cylinder_delta(new_customer, order.gas_type, order.cylinders_installed - order.cylinders_received)
      new_customer.updated_at = datetime.utcnow()
      session.add(new_customer)
  else:
    customer = session.get(Customer, order.customer_id)
    if customer and not customer.is_deleted:
      balance_diff = (order.price_total - order.paid_amount) - (prev_price_total - prev_paid_amount)
      customer.money_balance += balance_diff

      order_count_diff = order.cylinders_installed - prev_cyl_installed
      customer.number_of_orders += order_count_diff

      # Handle cylinder deltas, including gas type change
      if order.gas_type == prev_gas_type:
        cyl_diff = (order.cylinders_installed - order.cylinders_received) - (
          prev_cyl_installed - prev_cyl_received
        )
        apply_cylinder_delta(customer, order.gas_type, cyl_diff)
      else:
        apply_cylinder_delta(customer, prev_gas_type, -(prev_cyl_installed - prev_cyl_received))
        apply_cylinder_delta(customer, order.gas_type, order.cylinders_installed - order.cylinders_received)

      customer.updated_at = datetime.utcnow()
      session.add(customer)

  session.add(order)
  session.commit()
  session.refresh(order)
  return order


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: str, session: Session = Depends(get_session)) -> None:
  logger.info("delete_order id=%s", order_id)
  order = session.get(Order, order_id)
  if not order or order.is_deleted:
    return
  customer = session.get(Customer, order.customer_id)
  order.is_deleted = True
  order.deleted_at = datetime.utcnow()
  session.add(order)
  if customer and not customer.is_deleted:
    balance_delta = order.price_total - order.paid_amount
    customer.money_balance -= balance_delta
    customer.number_of_orders -= order.cylinders_installed
    cylinder_delta = order.cylinders_installed - order.cylinders_received
    if order.gas_type == "12kg":
      customer.cylinder_balance_12kg -= cylinder_delta
    elif order.gas_type == "48kg":
      customer.cylinder_balance_48kg -= cylinder_delta
    customer.updated_at = datetime.utcnow()
    session.add(customer)
  add_activity(
    session,
    "order",
    "deleted",
    f"Order for {customer.name if customer else 'unknown customer'} ({order.cylinders_installed}x {order.gas_type}) removed",
    order.id,
    metadata=f"gas={order.gas_type};installed={order.cylinders_installed};received={order.cylinders_received}",
  )
  session.commit()
