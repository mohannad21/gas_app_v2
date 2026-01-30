from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import func

from app.models import LedgerEntry


def sum_ledger(
  session: Session,
  *,
  account: str,
  up_to: Optional[datetime] = None,
  day_from: Optional[date] = None,
  day_to: Optional[date] = None,
  gas_type: Optional[str] = None,
  state: Optional[str] = None,
  unit: Optional[str] = None,
  customer_id: Optional[str] = None,
) -> int:
  stmt = select(func.coalesce(func.sum(LedgerEntry.amount), 0))
  stmt = stmt.where(LedgerEntry.account == account)
  if gas_type is not None:
    stmt = stmt.where(LedgerEntry.gas_type == gas_type)
  if state is not None:
    stmt = stmt.where(LedgerEntry.state == state)
  if unit is not None:
    stmt = stmt.where(LedgerEntry.unit == unit)
  if customer_id is not None:
    stmt = stmt.where(LedgerEntry.customer_id == customer_id)
  if up_to is not None:
    stmt = stmt.where(LedgerEntry.happened_at <= up_to)
  if day_from is not None:
    stmt = stmt.where(LedgerEntry.day >= day_from)
  if day_to is not None:
    stmt = stmt.where(LedgerEntry.day <= day_to)
  result = session.exec(stmt).first()
  return int(result or 0)


def sum_inventory(
  session: Session,
  *,
  up_to: Optional[datetime] = None,
) -> dict[str, int]:
  out = {
    "full12": sum_ledger(session, account="inv", gas_type="12kg", state="full", unit="count", up_to=up_to),
    "empty12": sum_ledger(session, account="inv", gas_type="12kg", state="empty", unit="count", up_to=up_to),
    "full48": sum_ledger(session, account="inv", gas_type="48kg", state="full", unit="count", up_to=up_to),
    "empty48": sum_ledger(session, account="inv", gas_type="48kg", state="empty", unit="count", up_to=up_to),
  }
  return out


def sum_cash(session: Session, *, up_to: Optional[datetime] = None) -> int:
  return sum_ledger(session, account="cash", unit="money", up_to=up_to)


def sum_bank(session: Session, *, up_to: Optional[datetime] = None) -> int:
  return sum_ledger(session, account="bank", unit="money", up_to=up_to)


def sum_company_money(session: Session, *, up_to: Optional[datetime] = None) -> int:
  return sum_ledger(session, account="company_money_debts", unit="money", up_to=up_to)


def sum_company_cylinders(
  session: Session,
  *,
  gas_type: str,
  up_to: Optional[datetime] = None,
) -> int:
  return sum_ledger(
    session,
    account="company_cylinders_debts",
    gas_type=gas_type,
    unit="count",
    up_to=up_to,
  )


def sum_customer_money(session: Session, *, customer_id: str, up_to: Optional[datetime] = None) -> int:
  return sum_ledger(
    session,
    account="cust_money_debts",
    unit="money",
    customer_id=customer_id,
    up_to=up_to,
  )


def sum_customer_cylinders(
  session: Session,
  *,
  customer_id: str,
  gas_type: str,
  up_to: Optional[datetime] = None,
) -> int:
  return sum_ledger(
    session,
    account="cust_cylinders_debts",
    gas_type=gas_type,
    state="empty",
    unit="count",
    customer_id=customer_id,
    up_to=up_to,
  )
