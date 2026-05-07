from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.auth import get_tenant_id, require_permission
from app.db import get_session
from app.models import CompanyTransaction
from app.schemas import (
  CompanyBalanceAdjustmentCreate,
  CompanyBalanceAdjustmentOut,
  CompanyBalanceAdjustmentUpdate,
  CompanyBalancesOut,
  CompanyBuyIronCreate,
  CompanyBuyIronOut,
  CompanyCylinderSettleCreate,
  CompanyCylinderSettleOut,
  CompanyPaymentCreate,
  CompanyPaymentOut,
)
from app.services.ledger import boundary_for_source, boundary_from_entries, snapshot_company_debts, sum_company_cylinders, sum_company_money, sum_inventory
from app.services.posting import allocate_happened_at, derive_day, parse_happened_at_parts, post_company_transaction, reverse_source
from app.utils.locks import acquire_company_lock, acquire_inventory_locks

router = APIRouter(prefix="/company", tags=["company"])


def _resolve_active_company_adjustment(session: Session, adjustment_id: str) -> CompanyTransaction | None:
  current = session.get(CompanyTransaction, adjustment_id)
  if not current:
    return None

  visited: set[str] = set()
  while current.deleted_at is not None and current.id not in visited:
    visited.add(current.id)
    next_adjustment = session.exec(
      select(CompanyTransaction)
      .where(CompanyTransaction.reversed_id == current.id)
      .order_by(CompanyTransaction.created_at.desc())
    ).first()
    if not next_adjustment:
      break
    current = next_adjustment
  return current


def _company_adjustment_target_happened_at(
  session: Session,
  tenant_id: str,
  payload: CompanyBalanceAdjustmentCreate | CompanyBalanceAdjustmentUpdate,
  *,
  fallback: datetime | None = None,
) -> datetime:
  happened_at = payload.happened_at
  if happened_at is None and (payload.date or payload.time or payload.time_of_day or payload.at):
    happened_at = parse_happened_at_parts(
      date_str=payload.date,
      time_str=payload.time,
      time_of_day=payload.time_of_day,
      at=payload.at,
    )
  if happened_at is None:
    happened_at = fallback
  if happened_at is None:
    raise HTTPException(status_code=400, detail="happened_at_required")
  return allocate_happened_at(session, tenant_id=tenant_id, value=happened_at)


def _post_company_adjustment(
  session: Session,
  *,
  tenant_id: str,
  happened_at: datetime,
  money_balance: int,
  cylinder_balance_12: int,
  cylinder_balance_48: int,
  note: str | None,
  request_id: str | None = None,
  reversed_id: str | None = None,
) -> CompanyTransaction:
  current_money = sum_company_money(session, up_to=happened_at)
  current_cyl_12 = sum_company_cylinders(session, gas_type="12kg", up_to=happened_at)
  current_cyl_48 = sum_company_cylinders(session, gas_type="48kg", up_to=happened_at)

  delta_money = money_balance - current_money
  delta_cyl_12 = cylinder_balance_12 - current_cyl_12
  delta_cyl_48 = cylinder_balance_48 - current_cyl_48
  if delta_money == 0 and delta_cyl_12 == 0 and delta_cyl_48 == 0:
    raise HTTPException(status_code=400, detail="adjustment_required")

  txn = CompanyTransaction(
    tenant_id=tenant_id,
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="adjust",
    buy12=delta_cyl_12,
    buy48=delta_cyl_48,
    total=delta_money,
    paid=0,
    note=note,
    request_id=request_id,
    reversed_id=reversed_id,
  )
  session.add(txn)
  post_company_transaction(session, txn)
  return txn


