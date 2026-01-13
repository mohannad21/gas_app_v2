from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db import get_session
from app.models import CompanyPayment
from app.schemas import CompanyPaymentCreate, new_id
from app.services.cash import add_cash_delta
from app.services.company import add_company_delta
from app.utils.time import business_date_start_utc

router = APIRouter(prefix="/company", tags=["company"])


@router.post("/payments", status_code=status.HTTP_201_CREATED)
def create_company_payment(payload: CompanyPaymentCreate, session: Session = Depends(get_session)) -> dict[str, object]:
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

  payment_id = new_id("compay_")
  payment = CompanyPayment(
    id=payment_id,
    business_date=day,
    time_of_day=payload.time_of_day,
    effective_at=effective_at,
    amount=payload.amount,
    note=payload.note,
    created_at=datetime.utcnow(),
    is_deleted=False,
  )
  add_cash_delta(
    session,
    effective_at=effective_at,
    source_type="company_payment",
    source_id=payment_id,
    delta_cash=-payload.amount,
    reason=payload.note,
  )
  add_company_delta(
    session,
    effective_at=effective_at,
    source_type="company_payment",
    source_id=payment_id,
    delta_payable=-payload.amount,
    reason=payload.note,
  )
  session.add(payment)
  session.commit()
  # TODO: if payment edits/deletes are introduced, delete cash/company deltas and recompute forward.
  return {"id": payment_id, "effective_at": effective_at, "amount": payload.amount}
