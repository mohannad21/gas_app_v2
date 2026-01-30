from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.models import (
  CompanyTransaction,
  Customer,
  CustomerTransaction,
  Expense,
  ExpenseCategory,
  InventoryAdjustment,
  LedgerEntry,
  System,
)
from app.schemas import (
  DailyAuditSummary,
  DailyReportV2Card,
  DailyReportV2Day,
  DailyReportV2Event,
  ReportInventoryState,
  ReportInventoryTotals,
)
from app.services.ledger import sum_ledger

router = APIRouter(prefix="/reports", tags=["reports"])


def _date_range(start: date, end: date) -> list[date]:
  if end < start:
    return []
  days = (end - start).days
  return [start + timedelta(days=offset) for offset in range(days + 1)]


def _sum_customer_totals(session: Session) -> dict[str, int]:
  rows = session.exec(
    select(LedgerEntry.customer_id, func.coalesce(func.sum(LedgerEntry.amount), 0))
    .where(LedgerEntry.account == "cust_money_debts")
    .group_by(LedgerEntry.customer_id)
  ).all()
  money_receivable = 0
  money_payable = 0
  for cust_id, total in rows:
    if cust_id is None:
      continue
    total = int(total or 0)
    if total > 0:
      money_receivable += total
    elif total < 0:
      money_payable += abs(total)

  cyl12_rows = session.exec(
    select(LedgerEntry.customer_id, func.coalesce(func.sum(LedgerEntry.amount), 0))
    .where(LedgerEntry.account == "cust_cylinders_debts")
    .where(LedgerEntry.gas_type == "12kg")
    .group_by(LedgerEntry.customer_id)
  ).all()
  cyl48_rows = session.exec(
    select(LedgerEntry.customer_id, func.coalesce(func.sum(LedgerEntry.amount), 0))
    .where(LedgerEntry.account == "cust_cylinders_debts")
    .where(LedgerEntry.gas_type == "48kg")
    .group_by(LedgerEntry.customer_id)
  ).all()

  cyl_receivable_12 = cyl_payable_12 = 0
  for cust_id, total in cyl12_rows:
    if cust_id is None:
      continue
    total = int(total or 0)
    if total > 0:
      cyl_receivable_12 += total
    elif total < 0:
      cyl_payable_12 += abs(total)

  cyl_receivable_48 = cyl_payable_48 = 0
  for cust_id, total in cyl48_rows:
    if cust_id is None:
      continue
    total = int(total or 0)
    if total > 0:
      cyl_receivable_48 += total
    elif total < 0:
      cyl_payable_48 += abs(total)

  return {
    "money_receivable": money_receivable,
    "money_payable": money_payable,
    "cyl_receivable_12": cyl_receivable_12,
    "cyl_payable_12": cyl_payable_12,
    "cyl_receivable_48": cyl_receivable_48,
    "cyl_payable_48": cyl_payable_48,
  }


def _sum_inventory_at_day_end(session: Session, day: date) -> ReportInventoryTotals:
  full12 = sum_ledger(session, account="inv", gas_type="12kg", state="full", unit="count", day_to=day)
  empty12 = sum_ledger(session, account="inv", gas_type="12kg", state="empty", unit="count", day_to=day)
  full48 = sum_ledger(session, account="inv", gas_type="48kg", state="full", unit="count", day_to=day)
  empty48 = sum_ledger(session, account="inv", gas_type="48kg", state="empty", unit="count", day_to=day)
  return ReportInventoryTotals(full12=full12, empty12=empty12, full48=full48, empty48=empty48)


def _sum_inventory_before_day(session: Session, day: date) -> ReportInventoryTotals:
  prev = day - timedelta(days=1)
  return _sum_inventory_at_day_end(session, prev)


def _sum_cash_at_day_end(session: Session, day: date) -> int:
  return sum_ledger(session, account="cash", unit="money", day_to=day)


def _sum_cash_before_day(session: Session, day: date) -> int:
  prev = day - timedelta(days=1)
  return _sum_cash_at_day_end(session, prev)


def _sum_company_at_day_end(session: Session, day: date) -> int:
  return sum_ledger(session, account="company_money_debts", unit="money", day_to=day)


def _sum_company_before_day(session: Session, day: date) -> int:
  prev = day - timedelta(days=1)
  return _sum_company_at_day_end(session, prev)


