from datetime import datetime, timezone
from typing import Optional

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from urllib.parse import quote
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

def _compute_bilateral_impact(*, customer_balance: float, total_price: float, money_received: float, money_given: float) -> dict:
  gross_paid = money_received - money_given
  available_credit = max(-customer_balance, 0)
  applied_credit = min(available_credit, max(total_price - gross_paid, 0))
  unpaid = total_price - gross_paid - applied_credit
  new_balance = customer_balance + (total_price - gross_paid)
  return {
    "gross_paid": gross_paid,
    "available_credit": available_credit,
    "applied_credit": applied_credit,
    "unpaid": unpaid,
    "new_balance": new_balance,
  }

@router.get("/validate_order_impact")
def validate_order_impact(
  customer_id: str = Query(...),
  system_id: str = Query(...),
  gas_type: str = Query(...),
  cylinders_installed: int = Query(...),
  cylinders_received: int = Query(...),
  price_total: float = Query(...),
  money_received: float = Query(0),
  money_given: float = Query(0),
  delivered_at: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
) -> dict:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
  system = session.get(System, system_id)
  if not system or system.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
  if not system.is_active:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System is inactive")

  impact = _compute_bilateral_impact(
    customer_balance=customer.money_balance,
    total_price=price_total,
    money_received=money_received,
    money_given=money_given,
  )
  cyl_delta = cylinders_installed - cylinders_received
  cyl_before = {
    "12kg": customer.cylinder_balance_12kg,
    "48kg": customer.cylinder_balance_48kg,
  }
  cyl_after = {
    "12kg": customer.cylinder_balance_12kg + (cyl_delta if gas_type == "12kg" else 0),
    "48kg": customer.cylinder_balance_48kg + (cyl_delta if gas_type == "48kg" else 0),
  }
  return {
    "gross_paid": impact["gross_paid"],
    "applied_credit": impact["applied_credit"],
    "unpaid": impact["unpaid"],
    "new_balance": impact["new_balance"],
    "cyl_balance_before": cyl_before,
    "cyl_balance_after": cyl_after,
  }

