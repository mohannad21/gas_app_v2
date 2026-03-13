from typing import Optional

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Customer, CustomerTransaction, System
from app.schemas import OrderCreate, OrderOut, OrderUpdate
from app.services.ledger import sum_customer_cylinders, sum_customer_money
from app.services.posting import derive_day, normalize_happened_at, post_customer_transaction, reverse_source

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/orders", tags=["orders"])


def _resolve_value(payload_data: dict, field: str, current):
  return payload_data[field] if field in payload_data else current


def _normalize_system_id(value: Optional[str]) -> Optional[str]:
  if value is None:
    return None
  return value or None


def _resolve_update_order_context(
  *,
  existing: CustomerTransaction,
  payload_data: dict,
) -> tuple[str, Optional[str], str, str]:
  order_mode = _resolve_value(payload_data, "order_mode", existing.mode or "replacement")
  customer_id = _resolve_value(payload_data, "customer_id", existing.customer_id)
  system_id = _normalize_system_id(_resolve_value(payload_data, "system_id", existing.system_id))
  gas_type = _resolve_value(payload_data, "gas_type", existing.gas_type or "12kg")

  # Non-replacement orders only use system as optional operational context.
  if (
    order_mode != "replacement"
    and "customer_id" in payload_data
    and "system_id" not in payload_data
    and customer_id != existing.customer_id
  ):
    system_id = None

  return customer_id, system_id, order_mode, gas_type


def _validate_order_context_on_update(
  session: Session,
  *,
  payload_data: dict,
  customer_id: str,
  system_id: Optional[str],
  order_mode: str,
  gas_type: str,
) -> tuple[Customer, Optional[System]]:
  customer = session.get(Customer, customer_id)
  if not customer:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  context_changed = any(field in payload_data for field in {"customer_id", "system_id", "order_mode", "gas_type"})

  if order_mode == "replacement":
    if not system_id:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System is required for replacement orders")
    system = session.get(System, system_id)
    if not system:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
    if not system.is_active:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="System is inactive, orders cannot be created against it",
      )
    if context_changed and system.customer_id != customer_id:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="System does not belong to the selected customer",
      )
    if context_changed and system.gas_type != gas_type:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="System gas type does not match order gas type",
      )
    return customer, system

  if system_id:
    system = session.get(System, system_id)
    if not system:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
    if not system.is_active:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="System is inactive, orders cannot be created against it",
      )
    if context_changed and system.customer_id != customer_id:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="System does not belong to the selected customer",
      )
    return customer, system

  return customer, None

def _money_delta_for_mode(order_mode: str, total: int, paid: int) -> int:
  if order_mode == "buy_iron":
    return paid - total
  return total - paid


def _order_out(txn: CustomerTransaction) -> OrderOut:
  return OrderOut(
    id=txn.id,
    customer_id=txn.customer_id,
    system_id=txn.system_id or "",
    delivered_at=txn.happened_at,
    created_at=txn.created_at,
    updated_at=None,
    order_mode=txn.mode or "replacement",
    gas_type=txn.gas_type or "12kg",
    cylinders_installed=txn.installed,
    cylinders_received=txn.received,
    price_total=txn.total,
    paid_amount=txn.paid,
    debt_cash=txn.debt_cash,
    debt_cylinders_12=txn.debt_cylinders_12,
    debt_cylinders_48=txn.debt_cylinders_48,
    note=txn.note,
    money_balance_before=None,
    money_balance_after=None,
    cyl_balance_before=None,
    cyl_balance_after=None,
  )