def _sum_company_cyl_at_day_end(session: Session, day: date, gas_type: str) -> int:
  return sum_ledger(
    session,
    account="company_cylinders_debts",
    gas_type=gas_type,
    unit="count",
    day_to=day,
  )


def _sum_company_cyl_before_day(session: Session, day: date, gas_type: str) -> int:
  prev = day - timedelta(days=1)
  return _sum_company_cyl_at_day_end(session, prev, gas_type)


def _daily_deltas(
  session: Session,
  *,
  account: str,
  gas_type: Optional[str] = None,
  state: Optional[str] = None,
  unit: Optional[str] = None,
  start: date,
  end: date,
) -> dict[date, int]:
  stmt = select(LedgerEntry.day, func.coalesce(func.sum(LedgerEntry.amount), 0))
  stmt = stmt.where(LedgerEntry.account == account)
  if gas_type is not None:
    stmt = stmt.where(LedgerEntry.gas_type == gas_type)
  if state is not None:
    stmt = stmt.where(LedgerEntry.state == state)
  if unit is not None:
    stmt = stmt.where(LedgerEntry.unit == unit)
  stmt = stmt.where(LedgerEntry.day >= start).where(LedgerEntry.day <= end)
  stmt = stmt.group_by(LedgerEntry.day)
  rows = session.exec(stmt).all()
  return {row[0]: int(row[1] or 0) for row in rows}


def get_daily_audit_summary(session: Session, business_date: date) -> DailyAuditSummary:
  cash_in = sum_ledger(
    session,
    account="cash",
    unit="money",
    day_from=business_date,
    day_to=business_date,
  )
  # approximate new debt as sum of customer money debt deltas on that day
  new_debt = sum_ledger(
    session,
    account="cust_money_debts",
    unit="money",
    day_from=business_date,
    day_to=business_date,
  )
  inv_delta_12 = sum_ledger(
    session,
    account="inv",
    gas_type="12kg",
    unit="count",
    day_from=business_date,
    day_to=business_date,
  )
  inv_delta_48 = sum_ledger(
    session,
    account="inv",
    gas_type="48kg",
    unit="count",
    day_from=business_date,
    day_to=business_date,
  )
  return DailyAuditSummary(
    cash_in=cash_in,
    new_debt=new_debt,
    inv_delta_12=inv_delta_12,
    inv_delta_48=inv_delta_48,
  )


