from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import CompanyTransaction
from app.schemas import CompanyCylinderSettleCreate, CompanyCylinderSettleOut
from app.services.posting import derive_day, normalize_happened_at, post_company_transaction

router = APIRouter(prefix="/company", tags=["company"])


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
  post_company_transaction(session, txn)
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
