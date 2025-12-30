from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import CashDailySummary, CashDelta
from app.schemas import BankDepositCreate, CashAdjustCreate, CashInitCreate, new_id
from app.services.cash import add_cash_delta, delete_cash_deltas_for_source, recompute_cash_summaries
from app.utils.time import business_date_from_utc, business_date_start_utc

router = APIRouter(prefix="/cash", tags=["cash"])


@router.post("/init", status_code=status.HTTP_201_CREATED)
def init_cash(payload: CashInitCreate, session: Session = Depends(get_session)) -> dict[str, object]:
  try:
    day = datetime.fromisoformat(payload.date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc

  day_start = business_date_start_utc(day)
  existing = session.exec(
    select(CashDelta)
    .where(CashDelta.source_type == "cash_init")
    .where(CashDelta.effective_at >= day_start)
    .where(CashDelta.effective_at < day_start + timedelta(days=1))
  ).first()
  if existing:
    raise HTTPException(status_code=400, detail="cash_init_exists")

  delta = add_cash_delta(
    session,
    effective_at=day_start,
    source_type="cash_init",
    source_id=None,
    delta_cash=payload.cash_start,
    reason=payload.reason,
  )
  session.commit()
  return {"id": delta.id, "effective_at": delta.effective_at, "cash_start": payload.cash_start}


@router.post("/adjust", status_code=status.HTTP_201_CREATED)
def adjust_cash(payload: CashAdjustCreate, session: Session = Depends(get_session)) -> dict[str, object]:
  if payload.date:
    try:
      day = datetime.fromisoformat(payload.date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
    effective_at = business_date_start_utc(day) + timedelta(hours=12)
  else:
    effective_at = datetime.now(timezone.utc)

  delta = add_cash_delta(
    session,
    effective_at=effective_at,
    source_type="cash_adjust",
    source_id=None,
    delta_cash=payload.delta_cash,
    reason=payload.reason,
  )
  session.commit()
  return {"id": delta.id, "effective_at": delta.effective_at, "delta_cash": payload.delta_cash}


@router.post("/bank_deposit", status_code=status.HTTP_201_CREATED)
def create_bank_deposit(payload: BankDepositCreate, session: Session = Depends(get_session)) -> dict[str, object]:
  try:
    day = datetime.fromisoformat(payload.date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  if payload.amount <= 0:
    raise HTTPException(status_code=400, detail="amount_must_be_positive")

  base = business_date_start_utc(day)
  if payload.time_of_day == "morning":
    effective_at = base + timedelta(hours=9)
  elif payload.time_of_day == "evening":
    effective_at = base + timedelta(hours=18)
  else:
    effective_at = base + timedelta(hours=12)

  deposit_id = new_id("bankdep_")
  delta = add_cash_delta(
    session,
    effective_at=effective_at,
    source_type="bank_deposit",
    source_id=deposit_id,
    delta_cash=-payload.amount,
    reason=payload.note,
  )
  session.commit()
  return {"id": deposit_id, "effective_at": delta.effective_at, "amount": payload.amount, "note": payload.note}


@router.delete("/bank_deposit/{deposit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bank_deposit(deposit_id: str, session: Session = Depends(get_session)) -> None:
  deleted_date = delete_cash_deltas_for_source(session, source_id=deposit_id, source_types=["bank_deposit"])
  if not deleted_date:
    raise HTTPException(status_code=404, detail="bank_deposit_not_found")
  end_date = business_date_from_utc(datetime.now(timezone.utc))
  recompute_cash_summaries(session, deleted_date, end_date)
  session.commit()


@router.get("/day")
def get_cash_day(date: str, session: Session = Depends(get_session)) -> dict[str, object]:
  try:
    day = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  start = business_date_start_utc(day)
  end = business_date_start_utc(day + timedelta(days=1))
  deltas = session.exec(
    select(CashDelta)
    .where(CashDelta.effective_at >= start)
    .where(CashDelta.effective_at < end)
    .order_by(CashDelta.effective_at, CashDelta.created_at, CashDelta.id)
  ).all()
  summary = session.exec(
    select(CashDailySummary).where(CashDailySummary.business_date == day)
  ).first()
  day_start = summary.cash_start if summary else 0.0
  day_end = summary.cash_end if summary else day_start
  return {
    "date": day.isoformat(),
    "cash_start": day_start,
    "cash_end": day_end,
    "events": [
      {
        "id": row.id,
        "effective_at": row.effective_at,
        "source_type": row.source_type,
        "source_id": row.source_id,
        "delta_cash": row.delta_cash,
        "reason": row.reason,
      }
      for row in deltas
    ],
  }


@router.get("/bank_deposits")
def list_bank_deposits(
  date: str = Query(...),
  session: Session = Depends(get_session),
) -> list[dict[str, object]]:
  try:
    day = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc

  start = business_date_start_utc(day)
  end = business_date_start_utc(day + timedelta(days=1))
  rows = session.exec(
    select(CashDelta)
    .where(CashDelta.source_type == "bank_deposit")
    .where(CashDelta.effective_at >= start)
    .where(CashDelta.effective_at < end)
    .order_by(CashDelta.effective_at, CashDelta.created_at, CashDelta.id)
  ).all()
  return [
    {
      "id": row.source_id or row.id,
      "effective_at": row.effective_at,
      "created_at": row.created_at,
      "amount": abs(row.delta_cash),
      "note": row.reason,
      "date": day.isoformat(),
    }
    for row in rows
  ]