@router.get("/whatsapp_link/{order_id}")
def whatsapp_link(order_id: str, session: Session = Depends(get_session)) -> dict:
  order = session.get(Order, order_id)
  if not order or order.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
  customer = session.get(Customer, order.customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
  if not customer.phone:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer phone missing")

  def format_money(value: float | None) -> str:
    if value is None:
      return "0"
    return f"{value:.0f}"

  def format_status(balance: float | None) -> tuple[str, str]:
    amount = balance or 0
    if amount < 0:
      value = format_money(abs(amount))
      return (f"رصيد: {value}₪", f"זיכוי: {value}₪")
    if amount > 0:
      value = format_money(amount)
      return (f"دين: {value}₪", f"חוב: {value}₪")
    return ("مسدد بالكامل", "סולק במלואו")

  money_status_ar, money_status_he = format_status(order.money_balance_after)

  cyl_balance = None
  if order.cyl_balance_after and order.gas_type in order.cyl_balance_after:
    cyl_balance = order.cyl_balance_after[order.gas_type]
  elif order.gas_type == "12kg":
    cyl_balance = customer.cylinder_balance_12kg
  elif order.gas_type == "48kg":
    cyl_balance = customer.cylinder_balance_48kg
  cyl_status_ar, cyl_status_he = format_status(cyl_balance)

  message = (
    "Gas Delivery / אישור אספקת גז 🚚\n"
    "----------------------------------\n"
    f"Customer / לקוח: {customer.name}\n"
    f"Order / طلب: #{order.id}\n"
    "Exchanged / تفاصيل التبادل / פרטי ההחלפה: "
    f"⬅️ OUT: {order.cylinders_installed}x {order.gas_type} "
    f"➡️ IN: {format_money(order.money_received)}₪ | {order.cylinders_received}x Empty\n\n"
    f"Credit Used / رصيد مستخدم / זיכוי שמומש: {format_money(order.applied_credit)}₪\n"
    "Account Status / حالة الحساب / מצב החשבון: 💰 Money / نقדי / כסף:\n\n"
    f"{money_status_ar}\n\n"
    f"{money_status_he}\n\n"
    "🛢 Cylinders / جرة / בלונים:\n\n"
    f"{cyl_status_ar}\n\n"
    f"{cyl_status_he}\n\n"
    "Thank you! / شكراً لك! / תודה רבה!"
  )
  url = f"https://wa.me/{customer.phone}?text={quote(message)}"
  return {"url": url}


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
  money_received = payload.money_received if payload.money_received is not None else (payload.paid_amount or 0)
  money_given = payload.money_given if payload.money_given is not None else 0
  impact = _compute_bilateral_impact(
    customer_balance=customer.money_balance,
    total_price=payload.price_total,
    money_received=money_received,
    money_given=money_given,
  )
  cyl_before = {
    "12kg": customer.cylinder_balance_12kg,
    "48kg": customer.cylinder_balance_48kg,
  }
  cyl_delta = payload.cylinders_installed - payload.cylinders_received
  cyl_after = {
    "12kg": customer.cylinder_balance_12kg + (cyl_delta if payload.gas_type == "12kg" else 0),
    "48kg": customer.cylinder_balance_48kg + (cyl_delta if payload.gas_type == "48kg" else 0),
  }
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
    paid_amount=impact["gross_paid"],
    money_received=money_received,
    money_given=money_given,
    applied_credit=impact["applied_credit"],
    money_balance_before=customer.money_balance,
    money_balance_after=impact["new_balance"],
    cyl_balance_before=cyl_before,
    cyl_balance_after=cyl_after,
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
  if impact["gross_paid"]:
    add_cash_delta(
      session,
      effective_at=delivered_at,
      source_type="order",
      source_id=order_id,
      delta_cash=impact["gross_paid"],
      reason="order",
    )
  start_date = business_date_from_utc(delivered_at)
  end_date = business_date_from_utc(datetime.now(timezone.utc))
  recompute_daily_summaries(session, payload.gas_type, start_date, end_date, allow_negative=False)
  if payload.paid_amount:
    recompute_cash_summaries(session, start_date, end_date)
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

  if order.money_received is None and order.money_given is None:
    order.money_received = order.paid_amount or 0
    order.money_given = 0
  if order.money_received is None:
    order.money_received = order.paid_amount or 0
  if order.money_given is None:
    order.money_given = 0
  order.paid_amount = (order.money_received or 0) - (order.money_given or 0)
  if updated_customer:
    prev_net_paid = prev_paid_amount or 0
    base_money_balance = updated_customer.money_balance - (prev_price_total - prev_net_paid)
    base_cyl_12 = updated_customer.cylinder_balance_12kg
    base_cyl_48 = updated_customer.cylinder_balance_48kg
    prev_cyl_delta = prev_cyl_installed - prev_cyl_received
    if prev_gas_type == "12kg":
      base_cyl_12 -= prev_cyl_delta
    elif prev_gas_type == "48kg":
      base_cyl_48 -= prev_cyl_delta
    impact = _compute_bilateral_impact(
      customer_balance=base_money_balance,
      total_price=order.price_total,
      money_received=order.money_received or 0,
      money_given=order.money_given or 0,
    )
    cyl_before = {
      "12kg": base_cyl_12,
      "48kg": base_cyl_48,
    }
    cyl_delta = order.cylinders_installed - order.cylinders_received
    cyl_after = {
      "12kg": base_cyl_12 + (cyl_delta if order.gas_type == "12kg" else 0),
      "48kg": base_cyl_48 + (cyl_delta if order.gas_type == "48kg" else 0),
    }
    order.applied_credit = impact["applied_credit"]
    order.money_balance_before = base_money_balance
    order.money_balance_after = impact["new_balance"]
    order.cyl_balance_before = cyl_before
    order.cyl_balance_after = cyl_after
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