def _compute_impact(*, customer_money: int, customer_cyl_12: int, customer_cyl_48: int, payload: OrderCreate) -> dict:
  paid = payload.paid_amount or 0
  total = payload.price_total
  money_delta = _money_delta_for_mode(payload.order_mode, total, paid)
  new_balance = customer_money + money_delta
  cyl_delta = payload.cylinders_installed - payload.cylinders_received
  if payload.order_mode in {"sell_iron", "buy_iron"}:
    cyl_delta = 0
  cyl_before = {"12kg": customer_cyl_12, "48kg": customer_cyl_48}
  cyl_after = {
    "12kg": customer_cyl_12 + (cyl_delta if payload.gas_type == "12kg" else 0),
    "48kg": customer_cyl_48 + (cyl_delta if payload.gas_type == "48kg" else 0),
  }
  return {
    "gross_paid": paid,
    "applied_credit": 0,
    "unpaid": money_delta,
    "new_balance": new_balance,
    "cyl_balance_before": cyl_before,
    "cyl_balance_after": cyl_after,
  }


@router.get("/validate_order_impact")
def validate_order_impact(
  customer_id: str = Query(...),
  system_id: str = Query(...),
  order_mode: str = Query("replacement"),
  gas_type: str = Query(...),
  cylinders_installed: int = Query(...),
  cylinders_received: int = Query(...),
  price_total: int = Query(...),
  paid_amount: int = Query(0),
  happened_at: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
) -> dict:
  customer = session.get(Customer, customer_id)
  if not customer:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
  system = session.get(System, system_id)
  if not system:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
  if not system.is_active:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System is inactive")

  payload = OrderCreate(
    customer_id=customer_id,
    system_id=system_id,
    order_mode=order_mode,  # type: ignore[arg-type]
    gas_type=gas_type,  # type: ignore[arg-type]
    cylinders_installed=cylinders_installed,
    cylinders_received=cylinders_received,
    price_total=price_total,
    paid_amount=paid_amount,
  )
  customer_money = sum_customer_money(session, customer_id=customer.id)
  cyl12 = sum_customer_cylinders(session, customer_id=customer.id, gas_type="12kg")
  cyl48 = sum_customer_cylinders(session, customer_id=customer.id, gas_type="48kg")
  return _compute_impact(
    customer_money=customer_money,
    customer_cyl_12=cyl12,
    customer_cyl_48=cyl48,
    payload=payload,
  )


@router.get("/whatsapp_link/{order_id}")
def whatsapp_link(order_id: str, session: Session = Depends(get_session)) -> dict:
  order = session.get(CustomerTransaction, order_id)
  if not order or order.kind != "order" or order.is_reversed:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
  customer = session.get(Customer, order.customer_id)
  if not customer:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
  if not customer.phone:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer phone missing")
  phone = "".join(ch for ch in customer.phone if ch.isdigit())
  if phone.startswith("00"):
    phone = phone[2:]
  if not phone:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer phone missing")

  def format_money(value: int | None) -> str:
    if value is None:
      return "0"
    return f"{value}"

  AR_GREETING = "\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645"
  AR_INSTALLED = "\u062a\u0645 \u062a\u0631\u0643\u064a\u0628"
  AR_CYLINDER = "\u0627\u0633\u0637\u0648\u0627\u0646\u0629"
  AR_OF_TYPE = "\u0645\u0646 \u0646\u0648\u0639"
  AR_AT = "\u0641\u064a"
  AR_RETURNED = "\u0648\u0627\u0633\u062a\u0644\u0645\u0646\u0627"
  AR_EMPTY = "\u0627\u0644\u0627\u0633\u0637\u0648\u0627\u0646\u0627\u062a \u0627\u0644\u0641\u0627\u0631\u063a\u0629"
  AR_PAID = "\u062f\u0641\u0639\u062a"
  AR_OUT_OF = "\u0645\u0646"
  AR_BEST = "\u0645\u0639 \u062a\u062d\u064a\u0627\u062a\u0646\u0627"
  AR_COMPANY = "\u0628\u0627\u0632\u063a\u0627\u0632 \u0625\u0643\u0633\u0627\u0644"

  message = (
    f"{AR_GREETING}, "
    f"{AR_INSTALLED} {order.installed} {AR_CYLINDER} {AR_OF_TYPE} {order.gas_type} "
    f"{AR_AT} {order.happened_at}. "
    f"{AR_RETURNED} {order.received} {AR_EMPTY}. "
    f"{AR_PAID} {format_money(order.paid)} {AR_OUT_OF} {format_money(order.total)}.\n\n"
    f"{AR_BEST},\n"
    f"{AR_COMPANY}"
  )
  url = f"https://wa.me/{phone}?text={message}"
  logger.info("whatsapp_link url=%s phone=%s", url, phone)
  return {"url": url}


