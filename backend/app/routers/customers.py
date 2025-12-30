from datetime import datetime, timezone

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.events import add_activity
from app.models import Customer, CustomerAdjustment
from app.services.customers import sync_customer_totals
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


@router.get("/{customer_id}/adjustments")
def list_customer_adjustments(customer_id: str, session: Session = Depends(get_session)) -> list[CustomerAdjustment]:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
  stmt = select(CustomerAdjustment).where(CustomerAdjustment.customer_id == customer_id)
  return session.exec(stmt).all()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, session: Session = Depends(get_session)) -> Customer:
  print("[CREATE CUSTOMER] entered")
  print("[CREATE CUSTOMER] payload:", payload.model_dump())
  logger.info("create_customer payload=%s", payload.model_dump())
  customer = Customer(
    id=new_id("c"),
    name=payload.name,
    phone=payload.phone,
    customer_type=payload.customer_type or "other",
    notes=payload.notes,
    created_at=datetime.now(timezone.utc),
    is_deleted=False,
  )
  session.add(customer)
  starting_money = payload.starting_money if payload.starting_money is not None else 0.0
  starting_12kg = payload.starting_12kg if payload.starting_12kg is not None else 0
  starting_48kg = payload.starting_48kg if payload.starting_48kg is not None else 0
  has_adjustment = any(value != 0 for value in (starting_money, starting_12kg, starting_48kg))
  if has_adjustment:
    adjustment = CustomerAdjustment(
      id=new_id("adj"),
      customer_id=customer.id,
      amount_money=starting_money,
      count_12kg=starting_12kg,
      count_48kg=starting_48kg,
      reason=payload.starting_reason or "onboarding",
      created_at=datetime.now(timezone.utc),
    )
    session.add(adjustment)
  sync_customer_totals(session, customer.id)
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
  print("[CREATE CUSTOMER] exiting")
  return customer


@router.put("/{customer_id}")
def update_customer(customer_id: str, payload: CustomerUpdate, session: Session = Depends(get_session)) -> Customer:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
  logger.info("update_customer id=%s payload=%s", customer_id, payload.model_dump(exclude_unset=True))
  payload_data = payload.model_dump(exclude_unset=True)
  changes: list[str] = []
  for field, value in payload_data.items():
    old = getattr(customer, field)
    if old == value:
      continue
    changes.append(f"{field}: '{old}' -> '{value}'")
    setattr(customer, field, value)
  customer.updated_at = datetime.now(timezone.utc)
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
  customer.deleted_at = datetime.now(timezone.utc)
  session.add(customer)
  add_activity(
    session,
    "customer",
    "deleted",
    f"Customer '{customer.name}' deleted",
    customer.id,
  )
  session.commit()
