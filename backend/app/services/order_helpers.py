"""Order operation helpers.

Utilities for order context resolution, validation, impact computation, and output serialization.
"""

from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models import Customer, CustomerTransaction, System
from app.schemas import OrderCreate, OrderOut
from app.services.ledger import boundary_for_source, snapshot_customer_debts


def resolve_value(payload_data: dict, field: str, current):
  """Resolve field value from payload or fall back to current."""
  return payload_data[field] if field in payload_data else current


def normalize_system_id(value: Optional[str]) -> Optional[str]:
  """Normalize system ID, treating empty strings as None."""
  if value is None:
    return None
  return value or None


def resolve_update_order_context(
  *,
  existing: CustomerTransaction,
  payload_data: dict,
) -> tuple[str, Optional[str], str, str]:
  """Resolve order context from payload and existing order.

  Returns: (customer_id, system_id, order_mode, gas_type)
  """
  order_mode = resolve_value(payload_data, "order_mode", existing.mode or "replacement")
  customer_id = resolve_value(payload_data, "customer_id", existing.customer_id)
  system_id = normalize_system_id(resolve_value(payload_data, "system_id", existing.system_id))
  gas_type = resolve_value(payload_data, "gas_type", existing.gas_type or "12kg")

  # Non-replacement orders only use system as optional operational context.
  if (
    order_mode != "replacement"
    and "customer_id" in payload_data
    and "system_id" not in payload_data
    and customer_id != existing.customer_id
  ):
    system_id = None

  return customer_id, system_id, order_mode, gas_type


def validate_order_context_on_update(
  session: Session,
  *,
  payload_data: dict,
  customer_id: str,
  system_id: Optional[str],
  order_mode: str,
  gas_type: str,
) -> tuple[Customer, Optional[System]]:
  """Validate order context on update.

  Ensures customer and system exist, are active, and match constraints.
  Returns: (customer, system or None)
  """
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


def money_delta_for_mode(order_mode: str, total: int, paid: int) -> int:
  """Compute money delta based on order mode.

  For buy_iron: delta = paid - total (customer pays for iron)
  For others: delta = total - paid (customer owes for gas)
  """
  if order_mode == "buy_iron":
    return paid - total
  return total - paid


def order_gas_types(*values: Optional[str]) -> list[str]:
  """Extract non-empty gas types from arguments."""
  return [value for value in values if value]


def resolve_active_order(session: Session, order_id: str) -> Optional[CustomerTransaction]:
  """Resolve active order, following reversal chain to current active order."""
  current = session.get(CustomerTransaction, order_id)
  if not current or current.kind != "order":
    return current

  visited: set[str] = set()
  while current.deleted_at is not None and current.id not in visited:
    visited.add(current.id)
    next_txn = session.exec(
      select(CustomerTransaction)
      .where(CustomerTransaction.kind == "order")
      .where(CustomerTransaction.reversed_id == current.id)
      .order_by(CustomerTransaction.created_at.desc())
    ).first()
    if not next_txn:
      break
    current = next_txn
  return current


def order_out(txn: CustomerTransaction, session: Session) -> OrderOut:
  """Serialize order transaction to OrderOut schema."""
  after_boundary = boundary_for_source(session, source_type="customer_txn", source_id=txn.id)
  if after_boundary is not None:
    live = snapshot_customer_debts(session, customer_id=txn.customer_id, boundary=after_boundary)
  else:
    live = {
      "debt_cash": txn.debt_cash,
      "debt_cylinders_12": txn.debt_cylinders_12,
      "debt_cylinders_48": txn.debt_cylinders_48,
    }

  money_after = live["debt_cash"]
  cyl12_after = live["debt_cylinders_12"]
  cyl48_after = live["debt_cylinders_48"]

  mode = txn.mode or "replacement"
  money_delta = money_delta_for_mode(mode, txn.total, txn.paid)
  money_before = money_after - money_delta

  cyl12_before = cyl12_after
  cyl48_before = cyl48_after
  if mode == "replacement":
    cyl_delta = txn.installed - txn.received
    if txn.gas_type == "12kg":
      cyl12_before = cyl12_after - cyl_delta
    elif txn.gas_type == "48kg":
      cyl48_before = cyl48_after - cyl_delta

  return OrderOut(
    id=txn.group_id or txn.id,
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
    money_balance_before=money_before,
    money_balance_after=money_after,
    cyl_balance_before={"12kg": cyl12_before, "48kg": cyl48_before},
    cyl_balance_after={"12kg": cyl12_after, "48kg": cyl48_after},
    is_deleted=txn.deleted_at is not None,
  )


def compute_impact(*, customer_money: int, customer_cyl_12: int, customer_cyl_48: int, payload: OrderCreate) -> dict:
  """Compute order impact on customer balances.

  Returns dict with: gross_paid, applied_credit, unpaid, new_balance, cyl_balance_before, cyl_balance_after
  """
  paid = payload.paid_amount or 0
  total = payload.price_total
  money_delta = money_delta_for_mode(payload.order_mode, total, paid)
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
