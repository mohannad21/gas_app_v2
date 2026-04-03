from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.config import DEFAULT_TENANT_ID
from app.models import (
  CompanyTransaction,
  CashAdjustment,
  CustomerTransaction,
  Expense,
  InventoryAdjustment,
  LedgerEntry,
)
from app.utils.time import business_date_from_utc, business_date_start_utc, business_tz, to_utc_naive


@dataclass(frozen=True)
class LedgerLine:
  account: str
  amount: int
  unit: str
  gas_type: Optional[str] = None
  state: Optional[str] = None
  customer_id: Optional[str] = None
  note: Optional[str] = None


ACCOUNT_CASH = "cash"
ACCOUNT_BANK = "bank"
ACCOUNT_INV = "inv"
ACCOUNT_CUST_MONEY = "cust_money_debts"
ACCOUNT_CUST_CYL = "cust_cylinders_debts"
ACCOUNT_COMPANY_MONEY = "company_money_debts"
ACCOUNT_COMPANY_CYL = "company_cylinders_debts"
ACCOUNT_EXPENSE = "expense"
ACCOUNT_CASH_ADJUST = "cash_adjustments"

UNIT_MONEY = "money"
UNIT_COUNT = "count"


def normalize_happened_at(value: Optional[datetime]) -> datetime:
  if value is None:
    return datetime.now(timezone.utc)
  if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
    local = value.replace(tzinfo=business_tz())
    return local.astimezone(timezone.utc)
  return value.astimezone(timezone.utc)


def parse_happened_at_parts(
  *,
  date_str: Optional[str],
  time_str: Optional[str] = None,
  time_of_day: Optional[str] = None,
  at: Optional[str] = None,
) -> Optional[datetime]:
  if at:
    try:
      return normalize_happened_at(datetime.fromisoformat(at))
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid datetime format") from exc
  if not date_str:
    return None
  try:
    day = datetime.fromisoformat(date_str).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  base = business_date_start_utc(day)
  if time_str:
    parsed = None
    for time_format in ("%H:%M:%S", "%H:%M"):
      try:
        parsed = datetime.strptime(time_str, time_format).time()
        break
      except ValueError:
        continue
    if parsed is None:
      raise HTTPException(status_code=400, detail="Invalid time format")
    base = base + timedelta(hours=parsed.hour, minutes=parsed.minute, seconds=parsed.second)
  elif time_of_day == "morning":
    base = base + timedelta(hours=9)
  elif time_of_day == "evening":
    base = base + timedelta(hours=18)
  else:
    base = base + timedelta(hours=12)
  return base.replace(tzinfo=timezone.utc)


def derive_day(happened_at: datetime) -> datetime.date:
  utc_naive = to_utc_naive(happened_at)
  return business_date_from_utc(utc_naive)


def _insert_ledger_entries(
  session: Session,
  *,
  source_type: str,
  source_id: str,
  happened_at: datetime,
  day: datetime.date,
  lines: Iterable[LedgerLine],
) -> list[LedgerEntry]:
  entries: list[LedgerEntry] = []
  for line in lines:
    if line.amount == 0:
      continue
    entry = LedgerEntry(
      tenant_id=DEFAULT_TENANT_ID,
      source_type=source_type,
      source_id=source_id,
      happened_at=happened_at,
      day=day,
      customer_id=line.customer_id,
      account=line.account,
      gas_type=line.gas_type,
      state=line.state,
      unit=line.unit,
      amount=line.amount,
      note=line.note,
    )
    session.add(entry)
    entries.append(entry)
  return entries