@router.get("", response_model=list[OrderOut])
def list_orders(session: Session = Depends(get_session)) -> list[OrderOut]:
  rows = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
    .order_by(CustomerTransaction.happened_at.desc())
  ).all()
  return [_order_out(row) for row in rows]


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, session: Session = Depends(get_session)) -> OrderOut:
  if payload.request_id:
    existing = session.exec(
      select(CustomerTransaction).where(CustomerTransaction.request_id == payload.request_id)
    ).first()
    if existing:
      return _order_out(existing)

  customer = session.get(Customer, payload.customer_id)
  system = session.get(System, payload.system_id)
  if not customer:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
  if not system:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
  if not system.is_active:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="System is inactive, orders cannot be created against it",
    )

  happened_at = normalize_happened_at(payload.happened_at)
  paid_amount = payload.paid_amount or 0
  money_delta = _money_delta_for_mode(payload.order_mode, payload.price_total, paid_amount)
  cyl_delta = payload.cylinders_installed - payload.cylinders_received
  if payload.order_mode in {"sell_iron", "buy_iron"}:
    cyl_delta = 0
  current_money = sum_customer_money(session, customer_id=payload.customer_id)
  current_cyl_12 = sum_customer_cylinders(session, customer_id=payload.customer_id, gas_type="12kg")
  current_cyl_48 = sum_customer_cylinders(session, customer_id=payload.customer_id, gas_type="48kg")
  next_money = current_money + money_delta
  next_cyl_12 = current_cyl_12 + (cyl_delta if payload.gas_type == "12kg" else 0)
  next_cyl_48 = current_cyl_48 + (cyl_delta if payload.gas_type == "48kg" else 0)

  txn = CustomerTransaction(
    customer_id=payload.customer_id,
    system_id=payload.system_id,
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="order",
    mode=payload.order_mode,
    gas_type=payload.gas_type,
    installed=payload.cylinders_installed,
    received=payload.cylinders_received,
    total=payload.price_total,
    paid=paid_amount,
    debt_cash=next_money,
    debt_cylinders_12=next_cyl_12,
    debt_cylinders_48=next_cyl_48,
    note=payload.note,
    request_id=payload.request_id,
    is_reversed=False,
  )
  session.add(txn)
  post_customer_transaction(session, txn)
  session.commit()
  session.refresh(txn)
  return _order_out(txn)


