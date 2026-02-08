from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Expense, ExpenseCategory
from app.schemas import ExpenseCreateLegacy, ExpenseOutLegacy
from app.services.posting import derive_day, normalize_happened_at, post_expense, reverse_source
from app.utils.time import business_date_start_utc

router = APIRouter(prefix="/expenses", tags=["expenses"])


def _get_category(session: Session, name: str) -> ExpenseCategory:
  existing = session.exec(select(ExpenseCategory).where(ExpenseCategory.name == name)).first()
  if existing:
    return existing
  category = ExpenseCategory(name=name)
  session.add(category)
  session.commit()
  session.refresh(category)
  return category


@router.get("", response_model=list[ExpenseOutLegacy])
def list_expenses(
  date: str | None = Query(default=None),
  session: Session = Depends(get_session),
) -> list[ExpenseOutLegacy]:
  stmt = select(Expense).where(Expense.kind == "expense")
  if date:
    try:
      day = datetime.fromisoformat(date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
    stmt = stmt.where(Expense.day == day)
  rows = session.exec(stmt.where(Expense.is_reversed == False)).all()  # noqa: E712
  # exclude cash adjustments
  cash_cat = session.exec(select(ExpenseCategory).where(ExpenseCategory.name == "Cash Adjustment")).first()
  if cash_cat:
    rows = [row for row in rows if row.category_id != cash_cat.id]
  cats = {cat.id: cat.name for cat in session.exec(select(ExpenseCategory)).all()}
  return [
    ExpenseOutLegacy(
      id=row.id,
      date=row.day.isoformat(),
      expense_type=cats.get(row.category_id, "Other"),
      amount=row.amount,
      note=row.note,
      created_at=row.created_at,
      created_by=None,
    )
    for row in rows
  ]


@router.post("", response_model=ExpenseOutLegacy, status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseCreateLegacy, session: Session = Depends(get_session)) -> ExpenseOutLegacy:
  try:
    day = datetime.fromisoformat(payload.date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  if payload.amount <= 0:
    raise HTTPException(status_code=400, detail="amount_must_be_positive")
  category = _get_category(session, payload.expense_type)
  base = business_date_start_utc(day) + timedelta(hours=12)
  happened_at = normalize_happened_at(payload.happened_at or base.replace(tzinfo=timezone.utc))
  expense = Expense(
    request_id=payload.request_id,
    happened_at=happened_at,
    day=derive_day(happened_at),
    kind="expense",
    category_id=category.id,
    amount=payload.amount,
    paid_from="cash",
    note=payload.note,
    vendor=None,
    is_reversed=False,
  )
  session.add(expense)
  post_expense(session, expense)
  session.commit()
  session.refresh(expense)
  return ExpenseOutLegacy(
    id=expense.id,
    date=expense.day.isoformat(),
    expense_type=payload.expense_type,
    amount=expense.amount,
    note=expense.note,
    created_at=expense.created_at,
    created_by=None,
  )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
  date: str = Query(...),
  expense_type: str = Query(...),
  session: Session = Depends(get_session),
) -> None:
  try:
    day = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  category = session.exec(select(ExpenseCategory).where(ExpenseCategory.name == expense_type)).first()
  if not category:
    return
  expense = session.exec(
    select(Expense)
    .where(Expense.day == day)
    .where(Expense.category_id == category.id)
    .where(Expense.is_reversed == False)  # noqa: E712
  ).first()
  if not expense:
    return
  now = datetime.now(timezone.utc)
  reversal = Expense(
    request_id=None,
    happened_at=now,
    day=derive_day(now),
    kind=expense.kind,
    category_id=expense.category_id,
    amount=expense.amount,
    paid_from=expense.paid_from,
    note=f"Reversal of {expense.id}",
    vendor=None,
    reversed_id=expense.id,
    is_reversed=True,
  )
  session.add(reversal)
  reverse_source(
    session,
    source_type="expense",
    source_id=expense.id,
    reversal_source_type="expense",
    reversal_source_id=reversal.id,
    happened_at=reversal.happened_at,
    day=reversal.day,
    note=reversal.note,
  )
  expense.is_reversed = True
  session.add(expense)
  session.commit()
