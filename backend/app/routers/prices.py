from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from app.auth import get_current_user, get_tenant_id, require_permission
from app.db import get_session
from app.models import PriceCatalog
from app.schemas import PriceCreate, PriceOut

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("", response_model=list[PriceOut])
def list_prices(
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> list[PriceOut]:
  rows = session.exec(
    select(PriceCatalog)
    .where(PriceCatalog.tenant_id == tenant_id)
    .order_by(PriceCatalog.effective_from.desc())
  ).all()
  return [
    PriceOut(
      id=row.id,
      gas_type=row.gas_type,
      selling_price=row.sell_price,
      buying_price=row.buy_price,
      selling_iron_price=row.sell_iron_price,
      buying_iron_price=row.buy_iron_price,
      company_iron_price=row.company_iron_price,
      effective_from=row.effective_from,
      created_at=row.created_at,
    )
    for row in rows
  ]


@router.post(
  "",
  response_model=PriceOut,
  status_code=status.HTTP_201_CREATED,
  dependencies=[Depends(require_permission("prices:write"))],
)
def create_price(
  payload: PriceCreate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
  user_id: Annotated[str, Depends(get_current_user)] = "",
) -> PriceOut:
  effective_from = payload.effective_from or datetime.now(timezone.utc)
  row = PriceCatalog(
    tenant_id=tenant_id,
    gas_type=payload.gas_type,
    sell_price=payload.selling_price,
    buy_price=payload.buying_price,
    sell_iron_price=payload.selling_iron_price,
    buy_iron_price=payload.buying_iron_price,
    company_iron_price=payload.company_iron_price,
    effective_from=effective_from,
    created_at=datetime.now(timezone.utc),
    created_by=user_id,
  )
  session.add(row)
  session.commit()
  session.refresh(row)
  return PriceOut(
    id=row.id,
    gas_type=row.gas_type,
    selling_price=row.sell_price,
    buying_price=row.buy_price,
    selling_iron_price=row.sell_iron_price,
    buying_iron_price=row.buy_iron_price,
    company_iron_price=row.company_iron_price,
    effective_from=row.effective_from,
    created_at=row.created_at,
  )
