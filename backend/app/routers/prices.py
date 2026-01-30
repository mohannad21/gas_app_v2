from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import PriceCatalog
from app.schemas import PriceCreate, PriceOut

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("", response_model=list[PriceOut])
def list_prices(session: Session = Depends(get_session)) -> list[PriceOut]:
  rows = session.exec(select(PriceCatalog).order_by(PriceCatalog.effective_from.desc())).all()
  return [
    PriceOut(
      id=row.id,
      gas_type=row.gas_type,
      selling_price=row.sell_price,
      buying_price=row.buy_price,
      effective_from=row.effective_from,
      created_at=row.created_at,
    )
    for row in rows
  ]


@router.post("", response_model=PriceOut, status_code=status.HTTP_201_CREATED)
def create_price(payload: PriceCreate, session: Session = Depends(get_session)) -> PriceOut:
  effective_from = payload.effective_from or datetime.now(timezone.utc)
  row = PriceCatalog(
    gas_type=payload.gas_type,
    sell_price=payload.selling_price,
    buy_price=payload.buying_price,
    effective_from=effective_from,
    created_at=datetime.now(timezone.utc),
  )
  session.add(row)
  session.commit()
  session.refresh(row)
  return PriceOut(
    id=row.id,
    gas_type=row.gas_type,
    selling_price=row.sell_price,
    buying_price=row.buy_price,
    effective_from=row.effective_from,
    created_at=row.created_at,
  )
