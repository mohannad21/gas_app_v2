from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.auth import get_tenant_id
from app.db import get_session
from app.models import Customer, CustomerTransaction, System
from app.schemas import SystemCreate, SystemOut, SystemUpdate

router = APIRouter(prefix="/systems", tags=["systems"])


def _next_security_check(last_check: date | None) -> date | None:
  if not last_check:
    return None
  try:
    return date(last_check.year + 5, last_check.month, last_check.day)
  except ValueError:
    # handle Feb 29 -> Feb 28 on non-leap years
    return date(last_check.year + 5, last_check.month, 28)


def _apply_security_fields(system: System, *, requires: bool, exists: bool, last_check: date | None) -> None:
  system.requires_security_check = requires
  system.security_check_exists = exists if requires else False
  system.last_security_check_at = last_check if requires and exists else None
  system.next_security_check_at = _next_security_check(system.last_security_check_at) if requires and exists else None


@router.get("", response_model=list[SystemOut])
def list_systems(
  customer_id: str | None = Query(default=None, alias="customerId"),
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> list[SystemOut]:
  stmt = select(System).where(System.tenant_id == tenant_id).order_by(System.created_at.desc())
  if customer_id:
    stmt = stmt.where(System.customer_id == customer_id)
  systems = session.exec(stmt).all()
  return [
    SystemOut(
      id=sys.id,
      customer_id=sys.customer_id,
      name=sys.name,
      gas_type=sys.gas_type,  # type: ignore[arg-type]
      note=sys.note,
      requires_security_check=sys.requires_security_check,
      security_check_exists=sys.security_check_exists,
      last_security_check_at=sys.last_security_check_at,
      next_security_check_at=sys.next_security_check_at,
      is_active=sys.is_active,
      created_at=sys.created_at,
    )
    for sys in systems
  ]


@router.post("", response_model=SystemOut, status_code=status.HTTP_201_CREATED)
def create_system(
  payload: SystemCreate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> SystemOut:
  customer = session.get(Customer, payload.customer_id)
  if not customer or customer.tenant_id != tenant_id:
    raise HTTPException(status_code=400, detail="Customer not found")
  system = System(
    tenant_id=tenant_id,
    customer_id=payload.customer_id,
    name=payload.name,
    gas_type=payload.gas_type,
    note=payload.note,
    is_active=payload.is_active,
    created_at=datetime.now(timezone.utc),
  )
  _apply_security_fields(
    system,
    requires=payload.requires_security_check,
    exists=payload.security_check_exists,
    last_check=payload.last_security_check_at,
  )
  session.add(system)
  session.commit()
  session.refresh(system)
  return SystemOut(
    id=system.id,
    customer_id=system.customer_id,
    name=system.name,
    gas_type=system.gas_type,  # type: ignore[arg-type]
    note=system.note,
    requires_security_check=system.requires_security_check,
    security_check_exists=system.security_check_exists,
    last_security_check_at=system.last_security_check_at,
    next_security_check_at=system.next_security_check_at,
    is_active=system.is_active,
    created_at=system.created_at,
  )


@router.put("/{system_id}", response_model=SystemOut)
def update_system(
  system_id: str,
  payload: SystemUpdate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> SystemOut:
  system = session.get(System, system_id)
  if not system:
    raise HTTPException(status_code=404, detail="System not found")
  if system.tenant_id != tenant_id:
    raise HTTPException(status_code=404, detail="System not found")
  if payload.customer_id:
    customer = session.get(Customer, payload.customer_id)
    if not customer or customer.tenant_id != tenant_id:
      raise HTTPException(status_code=400, detail="Customer not found")
  payload_data = payload.model_dump(exclude_unset=True)
  for field, value in payload_data.items():
    if field in {"requires_security_check", "security_check_exists", "last_security_check_at"}:
      continue
    setattr(system, field, value)
  if (
    "requires_security_check" in payload_data
    or "security_check_exists" in payload_data
    or "last_security_check_at" in payload_data
  ):
    _apply_security_fields(
      system,
      requires=payload_data.get("requires_security_check", system.requires_security_check),
      exists=payload_data.get("security_check_exists", system.security_check_exists),
      last_check=payload_data.get("last_security_check_at", system.last_security_check_at),
    )
  session.add(system)
  session.commit()
  session.refresh(system)
  return SystemOut(
    id=system.id,
    customer_id=system.customer_id,
    name=system.name,
    gas_type=system.gas_type,  # type: ignore[arg-type]
    note=system.note,
    requires_security_check=system.requires_security_check,
    security_check_exists=system.security_check_exists,
    last_security_check_at=system.last_security_check_at,
    next_security_check_at=system.next_security_check_at,
    is_active=system.is_active,
    created_at=system.created_at,
  )


@router.delete("/{system_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_system(
  system_id: str,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> None:
  system = session.get(System, system_id)
  if not system:
    return
  if system.tenant_id != tenant_id:
    raise HTTPException(status_code=404, detail="System not found")
  has_orders = session.exec(
    select(CustomerTransaction.id)
    .where(CustomerTransaction.system_id == system_id)
    .where(CustomerTransaction.tenant_id == tenant_id)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.deleted_at == None)  # noqa: E711
    .limit(1)
  ).first()
  if has_orders:
    raise HTTPException(
      status_code=status.HTTP_409_CONFLICT,
      detail="system_has_orders",
    )
  session.delete(system)
  session.commit()