@router.get("/daily_v2", response_model=list[DailyReportV2Card])
def list_daily_reports_v2(
  from_: Optional[str] = Query(default=None, alias="from"),
  to: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
) -> list[DailyReportV2Card]:
  today = datetime.now(timezone.utc).date()
  if to:
    try:
      end_date = datetime.fromisoformat(to).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid to date format") from exc
  else:
    end_date = today

  if from_:
    try:
      start_date = datetime.fromisoformat(from_).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid from date format") from exc
  else:
    min_day = session.exec(select(func.min(LedgerEntry.day))).first()
    start_date = min_day if min_day else end_date

  if end_date < start_date:
    return []

  cash_deltas = _daily_deltas(session, account="cash", unit="money", start=start_date, end=end_date)
  company_deltas = _daily_deltas(
    session, account="company_money_debts", unit="money", start=start_date, end=end_date
  )
  company_cyl_12 = _daily_deltas(
    session, account="company_cylinders_debts", gas_type="12kg", unit="count", start=start_date, end=end_date
  )
  company_cyl_48 = _daily_deltas(
    session, account="company_cylinders_debts", gas_type="48kg", unit="count", start=start_date, end=end_date
  )
  inv_full_12 = _daily_deltas(
    session, account="inv", gas_type="12kg", state="full", unit="count", start=start_date, end=end_date
  )
  inv_empty_12 = _daily_deltas(
    session, account="inv", gas_type="12kg", state="empty", unit="count", start=start_date, end=end_date
  )
  inv_full_48 = _daily_deltas(
    session, account="inv", gas_type="48kg", state="full", unit="count", start=start_date, end=end_date
  )
  inv_empty_48 = _daily_deltas(
    session, account="inv", gas_type="48kg", state="empty", unit="count", start=start_date, end=end_date
  )

  running_cash = _sum_cash_before_day(session, start_date)
  running_company = _sum_company_before_day(session, start_date)
  running_company_12 = _sum_company_cyl_before_day(session, start_date, "12kg")
  running_company_48 = _sum_company_cyl_before_day(session, start_date, "48kg")
  inv_start = _sum_inventory_before_day(session, start_date)
  running_full12 = inv_start.full12
  running_empty12 = inv_start.empty12
  running_full48 = inv_start.full48
  running_empty48 = inv_start.empty48

  customer_totals = _sum_customer_totals(session)

  response: list[DailyReportV2Card] = []
  for current in _date_range(start_date, end_date):
    cash_start = running_cash
    running_cash += cash_deltas.get(current, 0)
    cash_end = running_cash

    company_start = running_company
    running_company += company_deltas.get(current, 0)
    company_end = running_company

    company_12kg_start = running_company_12
    running_company_12 += company_cyl_12.get(current, 0)
    company_12kg_end = running_company_12

    company_48kg_start = running_company_48
    running_company_48 += company_cyl_48.get(current, 0)
    company_48kg_end = running_company_48

    company_give_start = max(company_start, 0)
    company_give_end = max(company_end, 0)
    company_receive_start = max(-company_start, 0)
    company_receive_end = max(-company_end, 0)

    company_12kg_receive_start = max(company_12kg_start, 0)
    company_12kg_receive_end = max(company_12kg_end, 0)
    company_12kg_give_start = max(-company_12kg_start, 0)
    company_12kg_give_end = max(-company_12kg_end, 0)

    company_48kg_receive_start = max(company_48kg_start, 0)
    company_48kg_receive_end = max(company_48kg_end, 0)
    company_48kg_give_start = max(-company_48kg_start, 0)
    company_48kg_give_end = max(-company_48kg_end, 0)

    inv_start = ReportInventoryTotals(
      full12=running_full12,
      empty12=running_empty12,
      full48=running_full48,
      empty48=running_empty48,
    )

    running_full12 += inv_full_12.get(current, 0)
    running_empty12 += inv_empty_12.get(current, 0)
    running_full48 += inv_full_48.get(current, 0)
    running_empty48 += inv_empty_48.get(current, 0)

    inv_end = ReportInventoryTotals(
      full12=running_full12,
      empty12=running_empty12,
      full48=running_full48,
      empty48=running_empty48,
    )

    response.append(
      DailyReportV2Card(
        date=current.isoformat(),
        cash_start=cash_start,
        cash_end=cash_end,
        company_start=company_start,
        company_end=company_end,
        company_12kg_start=company_12kg_start,
        company_12kg_end=company_12kg_end,
        company_48kg_start=company_48kg_start,
        company_48kg_end=company_48kg_end,
        company_give_start=company_give_start,
        company_give_end=company_give_end,
        company_receive_start=company_receive_start,
        company_receive_end=company_receive_end,
        company_12kg_give_start=company_12kg_give_start,
        company_12kg_give_end=company_12kg_give_end,
        company_12kg_receive_start=company_12kg_receive_start,
        company_12kg_receive_end=company_12kg_receive_end,
        company_48kg_give_start=company_48kg_give_start,
        company_48kg_give_end=company_48kg_give_end,
        company_48kg_receive_start=company_48kg_receive_start,
        company_48kg_receive_end=company_48kg_receive_end,
        customer_money_receivable=customer_totals["money_receivable"],
        customer_money_payable=customer_totals["money_payable"],
        customer_12kg_receivable=customer_totals["cyl_receivable_12"],
        customer_12kg_payable=customer_totals["cyl_payable_12"],
        customer_48kg_receivable=customer_totals["cyl_receivable_48"],
        customer_48kg_payable=customer_totals["cyl_payable_48"],
        inventory_start=inv_start,
        inventory_end=inv_end,
        problems=None,
        recalculated=False,
      )
    )

  response.sort(key=lambda row: row.date, reverse=True)
  return response


