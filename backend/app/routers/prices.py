from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from app.db import get_session
from app.events import add_activity
from app.models import PriceSetting
from app.schemas import PriceCreate, new_id


router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("")
def list_prices(session: Session = Depends(get_session)) -> list[PriceSetting]:
  stmt = select(PriceSetting).order_by(PriceSetting.effective_from.desc())
  return session.exec(stmt).all()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_price(payload: PriceCreate, session: Session = Depends(get_session)) -> PriceSetting:
  setting = PriceSetting(
    id=new_id("p"),
    gas_type=payload.gas_type,
    customer_type=payload.customer_type,
    selling_price=payload.selling_price,
    buying_price=payload.buying_price,
    effective_from=payload.effective_from or datetime.now(timezone.utc),
    created_at=datetime.now(timezone.utc),
  )
  session.add(setting)
  add_activity(
    session,
    "price",
    "created",
    f"Price {payload.gas_type} {payload.customer_type} set to sell {payload.selling_price}"
    + (f" buy {payload.buying_price}" if payload.buying_price else ""),
    setting.id,
    metadata=f"selling={payload.selling_price};buying={payload.buying_price or 0};effective={payload.effective_from or datetime.now(timezone.utc).isoformat()}",
  )
  session.commit()
  session.refresh(setting)
  return setting
