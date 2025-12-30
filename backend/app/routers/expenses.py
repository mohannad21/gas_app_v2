from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Expense
from app.schemas import ExpenseCreate, new_id
from app.services.cash import add_cash_delta, delete_cash_deltas_for_source, recompute_cash_summaries
from app.utils.time import business_date_from_utc


router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("")
def list_expenses(date: Optional[str] = Query(default=None), session: Session = Depends(get_session)) -> list[Expense]:
  stmt = select(Expense)
  if date:
    stmt = stmt.where(Expense.date == date)
  return session.exec(stmt).all()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseCreate, session: Session = Depends(get_session)) -> Expense:
  stmt = (
    select(Expense)
    .where(Expense.date == payload.date)
    .where(Expense.expense_type == payload.expense_type)
  )
  existing = session.exec(stmt).first()
  if existing:
    deleted_date = delete_cash_deltas_for_source(session, source_id=existing.id)
    existing.amount = payload.amount
    existing.note = payload.note
    if payload.created_by and not existing.created_by:
      existing.created_by = payload.created_by
    session.add(existing)
    add_cash_delta(
      session,
      effective_at=existing.created_at,
      source_type="expense",
      source_id=existing.id,
      delta_cash=-payload.amount,
      reason=existing.expense_type,
    )
    if deleted_date:
      start = min(deleted_date, business_date_from_utc(existing.created_at))
      end = business_date_from_utc(datetime.now(timezone.utc))
      recompute_cash_summaries(session, start, end)
    session.commit()
    session.refresh(existing)
    return existing

  expense = Expense(
    id=new_id("e"),
    date=payload.date,
    expense_type=payload.expense_type,
    amount=payload.amount,
    note=payload.note,
    created_at=datetime.now(timezone.utc),
    created_by=payload.created_by,
  )
  session.add(expense)
  add_cash_delta(
    session,
    effective_at=expense.created_at,
    source_type="expense",
    source_id=expense.id,
    delta_cash=-expense.amount,
    reason=expense.expense_type,
  )
  session.commit()
  session.refresh(expense)
  return expense


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
  date: str = Query(...),
  expense_type: str = Query(...),
  session: Session = Depends(get_session),
) -> None:
  stmt = (
    select(Expense)
    .where(Expense.date == date)
    .where(Expense.expense_type == expense_type)
  )
  existing = session.exec(stmt).first()
  if not existing:
    return
  deleted_date = delete_cash_deltas_for_source(session, source_id=existing.id)
  session.delete(existing)
  if deleted_date:
    end = business_date_from_utc(datetime.now(timezone.utc))
    recompute_cash_summaries(session, deleted_date, end)
  session.commit()
