from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import func

from app.models import LedgerEntry


@dataclass(frozen=True)
class LedgerBoundary:
  happened_at: datetime
  created_at: datetime
  entry_id: str


def boundary_from_entries(entries: list[LedgerEntry]) -> Optional[LedgerBoundary]:
  if not entries:
    return None
  max_entry = max(entries, key=lambda entry: (entry.happened_at, entry.created_at, entry.id))
  return LedgerBoundary(
    happened_at=max_entry.happened_at,
    created_at=max_entry.created_at,
    entry_id=max_entry.id,
  )


def boundary_for_source(session: Session, *, source_type: str, source_id: str) -> Optional[LedgerBoundary]:
  row = session.exec(
    select(LedgerEntry)
    .where(LedgerEntry.source_type == source_type)
    .where(LedgerEntry.source_id == source_id)
    .order_by(LedgerEntry.happened_at.desc(), LedgerEntry.created_at.desc(), LedgerEntry.id.desc())
  ).first()
  if not row:
    return None
  return LedgerBoundary(happened_at=row.happened_at, created_at=row.created_at, entry_id=row.id)


def sum_ledger(
  session: Session,
  *,
  account: str,
  up_to: Optional[datetime] = None,
  boundary: Optional[LedgerBoundary] = None,
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
  if boundary is not None:
    boundary_up_to = boundary.happened_at
    up_to = boundary_up_to
    stmt = stmt.where(
      (LedgerEntry.happened_at < boundary_up_to)
      | (
        (LedgerEntry.happened_at == boundary_up_to)
        & (
          (LedgerEntry.created_at < boundary.created_at)
          | ((LedgerEntry.created_at == boundary.created_at) & (LedgerEntry.id <= boundary.entry_id))
        )
      )
    )
  elif up_to is not None:
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


def sum_company_money(
  session: Session,
  *,
  up_to: Optional[datetime] = None,
  boundary: Optional[LedgerBoundary] = None,
) -> int:
  return sum_ledger(
    session,
    account="company_money_debts",
    unit="money",
    up_to=up_to,
    boundary=boundary,
  )


def sum_company_cylinders(
  session: Session,
  *,
  gas_type: str,
  up_to: Optional[datetime] = None,
  boundary: Optional[LedgerBoundary] = None,
) -> int:
  return sum_ledger(
    session,
    account="company_cylinders_debts",
    gas_type=gas_type,
    unit="count",
    up_to=up_to,
    boundary=boundary,
  )


def snapshot_company_debts(
  session: Session,
  *,
  up_to: Optional[datetime] = None,
  boundary: Optional[LedgerBoundary] = None,
) -> dict[str, int]:
  return {
    "debt_cash": sum_company_money(session, up_to=up_to, boundary=boundary),
    "debt_cylinders_12": sum_company_cylinders(session, gas_type="12kg", up_to=up_to, boundary=boundary),
    "debt_cylinders_48": sum_company_cylinders(session, gas_type="48kg", up_to=up_to, boundary=boundary),
  }


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