def build_customer_lines(txn: CustomerTransaction) -> list[LedgerLine]:
  gas = txn.gas_type
  lines: list[LedgerLine] = []
  is_buy_iron = txn.kind == "order" and (txn.mode or "") == "buy_iron"
  money_delta = txn.paid - txn.total if is_buy_iron else txn.total - txn.paid

  if txn.kind == "order":
    mode = txn.mode or "replacement"
    if mode == "replacement":
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type=gas,
          state="full",
          unit=UNIT_COUNT,
          amount=-txn.installed,
        )
      )
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type=gas,
          state="empty",
          unit=UNIT_COUNT,
          amount=txn.received,
        )
      )
      cyl_delta = txn.installed - txn.received
      if cyl_delta:
        lines.append(
          LedgerLine(
            account=ACCOUNT_CUST_CYL,
            gas_type=gas,
            state="empty",
            unit=UNIT_COUNT,
            amount=cyl_delta,
            customer_id=txn.customer_id,
          )
        )
    elif mode == "sell_iron":
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type=gas,
          state="full",
          unit=UNIT_COUNT,
          amount=-txn.installed,
        )
      )
    elif mode == "buy_iron":
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type=gas,
          state="empty",
          unit=UNIT_COUNT,
          amount=txn.received,
        )
      )

    if money_delta:
      lines.append(
        LedgerLine(
          account=ACCOUNT_CUST_MONEY,
          unit=UNIT_MONEY,
          amount=money_delta,
          customer_id=txn.customer_id,
        )
      )
    if txn.paid:
      lines.append(
        LedgerLine(
          account=ACCOUNT_CASH,
          unit=UNIT_MONEY,
          amount=-txn.paid if is_buy_iron else txn.paid,
        )
      )

  elif txn.kind == "payment":
    if txn.paid:
      lines.append(
        LedgerLine(
          account=ACCOUNT_CASH,
          unit=UNIT_MONEY,
          amount=txn.paid,
        )
      )
      lines.append(
        LedgerLine(
          account=ACCOUNT_CUST_MONEY,
          unit=UNIT_MONEY,
          amount=-txn.paid,
          customer_id=txn.customer_id,
        )
      )

  elif txn.kind == "payout":
    if txn.paid:
      lines.append(
        LedgerLine(
          account=ACCOUNT_CASH,
          unit=UNIT_MONEY,
          amount=-txn.paid,
        )
      )
      lines.append(
        LedgerLine(
          account=ACCOUNT_CUST_MONEY,
          unit=UNIT_MONEY,
          amount=txn.paid,
          customer_id=txn.customer_id,
        )
      )

  elif txn.kind == "return":
    if txn.received:
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type=gas,
          state="empty",
          unit=UNIT_COUNT,
          amount=txn.received,
        )
      )
      lines.append(
        LedgerLine(
          account=ACCOUNT_CUST_CYL,
          gas_type=gas,
          state="empty",
          unit=UNIT_COUNT,
          amount=-txn.received,
          customer_id=txn.customer_id,
        )
      )

  elif txn.kind == "adjust":
    if money_delta:
      lines.append(
        LedgerLine(
          account=ACCOUNT_CUST_MONEY,
          unit=UNIT_MONEY,
          amount=money_delta,
          customer_id=txn.customer_id,
        )
      )
    cyl_delta = txn.installed - txn.received
    if cyl_delta:
      lines.append(
        LedgerLine(
          account=ACCOUNT_CUST_CYL,
          gas_type=gas,
          state="empty",
          unit=UNIT_COUNT,
          amount=cyl_delta,
          customer_id=txn.customer_id,
        )
      )

  return lines


def post_customer_transaction(session: Session, txn: CustomerTransaction) -> list[LedgerEntry]:
  lines = build_customer_lines(txn)
  return _insert_ledger_entries(
    session,
    source_type="customer_txn",
    source_id=txn.id,
    happened_at=txn.happened_at,
    day=txn.day,
    lines=lines,
  )


def build_company_lines(txn: CompanyTransaction) -> list[LedgerLine]:
  lines: list[LedgerLine] = []

  if txn.kind == "refill":
    full12 = txn.buy12 + txn.new12
    full48 = txn.buy48 + txn.new48
    if full12:
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type="12kg",
          state="full",
          unit=UNIT_COUNT,
          amount=full12,
        )
      )
    if full48:
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type="48kg",
          state="full",
          unit=UNIT_COUNT,
          amount=full48,
        )
      )
    if txn.return12:
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type="12kg",
          state="empty",
          unit=UNIT_COUNT,
          amount=-txn.return12,
        )
      )
    if txn.return48:
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type="48kg",
          state="empty",
          unit=UNIT_COUNT,
          amount=-txn.return48,
        )
      )

    cyl_delta_12 = txn.return12 - txn.buy12
    cyl_delta_48 = txn.return48 - txn.buy48
    if cyl_delta_12:
      lines.append(
        LedgerLine(
          account=ACCOUNT_COMPANY_CYL,
          gas_type="12kg",
          unit=UNIT_COUNT,
          amount=cyl_delta_12,
        )
      )
    if cyl_delta_48:
      lines.append(
        LedgerLine(
          account=ACCOUNT_COMPANY_CYL,
          gas_type="48kg",
          unit=UNIT_COUNT,
          amount=cyl_delta_48,
        )
      )
  elif txn.kind == "buy_iron":
    if txn.new12:
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type="12kg",
          state="full",
          unit=UNIT_COUNT,
          amount=txn.new12,
        )
      )
    if txn.new48:
      lines.append(
        LedgerLine(
          account=ACCOUNT_INV,
          gas_type="48kg",
          state="full",
          unit=UNIT_COUNT,
          amount=txn.new48,
        )
      )
  elif txn.kind == "adjust":
    if txn.buy12:
      lines.append(
        LedgerLine(
          account=ACCOUNT_COMPANY_CYL,
          gas_type="12kg",
          unit=UNIT_COUNT,
          amount=txn.buy12,
        )
      )
    if txn.buy48:
      lines.append(
        LedgerLine(
          account=ACCOUNT_COMPANY_CYL,
          gas_type="48kg",
          unit=UNIT_COUNT,
          amount=txn.buy48,
        )
      )

  if txn.paid and txn.kind != "adjust":
    lines.append(
      LedgerLine(
        account=ACCOUNT_CASH,
        unit=UNIT_MONEY,
        amount=-txn.paid,
      )
    )

  money_delta = txn.total if txn.kind == "adjust" else txn.total - txn.paid
  if money_delta:
    lines.append(
      LedgerLine(
        account=ACCOUNT_COMPANY_MONEY,
        unit=UNIT_MONEY,
        amount=money_delta,
      )
    )

  return lines


