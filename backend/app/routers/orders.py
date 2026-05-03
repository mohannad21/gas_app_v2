from datetime import datetime, timezone
from typing import Annotated, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.auth import get_tenant_id, require_permission
from app.db import get_session
from app.models import Customer, CustomerTransaction, System
from app.schemas import OrderCreate, OrderOut, OrderUpdate
from app.services.ledger import sum_customer_cylinders, sum_customer_money
from app.services.order_helpers import resolve_value, resolve_update_order_context, validate_order_context_on_update, money_delta_for_mode, order_gas_types, resolve_active_order, order_out, compute_impact
from app.services.posting import allocate_happened_at, derive_day, post_customer_transaction, reverse_source
from app.utils.locks import acquire_customer_locks, acquire_inventory_locks

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/validate_order_impact")
def validate_order_impact(
  customer_id: str = Query(...),
  system_id: Optional[str] = Query(default=None),
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

  if order_mode in {"replacement", "sell_iron"}:
    if not system_id:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System required for this order type")
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
  return compute_impact(
    customer_money=customer_money,
    customer_cyl_12=cyl12,
    customer_cyl_48=cyl48,
    payload=payload,
  )


@router.get("/whatsapp_link/{order_id}")
def whatsapp_link(order_id: str, session: Session = Depends(get_session)) -> dict:
  order = session.get(CustomerTransaction, order_id)
  if not order or order.kind != "order" or order.deleted_at is not None:
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
  url = f"https://wa.me/{phone}?text={quote(message, safe='')}"
  return {"url": url}


@router.get("", response_model=list[OrderOut])
def list_orders(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> list[OrderOut]:
  stmt = (
    select(CustomerTransaction)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.tenant_id == tenant_id)
  )
  if not include_deleted:
    stmt = stmt.where(CustomerTransaction.deleted_at == None)  # noqa: E711
  if before:
    try:
      cursor_dt = datetime.fromisoformat(before)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid before date format") from exc
    stmt = stmt.where(CustomerTransaction.happened_at < cursor_dt)
  stmt = stmt.order_by(
    CustomerTransaction.happened_at.desc(),
    CustomerTransaction.created_at.desc(),
    CustomerTransaction.id.desc(),
  ).limit(limit)
  rows = session.exec(stmt).all()
  return [order_out(row, session) for row in rows]


@router.post(
  "",
  response_model=OrderOut,
  status_code=status.HTTP_201_CREATED,
  dependencies=[Depends(require_permission("orders:write"))],
)
def create_order(
  payload: OrderCreate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> OrderOut:
  happened_at = allocate_happened_at(session, tenant_id=tenant_id, value=payload.happened_at)
  try:
    acquire_customer_locks(session, [payload.customer_id])
    acquire_inventory_locks(session, order_gas_types(payload.gas_type))
    if payload.request_id:
      existing = session.exec(
        select(CustomerTransaction)
        .where(CustomerTransaction.request_id == payload.request_id)
        .where(CustomerTransaction.tenant_id == tenant_id)
      ).first()
      if existing:
        return order_out(existing, session)

    customer = session.exec(
      select(Customer)
      .where(Customer.id == payload.customer_id)
      .where(Customer.tenant_id == tenant_id)
    ).first()
    if not customer:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

    system = None
    if payload.order_mode in {"replacement", "sell_iron"}:
      if not payload.system_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System required for this order type")
      system = session.exec(
        select(System)
        .where(System.id == payload.system_id)
        .where(System.tenant_id == tenant_id)
      ).first()
      if not system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
      if not system.is_active:
        raise HTTPException(
          status_code=status.HTTP_400_BAD_REQUEST,
          detail="System is inactive, orders cannot be created against it",
        )

    paid_amount = payload.paid_amount or 0
    money_delta = money_delta_for_mode(payload.order_mode, payload.price_total, paid_amount)
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
      tenant_id=tenant_id,
      group_id="",
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
    )
    txn.group_id = txn.id
    session.add(txn)
    post_customer_transaction(session, txn)
    session.commit()
  except Exception:
    session.rollback()
    raise
  session.refresh(txn)
  return order_out(txn, session)


@router.put(
  "/{order_id}",
  response_model=OrderOut,
  dependencies=[Depends(require_permission("orders:write"))],
)
def update_order(
  order_id: str,
  payload: OrderUpdate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> OrderOut:
  payload_data = payload.model_dump(exclude_unset=True)
  try:
    existing = resolve_active_order(session, order_id)
    if not existing or existing.tenant_id != tenant_id or existing.kind != "order" or existing.deleted_at is not None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    customer_id, system_id, mode, gas_type = resolve_update_order_context(
      existing=existing,
      payload_data=payload_data,
    )
    customer = session.exec(
      select(Customer)
      .where(Customer.id == customer_id)
      .where(Customer.tenant_id == tenant_id)
    ).first()
    if not customer:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
    if mode == "replacement":
      if not system_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System is required for replacement orders")
      system = session.exec(
        select(System)
        .where(System.id == system_id)
        .where(System.tenant_id == tenant_id)
      ).first()
      if not system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
    elif system_id:
      system = session.exec(
        select(System)
        .where(System.id == system_id)
        .where(System.tenant_id == tenant_id)
      ).first()
      if not system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System not found")
    acquire_customer_locks(session, [existing.customer_id, customer_id])
    acquire_inventory_locks(session, order_gas_types(existing.gas_type, gas_type))
    validate_order_context_on_update(
      session,
      payload_data=payload_data,
      customer_id=customer_id,
      system_id=system_id,
      order_mode=mode,
      gas_type=gas_type,
    )

    reversal_happened_at = existing.happened_at
    reversal_day = existing.day
    reversal = CustomerTransaction(
      tenant_id=tenant_id,
      group_id=existing.group_id or existing.id,
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
      deleted_at=datetime.now(timezone.utc),
      reversal_source_id=existing.id,
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
    existing.deleted_at = datetime.now(timezone.utc)
    session.add(existing)
    session.flush()

    happened_at_raw = payload_data["happened_at"] if payload_data.get("happened_at") is not None else existing.happened_at
    happened_at = allocate_happened_at(session, tenant_id=tenant_id, value=happened_at_raw)
    paid_amount = resolve_value(payload_data, "paid_amount", existing.paid)
    total_amount = resolve_value(payload_data, "price_total", existing.total)
    installed = resolve_value(payload_data, "cylinders_installed", existing.installed)
    received = resolve_value(payload_data, "cylinders_received", existing.received)
    note = resolve_value(payload_data, "note", existing.note)

    money_delta = money_delta_for_mode(mode, total_amount, paid_amount)
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
      tenant_id=tenant_id,
      group_id=existing.group_id or existing.id,
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
      reversed_id=existing.id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    session.commit()
  except Exception:
    session.rollback()
    raise
  session.refresh(txn)
  return order_out(txn, session)


@router.delete(
  "/{order_id}",
  status_code=status.HTTP_204_NO_CONTENT,
  dependencies=[Depends(require_permission("orders:write"))],
)
def delete_order(
  order_id: str,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> None:
  try:
    existing = resolve_active_order(session, order_id)
    if not existing or existing.tenant_id != tenant_id or existing.kind != "order" or existing.deleted_at is not None:
      return
    acquire_customer_locks(session, [existing.customer_id])
    acquire_inventory_locks(session, order_gas_types(existing.gas_type))
    reversal_happened_at = existing.happened_at
    reversal_day = existing.day
    reversal = CustomerTransaction(
      tenant_id=tenant_id,
      group_id=existing.group_id or existing.id,
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
      deleted_at=datetime.now(timezone.utc),
      reversal_source_id=existing.id,
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
    existing.deleted_at = datetime.now(timezone.utc)
    session.add(existing)
    session.commit()
  except Exception:
    session.rollback()
    raise
