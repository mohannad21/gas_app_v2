from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Expense, ExpenseCategory
from app.schemas import BankDepositCreate, BankDepositOut, CashAdjustCreate, CashAdjustUpdate, CashAdjustmentRow
from app.services.posting import derive_day, normalize_happened_at, post_expense, reverse_source

router = APIRouter(prefix="/cash", tags=["cash"])


def _get_cash_adjust_category(session: Session) -> ExpenseCategory:
  existing = session.exec(
    select(ExpenseCategory).where(ExpenseCategory.name == "Cash Adjustment")
  ).first()
  if existing:
    return existing
  category = ExpenseCategory(name="Cash Adjustment")
  session.add(category)
  session.commit()
  session.refresh(category)
  return category


@router.get("/adjustments", response_model=list[CashAdjustmentRow])
def list_cash_adjustments(
  date: str,
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[CashAdjustmentRow]:
  try:
    day = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  category = _get_cash_adjust_category(session)
  stmt = select(Expense).where(Expense.day == day).where(Expense.category_id == category.id)
  if not include_deleted:
    stmt = stmt.where(Expense.is_reversed == False)  # noqa: E712
  rows = session.exec(stmt.order_by(Expense.happened_at.desc())).all()
  return [
    CashAdjustmentRow(
      id=row.id,
      delta_cash=row.amount,
      reason=row.note,
      effective_at=row.happened_at,
      created_at=row.happened_at,
      is_deleted=row.is_reversed,
    )
    for row in rows
  ]


@router.post("/adjust", response_model=CashAdjustmentRow, status_code=status.HTTP_201_CREATED)
def create_cash_adjustment(payload: CashAdjustCreate, session: Session = Depends(get_session)) -> CashAdjustmentRow:
  if payload.delta_cash == 0:
    raise HTTPException(status_code=400, detail="delta_cash_required")
  if payload.request_id:
    existing = session.exec(select(Expense).where(Expense.request_id == payload.request_id)).first()
    if existing:
      return CashAdjustmentRow(
        id=existing.id,
        delta_cash=existing.amount,
        reason=existing.note,
        effective_at=existing.happened_at,
        created_at=existing.happened_at,
        is_deleted=existing.is_reversed,
      )
  category = _get_cash_adjust_category(session)
  happened_at = normalize_happened_at(payload.happened_at)
  expense = Expense(
    request_id=payload.request_id,
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="expense",
    category_id=category.id,
    amount=payload.delta_cash,
    paid_from="cash",
    note=payload.reason,
    vendor=None,
    is_reversed=False,
  )
  session.add(expense)
  post_expense(session, expense)
  session.commit()
  session.refresh(expense)
  return CashAdjustmentRow(
    id=expense.id,
    delta_cash=expense.amount,
    reason=expense.note,
    effective_at=expense.happened_at,
    created_at=expense.happened_at,
    is_deleted=False,
  )


@router.put("/adjust/{adjust_id}", response_model=CashAdjustmentRow)
def update_cash_adjustment(
  adjust_id: str,
  payload: CashAdjustUpdate,
  session: Session = Depends(get_session),
) -> CashAdjustmentRow:
  existing = session.get(Expense, adjust_id)
  if not existing or existing.is_reversed:
    raise HTTPException(status_code=404, detail="Adjustment not found")

  now = datetime.now(timezone.utc)
  reversal = Expense(
    request_id=None,
    happened_at=now,
    day=derive_day(now),
    kind="expense",
    category_id=existing.category_id,
    amount=existing.amount,
    paid_from=existing.paid_from,
    note=f"Reversal of {existing.id}",
    vendor=None,
    reversed_id=existing.id,
    is_reversed=True,
  )
  session.add(reversal)
  reverse_source(
    session,
    source_type="expense",
    source_id=existing.id,
    reversal_source_type="expense",
    reversal_source_id=reversal.id,
    happened_at=reversal.happened_at,
    day=reversal.day,
    note=reversal.note,
  )
  existing.is_reversed = True
  session.add(existing)

  new_amount = payload.delta_cash if payload.delta_cash is not None else existing.amount
  new_note = payload.reason if payload.reason is not None else existing.note
  new_expense = Expense(
    request_id=None,
    happened_at=now,
    day=derive_day(now),
    kind="expense",
    category_id=existing.category_id,
    amount=new_amount,
    paid_from=existing.paid_from,
    note=new_note,
    vendor=None,
    is_reversed=False,
  )
  session.add(new_expense)
  post_expense(session, new_expense)
  session.commit()
  session.refresh(new_expense)
  return CashAdjustmentRow(
    id=new_expense.id,
    delta_cash=new_expense.amount,
    reason=new_expense.note,
    effective_at=new_expense.happened_at,
    created_at=new_expense.happened_at,
    is_deleted=False,
  )


@router.delete("/adjust/{adjust_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cash_adjustment(adjust_id: str, session: Session = Depends(get_session)) -> None:
  existing = session.get(Expense, adjust_id)
  if not existing or existing.is_reversed:
    return
  now = datetime.now(timezone.utc)
  reversal = Expense(
    request_id=None,
    happened_at=now,
    day=derive_day(now),
    kind=existing.kind,
    category_id=existing.category_id,
    amount=existing.amount,
    paid_from=existing.paid_from,
    note=f"Reversal of {existing.id}",
    vendor=None,
    reversed_id=existing.id,
    is_reversed=True,
  )
  session.add(reversal)
  reverse_source(
    session,
    source_type="expense",
    source_id=existing.id,
    reversal_source_type="expense",
    reversal_source_id=reversal.id,
    happened_at=reversal.happened_at,
    day=reversal.day,
    note=reversal.note,
  )
  existing.is_reversed = True
  session.add(existing)
  session.commit()


@router.get("/bank_deposits", response_model=list[BankDepositOut])
def list_bank_deposits(
  date: str,
  session: Session = Depends(get_session),
) -> list[BankDepositOut]:
  try:
    day = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  rows = session.exec(
    select(Expense)
    .where(Expense.day == day)
    .where(Expense.kind == "deposit")
    .where(Expense.is_reversed == False)  # noqa: E712
    .order_by(Expense.happened_at.desc())
  ).all()
  return [
    BankDepositOut(
      id=row.id,
      happened_at=row.happened_at,
      amount=row.amount,
      note=row.note,
    )
    for row in rows
  ]


@router.post("/bank_deposit", response_model=BankDepositOut, status_code=status.HTTP_201_CREATED)
def create_bank_deposit(payload: BankDepositCreate, session: Session = Depends(get_session)) -> BankDepositOut:
  if payload.amount <= 0:
    raise HTTPException(status_code=400, detail="amount_must_be_positive")
  if payload.request_id:
    existing = session.exec(select(Expense).where(Expense.request_id == payload.request_id)).first()
    if existing:
      return BankDepositOut(
        id=existing.id,
        happened_at=existing.happened_at,
        amount=existing.amount,
        note=existing.note,
      )
  happened_at = normalize_happened_at(payload.happened_at)
  expense = Expense(
    request_id=payload.request_id,
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="deposit",
    category_id=None,
    amount=payload.amount,
    paid_from=None,
    note=payload.note,
    vendor=None,
    is_reversed=False,
  )
  session.add(expense)
  post_expense(session, expense)
  session.commit()
  session.refresh(expense)
  return BankDepositOut(
    id=expense.id,
    happened_at=expense.happened_at,
    amount=expense.amount,
    note=expense.note,
  )


@router.delete("/bank_deposit/{deposit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bank_deposit(deposit_id: str, session: Session = Depends(get_session)) -> None:
  existing = session.get(Expense, deposit_id)
  if not existing or existing.is_reversed:
    return
  now = datetime.now(timezone.utc)
  reversal = Expense(
    request_id=None,
    happened_at=now,
    day=derive_day(now),
    kind=existing.kind,
    category_id=existing.category_id,
    amount=existing.amount,
    paid_from=existing.paid_from,
    note=f"Reversal of {existing.id}",
    vendor=None,
    reversed_id=existing.id,
    is_reversed=True,
  )
  session.add(reversal)
  reverse_source(
    session,
    source_type="expense",
    source_id=existing.id,
    reversal_source_type="expense",
    reversal_source_id=reversal.id,
    happened_at=reversal.happened_at,
    day=reversal.day,
    note=reversal.note,
  )
  existing.is_reversed = True
  session.add(existing)
  session.commit()