@router.get("/day_v2", response_model=DailyReportV2Day)
def get_daily_report_v2(date: str, session: Session = Depends(get_session)) -> DailyReportV2Day:
  try:
    business_date = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc

  inventory_start = _sum_inventory_before_day(session, business_date)
  inventory_end = _sum_inventory_at_day_end(session, business_date)
  cash_start = _sum_cash_before_day(session, business_date)
  cash_end = _sum_cash_at_day_end(session, business_date)
  company_start = _sum_company_before_day(session, business_date)
  company_end = _sum_company_at_day_end(session, business_date)
  company_12kg_start = _sum_company_cyl_before_day(session, business_date, "12kg")
  company_12kg_end = _sum_company_cyl_at_day_end(session, business_date, "12kg")
  company_48kg_start = _sum_company_cyl_before_day(session, business_date, "48kg")
  company_48kg_end = _sum_company_cyl_at_day_end(session, business_date, "48kg")
  company_give_start = max(company_start, 0)
  company_give_end = max(company_end, 0)
  company_receive_start = max(-company_start, 0)
  company_receive_end = max(-company_end, 0)
  company_12kg_receive_start = max(company_12kg_start, 0)
  company_12kg_receive_end = max(company_12kg_end, 0)
  company_12kg_give_start = max(-company_12kg_start, 0)
  company_12kg_give_end = max(-company_12kg_end, 0)
  company_48kg_receive_start = max(company_48kg_start, 0)
  company_48kg_receive_end = max(company_48kg_end, 0)
  company_48kg_give_start = max(-company_48kg_start, 0)
  company_48kg_give_end = max(-company_48kg_end, 0)
  customer_totals = _sum_customer_totals(session)

  ledger_rows = session.exec(select(LedgerEntry).where(LedgerEntry.day == business_date)).all()
  ledger_by_source: dict[tuple[str, str], list[LedgerEntry]] = defaultdict(list)
  for row in ledger_rows:
    ledger_by_source[(row.source_type, row.source_id)].append(row)

  customers = {c.id: c for c in session.exec(select(Customer)).all()}
  systems = {s.id: s for s in session.exec(select(System)).all()}
  categories = {c.id: c.name for c in session.exec(select(ExpenseCategory)).all()}

  events: list[tuple[datetime, DailyReportV2Event]] = []

  # group return transactions by group_id
  customer_txns = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.day == business_date)
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).all()
  grouped_returns: dict[str, list[CustomerTransaction]] = defaultdict(list)
  other_txns: list[CustomerTransaction] = []
  for txn in customer_txns:
    if txn.kind == "return" and txn.group_id:
      grouped_returns[txn.group_id].append(txn)
    else:
      other_txns.append(txn)

  for txn in other_txns:
    source_key = ("customer_txn", txn.id)
    entry_rows = ledger_by_source.get(source_key, [])
    event_type = "order" if txn.kind == "order" else "collection_money" if txn.kind == "payment" else "customer_adjust"
    if txn.kind == "adjust":
      event_type = "customer_adjust"
    customer = customers.get(txn.customer_id)
    system = systems.get(txn.system_id) if txn.system_id else None
    cash_delta = sum(row.amount for row in entry_rows if row.account == "cash")
    inv_rows = [row for row in entry_rows if row.account == "inv"]
    event = DailyReportV2Event(
      event_type=event_type,
      effective_at=txn.happened_at,
      created_at=txn.happened_at,
      source_id=txn.id,
      label=None,
      label_short=None,
      order_mode=txn.mode if txn.kind == "order" else None,
      gas_type=txn.gas_type,
      customer_id=txn.customer_id,
      customer_name=customer.name if customer else None,
      customer_description=customer.note if customer else None,
      system_name=system.name if system else None,
      system_type=system.name if system else None,
      expense_type=None,
      reason=txn.note,
      buy12=None,
      return12=None,
      buy48=None,
      return48=None,
      total_cost=None,
      paid_now=None,
      order_total=txn.total if txn.kind == "order" else None,
      order_paid=txn.paid if txn.kind == "order" else None,
      order_installed=txn.installed if txn.kind == "order" else None,
      order_received=txn.received if txn.kind == "order" else None,
      cash_before=None,
      cash_after=None,
      inventory_before=None,
      inventory_after=None,
    )
    events.append((txn.happened_at, event))

  for group_id, txns in grouped_returns.items():
    base = min(txns, key=lambda t: t.happened_at)
    qty_12 = sum(t.received for t in txns if t.gas_type == "12kg")
    qty_48 = sum(t.received for t in txns if t.gas_type == "48kg")
    customer = customers.get(base.customer_id)
    system = systems.get(base.system_id) if base.system_id else None
    event = DailyReportV2Event(
      event_type="collection_empty",
      effective_at=base.happened_at,
      created_at=base.happened_at,
      source_id=group_id,
      label=None,
      label_short=None,
      order_mode=None,
      gas_type=None,
      customer_id=base.customer_id,
      customer_name=customer.name if customer else None,
      customer_description=customer.note if customer else None,
      system_name=system.name if system else None,
      system_type=system.name if system else None,
      expense_type=None,
      reason=base.note,
      buy12=None,
      return12=None,
      buy48=None,
      return48=None,
      total_cost=None,
      paid_now=None,
      order_total=None,
      order_paid=None,
      order_installed=None,
      order_received=None,
      cash_before=None,
      cash_after=None,
      inventory_before=None,
      inventory_after=None,
    )
    events.append((base.happened_at, event))

  # inventory adjustments
  adjustments = session.exec(
    select(InventoryAdjustment)
    .where(InventoryAdjustment.day == business_date)
    .where(InventoryAdjustment.is_reversed == False)  # noqa: E712
  ).all()
  for adj in adjustments:
    event = DailyReportV2Event(
      event_type="adjust",
      effective_at=adj.happened_at,
      created_at=adj.happened_at,
      source_id=adj.id,
      label=None,
      label_short=None,
      order_mode=None,
      gas_type=adj.gas_type,
      customer_id=None,
      customer_name=None,
      customer_description=None,
      system_name=None,
      system_type=None,
      expense_type=None,
      reason=adj.note,
      buy12=None,
      return12=None,
      buy48=None,
      return48=None,
      total_cost=None,
      paid_now=None,
      order_total=None,
      order_paid=None,
      order_installed=None,
      order_received=None,
      cash_before=None,
      cash_after=None,
      inventory_before=None,
      inventory_after=None,
    )
    events.append((adj.happened_at, event))

  # company transactions
  company_txns = session.exec(
    select(CompanyTransaction)
    .where(CompanyTransaction.day == business_date)
    .where(CompanyTransaction.is_reversed == False)  # noqa: E712
  ).all()
  for txn in company_txns:
    event = DailyReportV2Event(
      event_type="refill",
      effective_at=txn.happened_at,
      created_at=txn.happened_at,
      source_id=txn.id,
      label=None,
      label_short=None,
      order_mode=None,
      gas_type=None,
      customer_id=None,
      customer_name=None,
      customer_description=None,
      system_name=None,
      system_type=None,
      expense_type=None,
      reason=txn.note,
      buy12=txn.buy12 + txn.new12,
      return12=txn.return12,
      buy48=txn.buy48 + txn.new48,
      return48=txn.return48,
      total_cost=txn.total,
      paid_now=txn.paid,
      order_total=None,
      order_paid=None,
      order_installed=None,
      order_received=None,
      cash_before=None,
      cash_after=None,
      inventory_before=None,
      inventory_after=None,
    )
    events.append((txn.happened_at, event))

  # expenses and deposits
  expenses = session.exec(
    select(Expense)
    .where(Expense.day == business_date)
    .where(Expense.is_reversed == False)  # noqa: E712
  ).all()
  for expense in expenses:
    if expense.kind == "deposit":
      event_type = "bank_deposit"
    else:
      event_type = "cash_adjust" if categories.get(expense.category_id) == "Cash Adjustment" else "expense"
    event = DailyReportV2Event(
      event_type=event_type,
      effective_at=expense.happened_at,
      created_at=expense.happened_at,
      source_id=expense.id,
      label=None,
      label_short=None,
      order_mode=None,
      gas_type=None,
      customer_id=None,
      customer_name=None,
      customer_description=None,
      system_name=None,
      system_type=None,
      expense_type=categories.get(expense.category_id),
      reason=expense.note,
      buy12=None,
      return12=None,
      buy48=None,
      return48=None,
      total_cost=expense.amount if expense.kind == "expense" else None,
      paid_now=None,
      order_total=None,
      order_paid=None,
      order_installed=None,
      order_received=None,
      cash_before=None,
      cash_after=None,
      inventory_before=None,
      inventory_after=None,
    )
    events.append((expense.happened_at, event))

  # sort and apply running balances for cash/inventory
  events.sort(key=lambda pair: pair[0])
  running_cash = cash_start
  running_company = company_start
  running_company_12 = company_12kg_start
  running_company_48 = company_48kg_start
  running_full = {"12kg": inventory_start.full12, "48kg": inventory_start.full48}
  running_empty = {"12kg": inventory_start.empty12, "48kg": inventory_start.empty48}
  event_rows: list[DailyReportV2Event] = []

  for happened_at, event in events:
    key = (None, None)
    if event.source_id:
      if event.event_type in {"order", "collection_money", "collection_empty", "customer_adjust"}:
        key = ("customer_txn", event.source_id)
      elif event.event_type == "refill":
        key = ("company_txn", event.source_id)
      elif event.event_type in {"expense", "cash_adjust", "bank_deposit"}:
        key = ("expense", event.source_id)
      elif event.event_type == "adjust":
        key = ("inventory_adjust", event.source_id)
    entry_rows = ledger_by_source.get(key, []) if key != (None, None) else []
    cash_delta = sum(row.amount for row in entry_rows if row.account == "cash")
    company_delta = sum(row.amount for row in entry_rows if row.account == "company_money_debts")
    company_12_delta = sum(
      row.amount
      for row in entry_rows
      if row.account == "company_cylinders_debts" and row.gas_type == "12kg"
    )
    company_48_delta = sum(
      row.amount
      for row in entry_rows
      if row.account == "company_cylinders_debts" and row.gas_type == "48kg"
    )
    inv_deltas = [row for row in entry_rows if row.account == "inv"]

    event.cash_before = running_cash
    event.cash_after = running_cash + cash_delta
    running_cash = event.cash_after

    event.company_before = running_company
    event.company_after = running_company + company_delta
    running_company = event.company_after

    event.company_12kg_before = running_company_12
    event.company_12kg_after = running_company_12 + company_12_delta
    running_company_12 = event.company_12kg_after

    event.company_48kg_before = running_company_48
    event.company_48kg_after = running_company_48 + company_48_delta
    running_company_48 = event.company_48kg_after

    if inv_deltas:
      inv_before = ReportInventoryState(
        full12=running_full["12kg"],
        empty12=running_empty["12kg"],
        full48=running_full["48kg"],
        empty48=running_empty["48kg"],
      )
      for row in inv_deltas:
        if row.gas_type == "12kg":
          if row.state == "full":
            running_full["12kg"] += row.amount
          else:
            running_empty["12kg"] += row.amount
        elif row.gas_type == "48kg":
          if row.state == "full":
            running_full["48kg"] += row.amount
          else:
            running_empty["48kg"] += row.amount
      inv_after = ReportInventoryState(
        full12=running_full["12kg"],
        empty12=running_empty["12kg"],
        full48=running_full["48kg"],
        empty48=running_empty["48kg"],
      )
      event.inventory_before = inv_before
      event.inventory_after = inv_after

    event_rows.append(event)

  return DailyReportV2Day(
    date=business_date.isoformat(),
    cash_start=cash_start,
    cash_end=cash_end,
    company_start=company_start,
    company_end=company_end,
    company_12kg_start=company_12kg_start,
    company_12kg_end=company_12kg_end,
    company_48kg_start=company_48kg_start,
    company_48kg_end=company_48kg_end,
    company_give_start=company_give_start,
    company_give_end=company_give_end,
    company_receive_start=company_receive_start,
    company_receive_end=company_receive_end,
    company_12kg_give_start=company_12kg_give_start,
    company_12kg_give_end=company_12kg_give_end,
    company_12kg_receive_start=company_12kg_receive_start,
    company_12kg_receive_end=company_12kg_receive_end,
    company_48kg_give_start=company_48kg_give_start,
    company_48kg_give_end=company_48kg_give_end,
    company_48kg_receive_start=company_48kg_receive_start,
    company_48kg_receive_end=company_48kg_receive_end,
    customer_money_receivable=customer_totals["money_receivable"],
    customer_money_payable=customer_totals["money_payable"],
    customer_12kg_receivable=customer_totals["cyl_receivable_12"],
    customer_12kg_payable=customer_totals["cyl_payable_12"],
    customer_48kg_receivable=customer_totals["cyl_receivable_48"],
    customer_48kg_payable=customer_totals["cyl_payable_48"],
    inventory_start=inventory_start,
    inventory_end=inventory_end,
    audit_summary=get_daily_audit_summary(session, business_date),
    events=event_rows,
  )
