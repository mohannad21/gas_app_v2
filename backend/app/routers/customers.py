from datetime import datetime, timezone

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.models import Customer, CustomerTransaction, LedgerEntry
from app.schemas import CustomerBalanceOut, CustomerCreate, CustomerOut, CustomerUpdate
from app.services.ledger import sum_customer_cylinders, sum_customer_money

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/customers", tags=["customers"])


def _customer_balances(session: Session) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
  money_rows = session.exec(
    select(LedgerEntry.customer_id, func.coalesce(func.sum(LedgerEntry.amount), 0))
    .where(LedgerEntry.account == "cust_money_debts")
    .group_by(LedgerEntry.customer_id)
  ).all()
  money_map = {row[0]: int(row[1] or 0) for row in money_rows if row[0]}

  cyl12_rows = session.exec(
    select(LedgerEntry.customer_id, func.coalesce(func.sum(LedgerEntry.amount), 0))
    .where(LedgerEntry.account == "cust_cylinders_debts")
    .where(LedgerEntry.gas_type == "12kg")
    .group_by(LedgerEntry.customer_id)
  ).all()
  cyl12_map = {row[0]: int(row[1] or 0) for row in cyl12_rows if row[0]}

  cyl48_rows = session.exec(
    select(LedgerEntry.customer_id, func.coalesce(func.sum(LedgerEntry.amount), 0))
    .where(LedgerEntry.account == "cust_cylinders_debts")
    .where(LedgerEntry.gas_type == "48kg")
    .group_by(LedgerEntry.customer_id)
  ).all()
  cyl48_map = {row[0]: int(row[1] or 0) for row in cyl48_rows if row[0]}

  return money_map, cyl12_map, cyl48_map


@router.get("", response_model=list[CustomerOut])
def list_customers(session: Session = Depends(get_session)) -> list[CustomerOut]:
  customers = session.exec(select(Customer).order_by(Customer.created_at.desc())).all()
  money_map, cyl12_map, cyl48_map = _customer_balances(session)
  order_counts = session.exec(
    select(CustomerTransaction.customer_id, func.count(CustomerTransaction.id))
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
    .group_by(CustomerTransaction.customer_id)
  ).all()
  count_map = {row[0]: int(row[1] or 0) for row in order_counts}

  output: list[CustomerOut] = []
  for customer in customers:
    output.append(
      CustomerOut(
        id=customer.id,
        name=customer.name,
        phone=customer.phone,
        address=customer.address,
        note=customer.note,
        created_at=customer.created_at,
        money_balance=money_map.get(customer.id, 0),
        cylinder_balance_12kg=cyl12_map.get(customer.id, 0),
        cylinder_balance_48kg=cyl48_map.get(customer.id, 0),
        order_count=count_map.get(customer.id, 0),
      )
    )
  logger.info("list_customers returned %d rows", len(output))
  return output


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: str, session: Session = Depends(get_session)) -> CustomerOut:
  customer = session.get(Customer, customer_id)
  if not customer:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
  money = sum_customer_money(session, customer_id=customer.id)
  cyl12 = sum_customer_cylinders(session, customer_id=customer.id, gas_type="12kg")
  cyl48 = sum_customer_cylinders(session, customer_id=customer.id, gas_type="48kg")
  order_count = session.exec(
    select(func.count(CustomerTransaction.id))
    .where(CustomerTransaction.customer_id == customer.id)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).first() or 0
  return CustomerOut(
    id=customer.id,
    name=customer.name,
    phone=customer.phone,
    address=customer.address,
    note=customer.note,
    created_at=customer.created_at,
    money_balance=int(money),
    cylinder_balance_12kg=int(cyl12),
    cylinder_balance_48kg=int(cyl48),
    order_count=int(order_count),
  )


@router.get("/{customer_id}/balances", response_model=CustomerBalanceOut)
def get_customer_balances(customer_id: str, session: Session = Depends(get_session)) -> CustomerBalanceOut:
  customer = session.get(Customer, customer_id)
  if not customer:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
  money = sum_customer_money(session, customer_id=customer.id)
  cyl12 = sum_customer_cylinders(session, customer_id=customer.id, gas_type="12kg")
  cyl48 = sum_customer_cylinders(session, customer_id=customer.id, gas_type="48kg")
  order_count = session.exec(
    select(func.count(CustomerTransaction.id))
    .where(CustomerTransaction.customer_id == customer.id)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).first() or 0
  return CustomerBalanceOut(
    customer_id=customer.id,
    money_balance=int(money),
    cylinder_balance_12kg=int(cyl12),
    cylinder_balance_48kg=int(cyl48),
    order_count=int(order_count),
  )


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, session: Session = Depends(get_session)) -> CustomerOut:
  logger.info("create_customer payload=%s", payload.model_dump())
  customer = Customer(
    name=payload.name,
    phone=payload.phone,
    address=payload.address,
    note=payload.note,
    created_at=datetime.now(timezone.utc),
  )
  session.add(customer)
  session.commit()
  session.refresh(customer)
  return CustomerOut(
    id=customer.id,
    name=customer.name,
    phone=customer.phone,
    address=customer.address,
    note=customer.note,
    created_at=customer.created_at,
    money_balance=0,
    cylinder_balance_12kg=0,
    cylinder_balance_48kg=0,
    order_count=0,
  )


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: str, payload: CustomerUpdate, session: Session = Depends(get_session)) -> CustomerOut:
  customer = session.get(Customer, customer_id)
  if not customer:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
  payload_data = payload.model_dump(exclude_unset=True)
  for field, value in payload_data.items():
    setattr(customer, field, value)
  session.add(customer)
  session.commit()
  session.refresh(customer)
  money = sum_customer_money(session, customer_id=customer.id)
  cyl12 = sum_customer_cylinders(session, customer_id=customer.id, gas_type="12kg")
  cyl48 = sum_customer_cylinders(session, customer_id=customer.id, gas_type="48kg")
  order_count = session.exec(
    select(func.count(CustomerTransaction.id))
    .where(CustomerTransaction.customer_id == customer.id)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).first() or 0
  return CustomerOut(
    id=customer.id,
    name=customer.name,
    phone=customer.phone,
    address=customer.address,
    note=customer.note,
    created_at=customer.created_at,
    money_balance=int(money),
    cylinder_balance_12kg=int(cyl12),
    cylinder_balance_48kg=int(cyl48),
    order_count=int(order_count),
  )


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: str, session: Session = Depends(get_session)) -> None:
  customer = session.get(Customer, customer_id)
  if not customer:
    return
  has_txn = session.exec(
    select(func.count(CustomerTransaction.id))
    .where(CustomerTransaction.customer_id == customer.id)
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).first()
  if has_txn and has_txn > 0:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="customer_has_transactions")
  session.delete(customer)
  session.commit()

