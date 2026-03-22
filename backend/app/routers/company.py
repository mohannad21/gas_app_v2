from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import CompanyTransaction
from app.schemas import (
  CompanyBalanceAdjustmentCreate,
  CompanyBalanceAdjustmentOut,
  CompanyBalancesOut,
  CompanyBuyIronCreate,
  CompanyBuyIronOut,
  CompanyCylinderSettleCreate,
  CompanyCylinderSettleOut,
  CompanyPaymentCreate,
  CompanyPaymentOut,
)
from app.services.ledger import boundary_from_entries, snapshot_company_debts, sum_company_cylinders, sum_company_money, sum_inventory
from app.services.posting import derive_day, normalize_happened_at, post_company_transaction
from app.utils.time import business_date_start_utc

router = APIRouter(prefix="/company", tags=["company"])


def _parse_datetime(
  *,
  date_str: Optional[str],
  time_str: Optional[str] = None,
  time_of_day: Optional[str] = None,
  at: Optional[str] = None,
) -> Optional[datetime]:
  if at:
    try:
      value = datetime.fromisoformat(at)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid datetime format") from exc
    if value.tzinfo is None:
      return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
  if not date_str:
    return None
  try:
    day = datetime.fromisoformat(date_str).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  base = business_date_start_utc(day)
  if time_str:
    try:
      parsed = datetime.strptime(time_str, "%H:%M").time()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid time format") from exc
    base = base + timedelta(hours=parsed.hour, minutes=parsed.minute)
  elif time_of_day == "morning":
    base = base + timedelta(hours=9)
  elif time_of_day == "evening":
    base = base + timedelta(hours=18)
  else:
    base = base + timedelta(hours=12)
  return base.replace(tzinfo=timezone.utc)


