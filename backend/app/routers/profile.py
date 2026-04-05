"""Tenant business profile endpoints."""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.auth import get_tenant_id
from app.db import get_session
from app.models import Tenant
from app.schemas import TenantProfileOut, TenantProfileUpdate


router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=TenantProfileOut)
def get_profile(
  tenant_id: Annotated[str, Depends(get_tenant_id)],
  session: Session = Depends(get_session),
) -> TenantProfileOut:
  tenant = session.get(Tenant, tenant_id)
  return TenantProfileOut(
    id=tenant.id,
    name=tenant.name,
    business_name=tenant.business_name,
    owner_name=tenant.owner_name,
    phone=tenant.phone,
    address=tenant.address,
  )


@router.patch("", response_model=TenantProfileOut)
def update_profile(
  payload: TenantProfileUpdate,
  tenant_id: Annotated[str, Depends(get_tenant_id)],
  session: Session = Depends(get_session),
) -> TenantProfileOut:
  tenant = session.get(Tenant, tenant_id)
  data = payload.model_dump(exclude_unset=True)
  for field, value in data.items():
    setattr(tenant, field, value)
  tenant.updated_at = datetime.now(timezone.utc)
  session.add(tenant)
  session.commit()
  session.refresh(tenant)
  return TenantProfileOut(
    id=tenant.id,
    name=tenant.name,
    business_name=tenant.business_name,
    owner_name=tenant.owner_name,
    phone=tenant.phone,
    address=tenant.address,
  )
