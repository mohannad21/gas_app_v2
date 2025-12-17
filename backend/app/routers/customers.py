from datetime import datetime

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.events import add_activity
from app.models import Customer
from app.schemas import CustomerCreate, CustomerUpdate, new_id


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("")
def list_customers(session: Session = Depends(get_session)) -> list[Customer]:
  stmt = (
    select(Customer)
    .where(Customer.is_deleted == False)  # noqa: E712
    .order_by(Customer.created_at.desc())
  )
  customers = session.exec(stmt).all()
  logger.info("list_customers returned %d rows", len(customers))
  return customers


@router.get("/{customer_id}")
def get_customer(customer_id: str, session: Session = Depends(get_session)) -> Customer:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
  logger.info("get_customer id=%s deleted=%s", customer_id, customer.is_deleted)
  return customer


@router.post("", status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, session: Session = Depends(get_session)) -> Customer:
  logger.info("create_customer payload=%s", payload.dict())
  customer = Customer(
    id=new_id("c"),
    name=payload.name,
    phone=payload.phone,
    customer_type=payload.customer_type or "other",
    notes=payload.notes,
    created_at=datetime.utcnow(),
    is_deleted=False,
  )
  session.add(customer)
  add_activity(
    session,
    "customer",
    "created",
    f"Customer '{customer.name}' created (phone {customer.phone}, type {customer.customer_type})",
    customer.id,
    metadata=f"phone={customer.phone};type={customer.customer_type}",
  )
  session.commit()
  session.refresh(customer)
  return customer


@router.put("/{customer_id}")
def update_customer(customer_id: str, payload: CustomerUpdate, session: Session = Depends(get_session)) -> Customer:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
  logger.info("update_customer id=%s payload=%s", customer_id, payload.dict(exclude_unset=True))
  payload_data = payload.dict(exclude_unset=True)
  changes: list[str] = []
  for field, value in payload_data.items():
    old = getattr(customer, field)
    if old == value:
      continue
    changes.append(f"{field}: '{old}' -> '{value}'")
    setattr(customer, field, value)
  customer.updated_at = datetime.utcnow()
  description = (
    f"Customer '{customer.name}' updated: {', '.join(changes)}"
    if changes
    else f"Customer '{customer.name}' updated"
  )
  add_activity(
    session,
    "customer",
    "updated",
    description,
    customer.id,
    metadata=";".join(changes) if changes else None,
  )
  session.add(customer)
  session.commit()
  session.refresh(customer)
  return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: str, session: Session = Depends(get_session)) -> None:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    return
  logger.info("delete_customer id=%s", customer_id)
  customer.is_deleted = True
  customer.deleted_at = datetime.utcnow()
  session.add(customer)
  add_activity(
    session,
    "customer",
    "deleted",
    f"Customer '{customer.name}' deleted",
    customer.id,
  )
  session.commit()