@router.post("/cylinders/settle", response_model=CompanyCylinderSettleOut, status_code=status.HTTP_201_CREATED)
def settle_company_cylinders(
  payload: CompanyCylinderSettleCreate, session: Session = Depends(get_session)
) -> CompanyCylinderSettleOut:
  if payload.quantity <= 0:
    raise HTTPException(status_code=400, detail="quantity_must_be_positive")

  if payload.request_id:
    existing = session.exec(
      select(CompanyTransaction).where(CompanyTransaction.request_id == payload.request_id)
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

  happened_at = normalize_happened_at(payload.happened_at)
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

  txn = CompanyTransaction(
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
    is_reversed=False,
  )
  session.add(txn)
  entries = post_company_transaction(session, txn)
  boundary = boundary_from_entries(entries)
  snapshot = snapshot_company_debts(session, up_to=txn.happened_at, boundary=boundary)
  txn.debt_cash = snapshot["debt_cash"]
  txn.debt_cylinders_12 = snapshot["debt_cylinders_12"]
  txn.debt_cylinders_48 = snapshot["debt_cylinders_48"]
  session.commit()
  session.refresh(txn)

  return CompanyCylinderSettleOut(
    id=txn.id,
    happened_at=txn.happened_at,
    gas_type=payload.gas_type,
    quantity=payload.quantity,
    direction=payload.direction,
    note=txn.note,
  )


@router.post("/payments", response_model=CompanyPaymentOut, status_code=status.HTTP_201_CREATED)
def create_company_payment(
  payload: CompanyPaymentCreate, session: Session = Depends(get_session)
) -> CompanyPaymentOut:
  if payload.amount == 0:
    raise HTTPException(status_code=400, detail="amount_must_be_nonzero")

  if payload.request_id:
    existing = session.exec(
      select(CompanyTransaction).where(CompanyTransaction.request_id == payload.request_id)
    ).first()
    if existing:
      return CompanyPaymentOut(
        id=existing.id,
        happened_at=existing.happened_at,
        amount=existing.paid,
        note=existing.note,
      )

  happened_at = (
    normalize_happened_at(payload.happened_at)
    if payload.happened_at
    else _parse_datetime(
      date_str=payload.date,
      time_str=payload.time,
      time_of_day=payload.time_of_day,
      at=payload.at,
    )
  ) or datetime.now(timezone.utc)

  txn = CompanyTransaction(
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="payment",
    total=0,
    paid=payload.amount,
    note=payload.note,
    request_id=payload.request_id,
    is_reversed=False,
  )
  session.add(txn)
  post_company_transaction(session, txn)
  session.commit()
  session.refresh(txn)

  return CompanyPaymentOut(
    id=txn.id,
    happened_at=txn.happened_at,
    amount=txn.paid,
    note=txn.note,
  )


@router.get("/payments", response_model=list[CompanyPaymentOut])
def list_company_payments(session: Session = Depends(get_session)) -> list[CompanyPaymentOut]:
  rows = session.exec(
    select(CompanyTransaction)
    .where(CompanyTransaction.kind == "payment")
    .where(CompanyTransaction.is_reversed == False)  # noqa: E712
    .order_by(CompanyTransaction.happened_at.desc())
  ).all()
  return [
    CompanyPaymentOut(
      id=row.id,
      happened_at=row.happened_at,
      amount=row.paid,
      note=row.note,
    )
    for row in rows
  ]


@router.post("/buy_iron", response_model=CompanyBuyIronOut, status_code=status.HTTP_201_CREATED)
def create_company_buy_iron(
  payload: CompanyBuyIronCreate, session: Session = Depends(get_session)
) -> CompanyBuyIronOut:
  if payload.new12 <= 0 and payload.new48 <= 0:
    raise HTTPException(status_code=400, detail="quantity_must_be_positive")

  if payload.request_id:
    existing = session.exec(
      select(CompanyTransaction).where(CompanyTransaction.request_id == payload.request_id)
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

  happened_at = (
    normalize_happened_at(payload.happened_at)
    if payload.happened_at
    else _parse_datetime(
      date_str=payload.date,
      time_str=payload.time,
      time_of_day=payload.time_of_day,
      at=payload.at,
    )
  ) or datetime.now(timezone.utc)

  txn = CompanyTransaction(
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="buy_iron",
    new12=payload.new12,
    new48=payload.new48,
    total=payload.total_cost,
    paid=payload.paid_now,
    note=payload.note,
    request_id=payload.request_id,
    is_reversed=False,
  )
  session.add(txn)
  post_company_transaction(session, txn)
  session.commit()
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
  payload: CompanyBalanceAdjustmentCreate, session: Session = Depends(get_session)
) -> CompanyBalanceAdjustmentOut:
  if payload.request_id:
    existing = session.exec(
      select(CompanyTransaction).where(CompanyTransaction.request_id == payload.request_id)
    ).first()
    if existing:
      return CompanyBalanceAdjustmentOut(
        id=existing.id,
        happened_at=existing.happened_at,
        money_balance=existing.total,
        cylinder_balance_12=existing.buy12,
        cylinder_balance_48=existing.buy48,
        note=existing.note,
      )

  current_money = sum_company_money(session)
  current_cyl_12 = sum_company_cylinders(session, gas_type="12kg")
  current_cyl_48 = sum_company_cylinders(session, gas_type="48kg")

  delta_money = payload.money_balance - current_money
  delta_cyl_12 = payload.cylinder_balance_12 - current_cyl_12
  delta_cyl_48 = payload.cylinder_balance_48 - current_cyl_48
  if delta_money == 0 and delta_cyl_12 == 0 and delta_cyl_48 == 0:
    raise HTTPException(status_code=400, detail="adjustment_required")

  happened_at = (
    normalize_happened_at(payload.happened_at)
    if payload.happened_at
    else _parse_datetime(
      date_str=payload.date,
      time_str=payload.time,
      time_of_day=payload.time_of_day,
      at=payload.at,
    )
  ) or datetime.now(timezone.utc)

  txn = CompanyTransaction(
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="adjust",
    buy12=delta_cyl_12,
    buy48=delta_cyl_48,
    total=delta_money,
    paid=0,
    note=payload.note,
    request_id=payload.request_id,
    is_reversed=False,
  )
  session.add(txn)
  post_company_transaction(session, txn)
  session.commit()
  session.refresh(txn)

  return CompanyBalanceAdjustmentOut(
    id=txn.id,
    happened_at=txn.happened_at,
    money_balance=payload.money_balance,
    cylinder_balance_12=payload.cylinder_balance_12,
    cylinder_balance_48=payload.cylinder_balance_48,
    note=txn.note,
  )


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