def _company_adjustment_out(row: CompanyTransaction, session: Session) -> CompanyBalanceAdjustmentOut:
  boundary = boundary_for_source(session, source_type="company_txn", source_id=row.id)
  if boundary is not None:
    live = snapshot_company_debts(session, up_to=row.happened_at, boundary=boundary)
  else:
    live = {
      "debt_cash": row.debt_cash,
      "debt_cylinders_12": row.debt_cylinders_12,
      "debt_cylinders_48": row.debt_cylinders_48,
    }
  return CompanyBalanceAdjustmentOut(
    id=row.id,
    happened_at=row.happened_at,
    created_at=row.created_at,
    money_balance=row.debt_cash,
    cylinder_balance_12=row.debt_cylinders_12,
    cylinder_balance_48=row.debt_cylinders_48,
    delta_money=row.total,
    delta_cylinder_12=row.buy12,
    delta_cylinder_48=row.buy48,
    live_debt_cash=live["debt_cash"],
    live_debt_cylinders_12=live["debt_cylinders_12"],
    live_debt_cylinders_48=live["debt_cylinders_48"],
    note=row.note,
    is_deleted=row.deleted_at is not None,
  )

@router.post("/cylinders/settle", response_model=CompanyCylinderSettleOut, status_code=status.HTTP_201_CREATED)
def settle_company_cylinders(
  payload: CompanyCylinderSettleCreate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> CompanyCylinderSettleOut:
  if payload.quantity <= 0:
    raise HTTPException(status_code=400, detail="quantity_must_be_positive")

  happened_at = allocate_happened_at(session, tenant_id=tenant_id, value=payload.happened_at)
  buy12 = return12 = buy48 = return48 = 0
  if payload.gas_type == "12kg":
    if payload.direction == "receive_full":
      buy12 = payload.quantity
    else:
      return12 = payload.quantity
  else:
    if payload.direction == "receive_full":
      buy48 = payload.quantity
    else:
      return48 = payload.quantity

  try:
    acquire_company_lock(session)
    acquire_inventory_locks(session, [payload.gas_type])
    if payload.request_id:
      existing = session.exec(
        select(CompanyTransaction)
        .where(CompanyTransaction.request_id == payload.request_id)
        .where(CompanyTransaction.tenant_id == tenant_id)
      ).first()
      if existing:
        if payload.gas_type == "12kg":
          quantity = existing.buy12 or existing.return12
          direction = "receive_full" if existing.buy12 else "return_empty"
        else:
          quantity = existing.buy48 or existing.return48
          direction = "receive_full" if existing.buy48 else "return_empty"
        return CompanyCylinderSettleOut(
          id=existing.id,
          happened_at=existing.happened_at,
          gas_type=payload.gas_type,
          quantity=quantity,
          direction=direction,  # type: ignore[arg-type]
          note=existing.note,
        )

    txn = CompanyTransaction(
      tenant_id=tenant_id,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="refill",
      buy12=buy12,
      return12=return12,
      buy48=buy48,
      return48=return48,
      total=0,
      paid=0,
      note=payload.note,
      request_id=payload.request_id,
    )
    session.add(txn)
    entries = post_company_transaction(session, txn)
    boundary = boundary_from_entries(entries)
    snapshot = snapshot_company_debts(session, up_to=txn.happened_at, boundary=boundary)
    txn.debt_cash = snapshot["debt_cash"]
    txn.debt_cylinders_12 = snapshot["debt_cylinders_12"]
    txn.debt_cylinders_48 = snapshot["debt_cylinders_48"]
    session.commit()
  except Exception:
    session.rollback()
    raise
  session.refresh(txn)

  return CompanyCylinderSettleOut(
    id=txn.id,
    happened_at=txn.happened_at,
    gas_type=payload.gas_type,
    quantity=payload.quantity,
    direction=payload.direction,
    note=txn.note,
  )


@router.post(
  "/payments",
  response_model=CompanyPaymentOut,
  status_code=status.HTTP_201_CREATED,
  dependencies=[Depends(require_permission("company:write"))],
)
def create_company_payment(
  payload: CompanyPaymentCreate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> CompanyPaymentOut:
  if payload.amount == 0:
    raise HTTPException(status_code=400, detail="amount_must_be_nonzero")

  happened_at = allocate_happened_at(
    session,
    tenant_id=tenant_id,
    value=
    payload.happened_at
    or parse_happened_at_parts(
      date_str=payload.date,
      time_str=payload.time,
      time_of_day=payload.time_of_day,
      at=payload.at,
    )
  )

  try:
    acquire_company_lock(session)
    if payload.request_id:
      existing = session.exec(
        select(CompanyTransaction)
        .where(CompanyTransaction.request_id == payload.request_id)
        .where(CompanyTransaction.tenant_id == tenant_id)
      ).first()
      if existing:
        return CompanyPaymentOut(
          id=existing.id,
          happened_at=existing.happened_at,
          created_at=existing.created_at,
          amount=existing.paid,
          note=existing.note,
        )

    txn = CompanyTransaction(
      tenant_id=tenant_id,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="payment",
      total=0,
      paid=payload.amount,
      note=payload.note,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_company_transaction(session, txn)
    session.commit()
  except Exception:
    session.rollback()
    raise
  session.refresh(txn)

  return CompanyPaymentOut(
    id=txn.id,
    happened_at=txn.happened_at,
    created_at=txn.created_at,
    amount=txn.paid,
    note=txn.note,
  )


@router.get("/payments", response_model=list[CompanyPaymentOut])
def list_company_payments(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> list[CompanyPaymentOut]:
  stmt = (
    select(CompanyTransaction)
    .where(CompanyTransaction.kind == "payment")
    .where(CompanyTransaction.tenant_id == tenant_id)
  )
  if not include_deleted:
    stmt = stmt.where(CompanyTransaction.deleted_at == None)  # noqa: E711
  if before:
    try:
      cursor_dt = datetime.fromisoformat(before)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid before date format") from exc
    stmt = stmt.where(CompanyTransaction.happened_at < cursor_dt)
  stmt = stmt.order_by(
    CompanyTransaction.happened_at.desc(),
    CompanyTransaction.created_at.desc(),
    CompanyTransaction.id.desc(),
  ).limit(limit)
  rows = session.exec(stmt).all()
  result = []
  for row in rows:
    boundary = boundary_for_source(session, source_type="company_txn", source_id=row.id)
    live_debt_cash = sum_company_money(session, boundary=boundary) if boundary is not None else None
    result.append(CompanyPaymentOut(
      id=row.id,
      happened_at=row.happened_at,
      created_at=row.created_at,
      amount=row.paid,
      note=row.note,
      is_deleted=row.deleted_at is not None,
      live_debt_cash=live_debt_cash,
    ))
  return result


@router.get("/balance-adjustments", response_model=list[CompanyBalanceAdjustmentOut])
def list_company_balance_adjustments(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> list[CompanyBalanceAdjustmentOut]:
  stmt = (
    select(CompanyTransaction)
    .where(CompanyTransaction.kind == "adjust")
    .where(CompanyTransaction.tenant_id == tenant_id)
  )
  if not include_deleted:
    stmt = stmt.where(CompanyTransaction.deleted_at == None)  # noqa: E711
  if before:
    try:
      cursor_dt = datetime.fromisoformat(before)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid before date format") from exc
    stmt = stmt.where(CompanyTransaction.happened_at < cursor_dt)
  stmt = stmt.order_by(
    CompanyTransaction.happened_at.desc(),
    CompanyTransaction.created_at.desc(),
    CompanyTransaction.id.desc(),
  ).limit(limit)
  rows = session.exec(stmt).all()
  return [_company_adjustment_out(row, session) for row in rows]


@router.delete(
  "/payments/{payment_id}",
  status_code=status.HTTP_204_NO_CONTENT,
  dependencies=[Depends(require_permission("company:write"))],
)
def delete_company_payment(
  payment_id: str,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> None:
  try:
    existing = session.get(CompanyTransaction, payment_id)
    if not existing or existing.tenant_id != tenant_id or existing.deleted_at is not None or existing.kind != "payment":
      raise HTTPException(status_code=404, detail="Company payment not found")
    acquire_company_lock(session)
    reversal_happened_at = existing.happened_at
    reversal_day = existing.day
    reversal = CompanyTransaction(
      tenant_id=tenant_id,
      happened_at=reversal_happened_at,
      day=reversal_day,
      kind=existing.kind,
      buy12=existing.buy12,
      return12=existing.return12,
      buy48=existing.buy48,
      return48=existing.return48,
      new12=existing.new12,
      new48=existing.new48,
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
      source_type="company_txn",
      source_id=existing.id,
      reversal_source_type="company_txn",
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


@router.delete(
  "/balance-adjustments/{adjustment_id}",
  status_code=status.HTTP_204_NO_CONTENT,
  dependencies=[Depends(require_permission("company:write"))],
)
def delete_company_balance_adjustment(
  adjustment_id: str,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> None:
  try:
    existing = _resolve_active_company_adjustment(session, adjustment_id)
    if not existing or existing.tenant_id != tenant_id or existing.deleted_at is not None or existing.kind != "adjust":
      raise HTTPException(status_code=404, detail="Company balance adjustment not found")
    acquire_company_lock(session)
    reversal = CompanyTransaction(
      tenant_id=tenant_id,
      happened_at=existing.happened_at,
      day=existing.day,
      kind=existing.kind,
      buy12=existing.buy12,
      return12=existing.return12,
      buy48=existing.buy48,
      return48=existing.return48,
      new12=existing.new12,
      new48=existing.new48,
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
      source_type="company_txn",
      source_id=existing.id,
      reversal_source_type="company_txn",
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


@router.put(
  "/balance-adjustments/{adjustment_id}",
  response_model=CompanyBalanceAdjustmentOut,
  dependencies=[Depends(require_permission("company:write"))],
)
def update_company_balance_adjustment(
  adjustment_id: str,
  payload: CompanyBalanceAdjustmentUpdate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> CompanyBalanceAdjustmentOut:
  try:
    existing = _resolve_active_company_adjustment(session, adjustment_id)
    if not existing or existing.tenant_id != tenant_id or existing.deleted_at is not None or existing.kind != "adjust":
      raise HTTPException(status_code=404, detail="Company balance adjustment not found")
    acquire_company_lock(session)
    acquire_inventory_locks(session, ["12kg", "48kg"])
    reversal = CompanyTransaction(
      tenant_id=tenant_id,
      happened_at=existing.happened_at,
      day=existing.day,
      kind=existing.kind,
      buy12=existing.buy12,
      return12=existing.return12,
      buy48=existing.buy48,
      return48=existing.return48,
      new12=existing.new12,
      new48=existing.new48,
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
      source_type="company_txn",
      source_id=existing.id,
      reversal_source_type="company_txn",
      reversal_source_id=reversal.id,
      happened_at=reversal.happened_at,
      day=reversal.day,
      note=reversal.note,
    )
    existing.deleted_at = datetime.now(timezone.utc)
    session.add(existing)

    happened_at = _company_adjustment_target_happened_at(
      session,
      tenant_id,
      payload,
      fallback=existing.happened_at,
    )
    next_adjustment = _post_company_adjustment(
      session,
      tenant_id=tenant_id,
      happened_at=happened_at,
      money_balance=payload.money_balance if payload.money_balance is not None else existing.debt_cash,
      cylinder_balance_12=payload.cylinder_balance_12 if payload.cylinder_balance_12 is not None else existing.debt_cylinders_12,
      cylinder_balance_48=payload.cylinder_balance_48 if payload.cylinder_balance_48 is not None else existing.debt_cylinders_48,
      note=payload.note if payload.note is not None else existing.note,
      reversed_id=existing.id,
    )
    session.commit()
  except Exception:
    session.rollback()
    raise
  session.refresh(next_adjustment)
  return _company_adjustment_out(next_adjustment, session)


@router.post(
  "/buy_iron",
  response_model=CompanyBuyIronOut,
  status_code=status.HTTP_201_CREATED,
  dependencies=[Depends(require_permission("company:write"))],
)
def create_company_buy_iron(
  payload: CompanyBuyIronCreate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> CompanyBuyIronOut:
  if payload.new12 <= 0 and payload.new48 <= 0:
    raise HTTPException(status_code=400, detail="quantity_must_be_positive")

  happened_at = allocate_happened_at(
    session,
    tenant_id=tenant_id,
    value=
    payload.happened_at
    or parse_happened_at_parts(
      date_str=payload.date,
      time_str=payload.time,
      time_of_day=payload.time_of_day,
      at=payload.at,
    )
  )

  try:
    acquire_company_lock(session)
    acquire_inventory_locks(
      session,
      [gas_type for gas_type, quantity in (("12kg", payload.new12), ("48kg", payload.new48)) if quantity > 0],
    )
    if payload.request_id:
      existing = session.exec(
        select(CompanyTransaction)
        .where(CompanyTransaction.request_id == payload.request_id)
        .where(CompanyTransaction.tenant_id == tenant_id)
      ).first()
      if existing:
        return CompanyBuyIronOut(
          id=existing.id,
          happened_at=existing.happened_at,
          new12=existing.new12,
          new48=existing.new48,
          total_cost=existing.total,
          paid_now=existing.paid,
          note=existing.note,
        )

    txn = CompanyTransaction(
      tenant_id=tenant_id,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="buy_iron",
      new12=payload.new12,
      new48=payload.new48,
      total=payload.total_cost,
      paid=payload.paid_now,
      note=payload.note,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_company_transaction(session, txn)
    session.commit()
  except Exception:
    session.rollback()
    raise
  session.refresh(txn)

  return CompanyBuyIronOut(
    id=txn.id,
    happened_at=txn.happened_at,
    new12=txn.new12,
    new48=txn.new48,
    total_cost=txn.total,
    paid_now=txn.paid,
    note=txn.note,
  )


@router.post("/balances/adjust", response_model=CompanyBalanceAdjustmentOut, status_code=status.HTTP_201_CREATED)
def adjust_company_balances(
  payload: CompanyBalanceAdjustmentCreate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> CompanyBalanceAdjustmentOut:
  happened_at = _company_adjustment_target_happened_at(session, tenant_id, payload)

  try:
    acquire_company_lock(session)
    acquire_inventory_locks(session, ["12kg", "48kg"])
    if payload.request_id:
      existing = session.exec(
        select(CompanyTransaction)
        .where(CompanyTransaction.request_id == payload.request_id)
        .where(CompanyTransaction.tenant_id == tenant_id)
      ).first()
      if existing:
        return _company_adjustment_out(existing, session)

    txn = _post_company_adjustment(
      session,
      tenant_id=tenant_id,
      happened_at=happened_at,
      money_balance=payload.money_balance,
      cylinder_balance_12=payload.cylinder_balance_12,
      cylinder_balance_48=payload.cylinder_balance_48,
      note=payload.note,
      request_id=payload.request_id,
    )
    session.commit()
  except Exception:
    session.rollback()
    raise
  session.refresh(txn)

  return _company_adjustment_out(txn, session)


@router.get("/balances", response_model=CompanyBalancesOut)
def get_company_balances(session: Session = Depends(get_session)) -> CompanyBalancesOut:
  inv = sum_inventory(session)
  return CompanyBalancesOut(
    company_money=sum_company_money(session),
    company_cyl_12=sum_company_cylinders(session, gas_type="12kg"),
    company_cyl_48=sum_company_cylinders(session, gas_type="48kg"),
    inventory_full_12=inv["full12"],
    inventory_empty_12=inv["empty12"],
    inventory_full_48=inv["full48"],
    inventory_empty_48=inv["empty48"],
  )

