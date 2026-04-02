from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Expense, ExpenseCategory
from app.schemas import ExpenseCreateLegacy, ExpenseOutLegacy, ExpenseUpdate
from app.services.posting import derive_day, normalize_happened_at, post_expense, reverse_source
from app.utils.time import business_date_start_utc, business_tz

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


def _get_category_name(session: Session, category_id: Optional[str]) -> str:
  if not category_id:
    return "Other"
  cat = session.get(ExpenseCategory, category_id)
  return cat.name if cat else "Other"


@router.get("", response_model=list[ExpenseOutLegacy])
def list_expenses(
  date: str | None = Query(default=None),
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[ExpenseOutLegacy]:
  stmt = select(Expense).where(Expense.kind == "expense")
  if date:
    try:
      day = datetime.fromisoformat(date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
    stmt = stmt.where(Expense.day == day)
  if not include_deleted:
    stmt = stmt.where(Expense.is_reversed == False)  # noqa: E712
  if before:
    try:
      cursor_dt = datetime.fromisoformat(before)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid before date format") from exc
    stmt = stmt.where(Expense.happened_at < cursor_dt)
  stmt = stmt.order_by(Expense.happened_at.desc()).limit(limit)
  rows = session.exec(stmt).all()
  # exclude cash adjustments
  cash_cat = session.exec(select(ExpenseCategory).where(ExpenseCategory.name == "Cash Adjustment")).first()
  if cash_cat:
    rows = [row for row in rows if row.category_id != cash_cat.id]
  cats = {cat.id: cat.name for cat in session.exec(select(ExpenseCategory)).all()}
  return [
    ExpenseOutLegacy(
      id=row.id,
      date=row.day.isoformat(),
      happened_at=row.happened_at,
      expense_type=cats.get(row.category_id, "Other"),
      amount=row.amount,
      note=row.note,
      created_at=row.created_at,
      created_by=None,
      is_deleted=row.is_reversed,
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
    happened_at=expense.happened_at,
    expense_type=payload.expense_type,
    amount=expense.amount,
    note=expense.note,
    created_at=expense.created_at,
    created_by=None,
  )


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
  expense_id: str,
  session: Session = Depends(get_session),
) -> None:
  expense = session.get(Expense, expense_id)
  if not expense:
    raise HTTPException(status_code=404, detail="expense_not_found")
  if expense.kind != "expense":
    raise HTTPException(status_code=404, detail="expense_not_found")
  if expense.is_reversed:
    return
  reversal_happened_at = expense.happened_at
  reversal_day = expense.day
  reversal = Expense(
    request_id=None,
    happened_at=reversal_happened_at,
    day=reversal_day,
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


@router.patch("/{expense_id}", response_model=ExpenseOutLegacy)
def update_expense(
  expense_id: str,
  payload: ExpenseUpdate,
  session: Session = Depends(get_session),
) -> ExpenseOutLegacy:
  expense = session.get(Expense, expense_id)
  if not expense or expense.kind != "expense" or expense.is_reversed:
    raise HTTPException(status_code=404, detail="expense_not_found")

  new_date_str = payload.date or expense.day.isoformat()
  new_expense_type = payload.expense_type or _get_category_name(session, expense.category_id)
  new_amount = payload.amount if payload.amount is not None else expense.amount
  new_note = payload.note if payload.note is not None else expense.note
  new_happened_at = payload.happened_at or expense.happened_at

  if new_amount <= 0:
    raise HTTPException(status_code=400, detail="amount_must_be_positive")

  try:
    new_day = datetime.fromisoformat(new_date_str).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc

  reversal = Expense(
    request_id=None,
    happened_at=expense.happened_at,
    day=expense.day,
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

  new_category = _get_category(session, new_expense_type)
  if payload.happened_at is not None:
    normalized_happened_at = normalize_happened_at(new_happened_at)
  else:
    existing_local = normalize_happened_at(expense.happened_at).astimezone(business_tz())
    replacement_local = datetime.combine(new_day, existing_local.timetz().replace(tzinfo=None))
    normalized_happened_at = normalize_happened_at(replacement_local)
  new_expense = Expense(
    request_id=None,
    happened_at=normalized_happened_at,
    day=derive_day(normalized_happened_at),
    kind="expense",
    category_id=new_category.id,
    amount=new_amount,
    paid_from="cash",
    note=new_note,
    vendor=None,
    is_reversed=False,
  )
  session.add(new_expense)
  post_expense(session, new_expense)
  session.commit()
  session.refresh(new_expense)

  cats = {cat.id: cat.name for cat in session.exec(select(ExpenseCategory)).all()}
  return ExpenseOutLegacy(
    id=new_expense.id,
    date=new_expense.day.isoformat(),
    happened_at=new_expense.happened_at,
    expense_type=cats.get(new_expense.category_id, "Other"),
    amount=new_expense.amount,
    note=new_expense.note,
    created_at=new_expense.created_at,
    created_by=None,
  )

