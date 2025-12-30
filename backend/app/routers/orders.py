from datetime import datetime, timezone
from typing import Optional

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Date
from sqlmodel import Session, select

from app.db import get_session
from app.events import add_activity
from app.models import Customer, Order, PriceSetting, System
from app.services.cash import add_cash_delta, delete_cash_deltas_for_source, recompute_cash_summaries
from app.services.customers import sync_customer_totals
from app.services.inventory import (
  add_inventory_delta,
  delete_inventory_deltas_for_source,
  enqueue_recalc_job,
  inventory_totals_at,
  recompute_daily_summaries,
)
from app.utils.time import business_date_from_utc
from app.schemas import OrderCreate, OrderUpdate, new_id


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/orders", tags=["orders"])


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
  logger.info("create_order payload=%s", payload.model_dump())
  if payload.client_request_id:
    existing = session.exec(
      select(Order).where(Order.client_request_id == payload.client_request_id)
    ).first()
    if existing:
      return existing
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

  delivered_at = payload.delivered_at or datetime.now(timezone.utc)
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
    client_request_id=payload.client_request_id,
    created_at=datetime.now(timezone.utc),
    is_deleted=False,
  )

  # Inventory adjustment for the order gas type
  prev_full, prev_empty = inventory_totals_at(session, payload.gas_type, delivered_at)
  add_inventory_delta(
    session,
    gas_type=payload.gas_type,
    delta_full=-payload.cylinders_installed,
    delta_empty=payload.cylinders_received,
    effective_at=delivered_at,
    source_type="order",
    source_id=order_id,
    reason="order",
  )
  if payload.paid_amount:
    add_cash_delta(
      session,
      effective_at=delivered_at,
      source_type="order",
      source_id=order_id,
      delta_cash=payload.paid_amount,
      reason="order",
    )
  new_full = prev_full - payload.cylinders_installed
  new_empty = prev_empty + payload.cylinders_received

  session.add(order)
  sync_customer_totals(session, customer.id)
  add_activity(
    session,
    "order",
    "created",
    f"Order for {customer.name} on {system.name} (gas {order.gas_type}, installed {order.cylinders_installed}, received {order.cylinders_received}, total ${order.price_total})",
    order.id,
    metadata=f"gas={order.gas_type};installed={order.cylinders_installed};received={order.cylinders_received};total={order.price_total}",
  )
  add_activity(
    session,
    "inventory",
    "updated",
    (
      f"Inventory {order.gas_type} full {prev_full}->{new_full}, "
      f"empty {prev_empty}->{new_empty} (order {order.id}, "
      f"installed {order.cylinders_installed}, received {order.cylinders_received})"
    ),
    order.id,
    metadata=(
      f"gas={order.gas_type};prev_full={prev_full};prev_empty={prev_empty};"
      f"new_full={new_full};new_empty={new_empty};installed={order.cylinders_installed};"
      f"received={order.cylinders_received}"
    ),
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

  logger.info("update_order id=%s payload=%s", order_id, payload.model_dump(exclude_unset=True))

  prev_customer_id = order.customer_id
  prev_price_total = order.price_total
  prev_paid_amount = order.paid_amount
  prev_cyl_installed = order.cylinders_installed
  prev_cyl_received = order.cylinders_received
  prev_gas_type = order.gas_type
  prev_delivered_at = order.delivered_at

  payload_data = payload.model_dump(exclude_unset=True)
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
  order.updated_at = datetime.now(timezone.utc)
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

  # Option B: rewrite inventory/cash history for the order, then recompute from the earliest change.
  deleted_inventory_dates = delete_inventory_deltas_for_source(session, source_id=order.id)
  deleted_cash_date = delete_cash_deltas_for_source(session, source_id=order.id)
  add_inventory_delta(
    session,
    gas_type=order.gas_type,
    delta_full=-order.cylinders_installed,
    delta_empty=order.cylinders_received,
    effective_at=order.delivered_at,
    source_type="order",
    source_id=order.id,
    reason="order",
  )
  if order.paid_amount:
    add_cash_delta(
      session,
      effective_at=order.delivered_at,
      source_type="order",
      source_id=order.id,
      delta_cash=order.paid_amount,
      reason="order",
    )
  end_date = business_date_from_utc(datetime.now(timezone.utc))
  gas_types = set(deleted_inventory_dates.keys()) | {order.gas_type}
  for gas in gas_types:
    start_date = deleted_inventory_dates.get(gas)
    if gas == order.gas_type:
      new_date = business_date_from_utc(order.delivered_at)
      start_date = min(start_date, new_date) if start_date else new_date
    if start_date:
      enqueue_recalc_job(session, gas, start_date)
      recompute_daily_summaries(session, gas, start_date, end_date, allow_negative=False)
  if deleted_cash_date:
    start_cash = deleted_cash_date
    new_cash_date = business_date_from_utc(order.delivered_at) if order.paid_amount else None
    if new_cash_date:
      start_cash = min(start_cash, new_cash_date)
    recompute_cash_summaries(session, start_cash, end_date)

  session.add(order)
  if order.customer_id != prev_customer_id:
    sync_customer_totals(session, prev_customer_id)
  sync_customer_totals(session, order.customer_id)
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
  order.deleted_at = datetime.now(timezone.utc)
  session.add(order)
  if customer and not customer.is_deleted:
    sync_customer_totals(session, customer.id)
  deleted_inventory_dates = delete_inventory_deltas_for_source(session, source_id=order.id)
  deleted_cash_date = delete_cash_deltas_for_source(session, source_id=order.id)
  end_date = business_date_from_utc(datetime.now(timezone.utc))
  for gas, start_date in deleted_inventory_dates.items():
    enqueue_recalc_job(session, gas, start_date)
    recompute_daily_summaries(session, gas, start_date, end_date, allow_negative=False)
  if deleted_cash_date:
    recompute_cash_summaries(session, deleted_cash_date, end_date)
  add_activity(
    session,
    "order",
    "deleted",
    f"Order for {customer.name if customer else 'unknown customer'} ({order.cylinders_installed}x {order.gas_type}) removed",
    order.id,
    metadata=f"gas={order.gas_type};installed={order.cylinders_installed};received={order.cylinders_received}",
  )
  session.commit()