def post_company_transaction(session: Session, txn: CompanyTransaction) -> list[LedgerEntry]:
  lines = build_company_lines(txn)
  return _insert_ledger_entries(
    session,
    source_type="company_txn",
    source_id=txn.id,
    happened_at=txn.happened_at,
    day=txn.day,
    lines=lines,
  )


def build_inventory_adjustment_lines(adj: InventoryAdjustment) -> list[LedgerLine]:
  lines: list[LedgerLine] = []
  if adj.delta_full:
    lines.append(
      LedgerLine(
        account=ACCOUNT_INV,
        gas_type=adj.gas_type,
        state="full",
        unit=UNIT_COUNT,
        amount=adj.delta_full,
      )
    )
  if adj.delta_empty:
    lines.append(
      LedgerLine(
        account=ACCOUNT_INV,
        gas_type=adj.gas_type,
        state="empty",
        unit=UNIT_COUNT,
        amount=adj.delta_empty,
      )
    )
  return lines


def post_inventory_adjustment(session: Session, adj: InventoryAdjustment) -> list[LedgerEntry]:
  lines = build_inventory_adjustment_lines(adj)
  return _insert_ledger_entries(
    session,
    source_type="inventory_adjust",
    source_id=adj.id,
    happened_at=adj.happened_at,
    day=adj.day,
    lines=lines,
  )


def build_expense_lines(expense: Expense) -> list[LedgerLine]:
  lines: list[LedgerLine] = []
  if expense.kind == "expense":
    if expense.paid_from == "bank":
      lines.append(LedgerLine(account=ACCOUNT_BANK, unit=UNIT_MONEY, amount=-expense.amount))
    else:
      lines.append(LedgerLine(account=ACCOUNT_CASH, unit=UNIT_MONEY, amount=-expense.amount))
    lines.append(LedgerLine(account=ACCOUNT_EXPENSE, unit=UNIT_MONEY, amount=expense.amount))
  elif expense.kind == "deposit":
    if expense.paid_from == "bank":
      lines.append(LedgerLine(account=ACCOUNT_BANK, unit=UNIT_MONEY, amount=-expense.amount))
      lines.append(LedgerLine(account=ACCOUNT_CASH, unit=UNIT_MONEY, amount=expense.amount))
    else:
      lines.append(LedgerLine(account=ACCOUNT_CASH, unit=UNIT_MONEY, amount=-expense.amount))
      lines.append(LedgerLine(account=ACCOUNT_BANK, unit=UNIT_MONEY, amount=expense.amount))

  return lines


def post_expense(session: Session, expense: Expense) -> list[LedgerEntry]:
  lines = build_expense_lines(expense)
  return _insert_ledger_entries(
    session,
    source_type="expense",
    source_id=expense.id,
    happened_at=expense.happened_at,
    day=expense.day,
    lines=lines,
  )


def build_cash_adjustment_lines(adjustment: CashAdjustment) -> list[LedgerLine]:
  return [
    LedgerLine(account=ACCOUNT_CASH, unit=UNIT_MONEY, amount=adjustment.delta_cash, note=adjustment.note),
    LedgerLine(account=ACCOUNT_CASH_ADJUST, unit=UNIT_MONEY, amount=-adjustment.delta_cash, note=adjustment.note),
  ]


def post_cash_adjustment(session: Session, adjustment: CashAdjustment) -> list[LedgerEntry]:
  lines = build_cash_adjustment_lines(adjustment)
  return _insert_ledger_entries(
    session,
    source_type="cash_adjust",
    source_id=adjustment.id,
    happened_at=adjustment.happened_at,
    day=adjustment.day,
    lines=lines,
  )


def post_system_init(
  session: Session,
  *,
  source_id: str,
  happened_at: datetime,
  day: datetime.date,
  lines: Iterable[LedgerLine],
) -> list[LedgerEntry]:
  return _insert_ledger_entries(
    session,
    source_type="system_init",
    source_id=source_id,
    happened_at=happened_at,
    day=day,
    lines=lines,
  )


def reverse_source(
  session: Session,
  *,
  source_type: str,
  source_id: str,
  reversal_source_type: str,
  reversal_source_id: str,
  happened_at: datetime,
  day: datetime.date,
  note: Optional[str] = None,
) -> list[LedgerEntry]:
  originals = session.exec(
    select(LedgerEntry).where(
      LedgerEntry.source_type == source_type,
      LedgerEntry.source_id == source_id,
    )
  ).all()
  lines = [
    LedgerLine(
      account=row.account,
      gas_type=row.gas_type,
      state=row.state,
      unit=row.unit,
      amount=-row.amount,
      customer_id=row.customer_id,
      note=note or row.note,
    )
    for row in originals
  ]
  return _insert_ledger_entries(
    session,
    source_type=reversal_source_type,
    source_id=reversal_source_id,
    happened_at=happened_at,
    day=day,
    lines=lines,
  )