@router.put("/{order_id}", response_model=OrderOut)
def update_order(order_id: str, payload: OrderUpdate, session: Session = Depends(get_session)) -> OrderOut:
  existing = session.get(CustomerTransaction, order_id)
  if not existing or existing.kind != "order" or existing.is_reversed:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

  payload_data = payload.model_dump(exclude_unset=True)
  customer_id, system_id, mode, gas_type = _resolve_update_order_context(
    existing=existing,
    payload_data=payload_data,
  )
  _validate_order_context_on_update(
    session,
    payload_data=payload_data,
    customer_id=customer_id,
    system_id=system_id,
    order_mode=mode,
    gas_type=gas_type,
  )

  # reverse existing
  reversal_happened_at = existing.happened_at
  reversal_day = existing.day
  reversal = CustomerTransaction(
    customer_id=existing.customer_id,
    system_id=existing.system_id,
    happened_at=reversal_happened_at,
    day=reversal_day,
    kind="order",
    mode=existing.mode,
    gas_type=existing.gas_type,
    installed=existing.installed,
    received=existing.received,
    total=existing.total,
    paid=existing.paid,
    debt_cash=existing.debt_cash,
    debt_cylinders_12=existing.debt_cylinders_12,
    debt_cylinders_48=existing.debt_cylinders_48,
    note=f"Reversal of {existing.id}",
    reversed_id=existing.id,
    is_reversed=True,
  )
  session.add(reversal)
  reverse_source(
    session,
    source_type="customer_txn",
    source_id=existing.id,
    reversal_source_type="customer_txn",
    reversal_source_id=reversal.id,
    happened_at=reversal.happened_at,
    day=reversal.day,
    note=reversal.note,
  )
  existing.is_reversed = True
  session.add(existing)
  session.flush()

  happened_at_raw = payload_data["happened_at"] if payload_data.get("happened_at") is not None else existing.happened_at
  happened_at = normalize_happened_at(happened_at_raw)
  paid_amount = _resolve_value(payload_data, "paid_amount", existing.paid)
  total_amount = _resolve_value(payload_data, "price_total", existing.total)
  installed = _resolve_value(payload_data, "cylinders_installed", existing.installed)
  received = _resolve_value(payload_data, "cylinders_received", existing.received)
  note = _resolve_value(payload_data, "note", existing.note)

  money_delta = _money_delta_for_mode(mode, total_amount, paid_amount)
  cyl_delta = installed - received
  if mode in {"sell_iron", "buy_iron"}:
    cyl_delta = 0
  current_money = sum_customer_money(session, customer_id=customer_id)
  current_cyl_12 = sum_customer_cylinders(session, customer_id=customer_id, gas_type="12kg")
  current_cyl_48 = sum_customer_cylinders(session, customer_id=customer_id, gas_type="48kg")
  next_money = current_money + money_delta
  next_cyl_12 = current_cyl_12 + (cyl_delta if gas_type == "12kg" else 0)
  next_cyl_48 = current_cyl_48 + (cyl_delta if gas_type == "48kg" else 0)

  txn = CustomerTransaction(
    customer_id=customer_id,
    system_id=system_id,
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="order",
    mode=mode,
    gas_type=gas_type,
    installed=installed,
    received=received,
    total=total_amount,
    paid=paid_amount,
    debt_cash=next_money,
    debt_cylinders_12=next_cyl_12,
    debt_cylinders_48=next_cyl_48,
    note=note,
    is_reversed=False,
  )
  session.add(txn)
  post_customer_transaction(session, txn)
  session.commit()
  session.refresh(txn)
  return _order_out(txn)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: str, session: Session = Depends(get_session)) -> None:
  existing = session.get(CustomerTransaction, order_id)
  if not existing or existing.kind != "order" or existing.is_reversed:
    return
  reversal_happened_at = existing.happened_at
  reversal_day = existing.day
  reversal = CustomerTransaction(
    customer_id=existing.customer_id,
    system_id=existing.system_id,
    happened_at=reversal_happened_at,
    day=reversal_day,
    kind="order",
    mode=existing.mode,
    gas_type=existing.gas_type,
    installed=existing.installed,
    received=existing.received,
    total=existing.total,
    paid=existing.paid,
    debt_cash=existing.debt_cash,
    debt_cylinders_12=existing.debt_cylinders_12,
    debt_cylinders_48=existing.debt_cylinders_48,
    note=f"Reversal of {existing.id}",
    reversed_id=existing.id,
    is_reversed=True,
  )
  session.add(reversal)
  reverse_source(
    session,
    source_type="customer_txn",
    source_id=existing.id,
    reversal_source_type="customer_txn",
    reversal_source_id=reversal.id,
    happened_at=reversal.happened_at,
    day=reversal.day,
    note=reversal.note,
  )
  existing.is_reversed = True
  session.add(existing)
  session.commit()

