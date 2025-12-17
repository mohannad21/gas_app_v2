from datetime import datetime
from typing import Optional

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.events import add_activity
from app.models import Customer, System
from app.schemas import SystemCreate, SystemUpdate, new_id


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/systems", tags=["systems"])


@router.get("")
def list_systems(customerId: Optional[str] = Query(default=None), session: Session = Depends(get_session)) -> list[System]:
  stmt = select(System).where(System.is_deleted == False)  # noqa: E712
  if customerId:
    stmt = stmt.where(System.customer_id == customerId)
  systems = session.exec(stmt).all()
  logger.info("list_systems customerId=%s returned=%d", customerId, len(systems))
  return systems


@router.post("", status_code=status.HTTP_201_CREATED)
def create_system(payload: SystemCreate, session: Session = Depends(get_session)) -> System:
  logger.info("create_system payload=%s", payload.dict())
  customer = session.get(Customer, payload.customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
  system = System(
    id=new_id("s"),
    customer_id=payload.customer_id,
    name=payload.name,
    location=payload.location,
    system_type=payload.system_type or "other",
    gas_type=payload.gas_type,
    system_customer_type=payload.system_customer_type,
    security_required=payload.security_required,
    last_security_check_at=payload.last_security_check_at,
    next_security_due_at=payload.next_security_due_at,
    security_status=payload.security_status,
    created_at=datetime.utcnow(),
    is_deleted=False,
    is_active=payload.is_active,
    require_security_check=payload.require_security_check,
    security_check_exists=payload.security_check_exists,
    security_check_date=payload.security_check_date,
  )
  session.add(system)
  add_activity(
    session,
    "system",
    "created",
    f"System '{system.name}' created for customer {customer.name} with gas {system.gas_type}",
    system.id,
    metadata=f"gas={system.gas_type};type={system.system_type}",
  )
  session.commit()
  session.refresh(system)
  return system


@router.put("/{system_id}")
def update_system(system_id: str, payload: SystemUpdate, session: Session = Depends(get_session)) -> System:
  logger.info("update_system id=%s payload=%s", system_id, payload.dict(exclude_unset=True))
  system = session.get(System, system_id)
  if not system or system.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
  payload_data = payload.dict(exclude_unset=True)
  changes: list[str] = []
  if payload_data.get("customer_id"):
    customer = session.get(Customer, payload_data["customer_id"])
    if not customer or customer.is_deleted:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
    if system.customer_id != payload_data["customer_id"]:
      changes.append(f"customer_id: '{system.customer_id}' -> '{payload_data['customer_id']}'")
      system.customer_id = payload_data["customer_id"]
  for field, value in payload_data.items():
    if field == "customer_id":
      continue
    old = getattr(system, field)
    if old == value:
      continue
    changes.append(f"{field}: '{old}' -> '{value}'")
    setattr(system, field, value)
  system.updated_at = datetime.utcnow()
  description = (
    f"System '{system.name}' updated: {', '.join(changes)}"
    if changes
    else f"System '{system.name}' updated"
  )
  add_activity(
    session,
    "system",
    "updated",
    description,
    system.id,
    metadata=";".join(changes) if changes else None,
  )
  session.add(system)
  session.commit()
  session.refresh(system)
  return system


@router.delete("/{system_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_system(system_id: str, session: Session = Depends(get_session)) -> None:
  logger.info("delete_system id=%s", system_id)
  system = session.get(System, system_id)
  if not system or system.is_deleted:
    return
  system.is_deleted = True
  system.deleted_at = datetime.utcnow()
  session.add(system)
  add_activity(
    session,
    "system",
    "deleted",
    f"System '{system.name}' deleted",
    system.id,
  )
  session.commit()
