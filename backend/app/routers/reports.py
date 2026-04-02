"""Reports router - daily reporting endpoints.

Public routes for generating daily financial reports with event feeds and balance tracking.
All helper logic delegated to reports_aggregates and reports_event_fields service modules.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.models import (
  CashAdjustment,
  CompanyTransaction,
  Customer,
  CustomerTransaction,
  Expense,
  ExpenseCategory,
  InventoryAdjustment,
  LedgerEntry,
  System,
  SystemSettings,
)
from app.schemas import (
  DailyReportV2Card,
  DailyReportV2CashMath,
  DailyReportV2Math,
  DailyReportV2Day,
  DailyReportV2Event,
  ActivityNote,
  ReportInventoryTotals,
)
from app.services.reports_aggregates import (
  _date_range,
  _sum_inventory_at_day_end,
  _sum_inventory_before_day,
  _sum_cash_at_day_end,
  _sum_cash_before_day,
  _sum_company_at_day_end,
  _sum_company_before_day,
  _sum_company_cyl_at_day_end,
  _sum_company_cyl_before_day,
  _seed_customer_states_before_day,
  _customer_state_delta_from_entries,
  _add_customer_state,
  _customer_balance_transitions,
  _company_balance_transitions,
  _event_order_key,
  _daily_deltas,
  _sold_full_by_day,
  _cash_math_by_day,
  _customer_day_state_bounds,
  _company_day_state_bounds,
  _snapshot_transitions_for_customer,
  _snapshot_transitions_for_company,
  _snapshot_lines_for_customer,
  _snapshot_lines_for_company,
  get_daily_audit_summary,
  CustomerLedgerState,
)
from app.services.reports_event_fields import (
  _apply_ticket_fields,
  _apply_level3_fields,
  _apply_ui_fields,
  _apply_status_fields,
  _remaining_actions_for_event,
  _notes_for_event,
  _status_mode,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/daily_v2", response_model=list[DailyReportV2Card])
def list_daily_reports_v2(
  from_: Optional[str] = Query(default=None, alias="from"),
  to: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
) -> list[DailyReportV2Card]:
  """List daily report cards for a date range (default 14 days)."""
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
    start_date = end_date - timedelta(days=14)

  if end_date < start_date:
    return []

  # Aggregate daily deltas for all accounts
  cash_deltas = _daily_deltas(session, account="cash", unit="money", date_start=start_date, date_end=end_date)
  company_deltas = _daily_deltas(
    session, account="company_money_debts", unit="money", date_start=start_date, date_end=end_date
  )
  company_cyl_12 = _daily_deltas(
    session, account="company_cylinders_debts", gas_type="12kg", unit="count", date_start=start_date, date_end=end_date
  )
  company_cyl_48 = _daily_deltas(
    session, account="company_cylinders_debts", gas_type="48kg", unit="count", date_start=start_date, date_end=end_date
  )
  inv_full_12 = _daily_deltas(
    session, account="inv", gas_type="12kg", state="full", unit="count", date_start=start_date, date_end=end_date
  )
  inv_empty_12 = _daily_deltas(
    session, account="inv", gas_type="12kg", state="empty", unit="count", date_start=start_date, date_end=end_date
  )
  inv_full_48 = _daily_deltas(
    session, account="inv", gas_type="48kg", state="full", unit="count", date_start=start_date, date_end=end_date
  )
  inv_empty_48 = _daily_deltas(
    session, account="inv", gas_type="48kg", state="empty", unit="count", date_start=start_date, date_end=end_date
  )
  sold_full = _sold_full_by_day(session, date_start=start_date, date_end=end_date)
  refill_days: set = set(
    row[0] if isinstance(row, tuple) else row
    for row in session.exec(
      select(CompanyTransaction.day)
      .where(CompanyTransaction.day >= start_date)
      .where(CompanyTransaction.day <= end_date)
      .where(CompanyTransaction.kind.in_(["refill", "buy_iron"]))
      .where(CompanyTransaction.is_reversed == False)  # noqa: E712
      .distinct()
    ).all()
  )

  # Get running balances at start of date range
  running_cash = _sum_cash_before_day(session, start_date)
  running_company = _sum_company_before_day(session, start_date)
  running_company_12 = _sum_company_cyl_before_day(session, start_date, "12kg")
  running_company_48 = _sum_company_cyl_before_day(session, start_date, "48kg")
  inv_start = _sum_inventory_before_day(session, start_date)
  running_full12 = inv_start.full12
  running_empty12 = inv_start.empty12
  running_full48 = inv_start.full48
  running_empty48 = inv_start.empty48

  # Get settings and customers
  settings = session.get(SystemSettings, "system")
  money_decimals = settings.money_decimals if settings else 2
  customers = {c.id: c for c in session.exec(select(Customer)).all()}

  cash_math_by_day = _cash_math_by_day(session, date_start=start_date, date_end=end_date)

  # Load activity data for problem identification
  customer_activity_rows = session.exec(
    select(CustomerTransaction.day, CustomerTransaction.customer_id, CustomerTransaction.kind)
    .where(CustomerTransaction.day >= start_date)
    .where(CustomerTransaction.day <= end_date)
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).all()
  customer_activity_by_day: dict[date, set[str]] = defaultdict(set)
  customer_activity_kinds: dict[tuple[date, str], set[str]] = defaultdict(set)
  for day, customer_id, kind in customer_activity_rows:
    if customer_id:
      customer_activity_by_day[day].add(customer_id)
      customer_activity_kinds[(day, customer_id)].add(kind)

  company_activity_rows = session.exec(
    select(CompanyTransaction.day)
    .where(CompanyTransaction.day >= start_date)
    .where(CompanyTransaction.day <= end_date)
    .where(CompanyTransaction.is_reversed == False)  # noqa: E712
  ).all()
  company_activity_days = {row[0] if isinstance(row, tuple) else row for row in company_activity_rows}

  customer_sales_rows = session.exec(
    select(CustomerTransaction.day, func.coalesce(func.sum(CustomerTransaction.paid), 0))
    .where(CustomerTransaction.day >= start_date)
    .where(CustomerTransaction.day <= end_date)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
    .group_by(CustomerTransaction.day)
  ).all()
  customer_sales_by_day = {row[0]: int(row[1] or 0) for row in customer_sales_rows}

  customer_pay_rows = session.exec(
    select(CustomerTransaction.day, func.coalesce(func.sum(CustomerTransaction.paid), 0))
    .where(CustomerTransaction.day >= start_date)
    .where(CustomerTransaction.day <= end_date)
    .where(CustomerTransaction.kind == "payment")
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
    .group_by(CustomerTransaction.day)
  ).all()
  customer_pay_by_day = {row[0]: int(row[1] or 0) for row in customer_pay_rows}

  company_paid_rows = session.exec(
    select(CompanyTransaction.day, func.coalesce(func.sum(CompanyTransaction.paid), 0))
    .where(CompanyTransaction.day >= start_date)
    .where(CompanyTransaction.day <= end_date)
    .where(CompanyTransaction.is_reversed == False)  # noqa: E712
    .group_by(CompanyTransaction.day)
  ).all()
  company_paid_by_day = {row[0]: int(row[1] or 0) for row in company_paid_rows}

  expense_rows = session.exec(
    select(Expense.day, func.coalesce(func.sum(Expense.amount), 0))
    .where(Expense.day >= start_date)
    .where(Expense.day <= end_date)
    .where(Expense.kind == "expense")
    .where(Expense.is_reversed == False)  # noqa: E712
    .group_by(Expense.day)
  ).all()
  expenses_by_day = {row[0]: int(row[1] or 0) for row in expense_rows}

  adjustment_rows = session.exec(
    select(CashAdjustment.day, func.coalesce(func.sum(CashAdjustment.delta_cash), 0))
    .where(CashAdjustment.day >= start_date)
    .where(CashAdjustment.day <= end_date)
    .where(CashAdjustment.is_reversed == False)  # noqa: E712
    .group_by(CashAdjustment.day)
  ).all()
  adjustments_by_day = {row[0]: int(row[1] or 0) for row in adjustment_rows}

  # Build daily cards
  response: list[DailyReportV2Card] = []
  for current in _date_range(start_date, end_date):
    cash_start = running_cash
    running_cash += cash_deltas.get(current, 0)

    company_start = running_company
    running_company += company_deltas.get(current, 0)
    company_12_start = running_company_12
    running_company_12 += company_cyl_12.get(current, 0)
    company_48_start = running_company_48
    running_company_48 += company_cyl_48.get(current, 0)

    inv_12_full_start = running_full12
    running_full12 += inv_full_12.get(current, 0)
    inv_12_empty_start = running_empty12
    running_empty12 += inv_empty_12.get(current, 0)
    inv_48_full_start = running_full48
    running_full48 += inv_full_48.get(current, 0)
    inv_48_empty_start = running_empty48
    running_empty48 += inv_empty_48.get(current, 0)

    problem_lines: list[tuple[str, str, str]] = []

    # Identify customers with outstanding balances
    active_customers = customer_activity_by_day.get(current, set())
    for customer_id in active_customers:
      customer = customers.get(customer_id)
      if customer is None:
        continue
      before, after = _customer_day_state_bounds(session, customer_id=customer_id, day=current)
      problem_lines.extend(
        _snapshot_lines_for_customer(customer_id=customer_id, before=before, after=after)
      )

    # Company problems
    if current in company_activity_days or current in refill_days:
      company_before, company_after = _company_day_state_bounds(session, day=current)
      problem_lines.extend(
        _snapshot_lines_for_company(before=company_before, after=company_after)
      )

    card = DailyReportV2Card(
      date=current.isoformat(),
      cash_start=cash_start,
      cash_end=running_cash,
      cash_math=DailyReportV2CashMath(
        sales=customer_sales_by_day.get(current, 0),
        late=customer_pay_by_day.get(current, 0),
        expenses=expenses_by_day.get(current, 0),
        company=company_paid_by_day.get(current, 0),
        adjust=adjustments_by_day.get(current, 0),
      ),
      company_start=company_start,
      company_end=running_company,
      company_12kg_start=company_12_start,
      company_12kg_end=running_company_12,
      company_48kg_start=company_48_start,
      company_48kg_end=running_company_48,
      inventory_start=ReportInventoryTotals(
        full12=inv_12_full_start,
        empty12=inv_12_empty_start,
        full48=inv_48_full_start,
        empty48=inv_48_empty_start,
      ),
      inventory_end=ReportInventoryTotals(
        full12=running_full12,
        empty12=running_empty12,
        full48=running_full48,
        empty48=running_empty48,
      ),
      has_refill=current in refill_days,
      problems=[f"{line[0]}-{line[1]}: {line[2]}" if isinstance(line, tuple) else line for line in problem_lines],
    )
    response.append(card)

  return response


@router.get("/day_v2", response_model=DailyReportV2Day)
def get_daily_report_v2(
  day: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
) -> DailyReportV2Day:
  """Return full event feed for a single business date."""
  if day:
    try:
      report_day = datetime.fromisoformat(day).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid day format") from exc
  else:
    report_day = datetime.now(timezone.utc).date()

  # Load events for the day
  entries = session.exec(
    select(LedgerEntry)
    .where(LedgerEntry.day == report_day)
    .order_by(LedgerEntry.happened_at)
  ).all()

  customer_txns = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.day == report_day)
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).all()

  company_txns = session.exec(
    select(CompanyTransaction)
    .where(CompanyTransaction.day == report_day)
    .where(CompanyTransaction.is_reversed == False)  # noqa: E712
  ).all()

  expenses = session.exec(
    select(Expense)
    .where(Expense.day == report_day)
    .where(Expense.is_reversed == False)  # noqa: E712
  ).all()

  cash_adjustments = session.exec(
    select(CashAdjustment)
    .where(CashAdjustment.day == report_day)
    .where(CashAdjustment.is_reversed == False)  # noqa: E712
  ).all()

  inventory_adjustments = session.exec(
    select(InventoryAdjustment)
    .where(InventoryAdjustment.day == report_day)
    .where(InventoryAdjustment.is_reversed == False)  # noqa: E712
  ).all()

  # Get customer and system lookups
  customer_ids = {txn.customer_id for txn in customer_txns if txn.customer_id}
  customer_ids.update({e.customer_id for e in entries if e.customer_id})
  customers = {c.id: c for c in session.exec(select(Customer)).all() if c.id in customer_ids}

  system_ids = {txn.system_id for txn in customer_txns if txn.system_id}
  systems = {s.id: s for s in session.exec(select(System)).all() if s.id in system_ids}

  expense_cat_ids = {e.category_id for e in expenses if e.category_id}
  expense_categories = {
    c.id: c for c in session.exec(select(ExpenseCategory)).all() if c.id in expense_cat_ids
  }

  # Seeding initial customer states
  customer_before_states = _seed_customer_states_before_day(session, customer_ids=customer_ids, day=report_day)

  # Running balances
  running_customer_states: dict[str, CustomerLedgerState] = {
    cid: customer_before_states.get(cid, (0, 0, 0)) for cid in customer_ids
  }

  running_company_money = _sum_company_before_day(session, report_day)
  running_company_12 = _sum_company_cyl_before_day(session, report_day, "12kg")
  running_company_48 = _sum_company_cyl_before_day(session, report_day, "48kg")

  # Build event objects
  events: list[DailyReportV2Event] = []
  event_sort_ids: dict[int, str] = {}

  for txn in customer_txns:
    event = DailyReportV2Event(
      id=txn.id,
      source_id=txn.id,
      event_type="order" if txn.kind == "order" else "collection_money" if txn.kind == "payment" else "collection_empty" if txn.kind == "return" else txn.kind,
      effective_at=txn.happened_at,
      created_at=txn.created_at,
      customer_id=txn.customer_id,
      customer_name=customers[txn.customer_id].name if txn.customer_id and txn.customer_id in customers else None,
      customer_description=customers[txn.customer_id].note if txn.customer_id and txn.customer_id in customers else None,
      order_total=txn.total if txn.kind == "order" else None,
      order_paid=txn.paid if txn.kind == "order" else None,
      order_mode=txn.order_mode if hasattr(txn, "order_mode") else None,
      gas_type=txn.gas_type if hasattr(txn, "gas_type") else None,
    )
    events.append(event)
    event_sort_ids[id(event)] = txn.id or ""

  for txn in company_txns:
    event = DailyReportV2Event(
      id=txn.id,
      source_id=txn.id,
      event_type=txn.kind,
      effective_at=txn.happened_at,
      created_at=txn.created_at,
    )
    events.append(event)
    event_sort_ids[id(event)] = txn.id or ""

  for exp in expenses:
    event = DailyReportV2Event(
      id=exp.id,
      source_id=exp.id,
      event_type="expense",
      effective_at=exp.created_at,
      created_at=exp.created_at,
      total_cost=exp.amount,
      expense_type=expense_categories[exp.category_id].name if exp.category_id and exp.category_id in expense_categories else None,
    )
    events.append(event)
    event_sort_ids[id(event)] = exp.id or ""

  for ca in cash_adjustments:
    event = DailyReportV2Event(
      id=ca.id,
      source_id=ca.id,
      event_type="cash_adjust",
      effective_at=ca.happened_at,
      created_at=ca.created_at,
      total_cost=ca.delta_cash,
    )
    events.append(event)
    event_sort_ids[id(event)] = ca.id or ""

  for ia in inventory_adjustments:
    event = DailyReportV2Event(
      id=ia.id,
      source_id=ia.id,
      event_type="adjust",
      effective_at=ia.happened_at,
      created_at=ia.created_at,
    )
    events.append(event)
    event_sort_ids[id(event)] = ia.id or ""

  # Get settings
  settings = session.get(SystemSettings, "system")
  money_decimals = settings.money_decimals if settings else 2

  # Apply fields in order: ticket → level3 → UI → status
  for event in events:
    # Ticket fields
    _apply_ticket_fields(event)

    # Get customer state after this event
    customer_after = None
    if event.customer_id and event.customer_id in running_customer_states:
      entries_for_customer = [e for e in entries if e.customer_id == event.customer_id and e.happened_at <= event.happened_at]
      if entries_for_customer:
        delta = _customer_state_delta_from_entries(entries_for_customer)
        before = customer_before_states.get(event.customer_id, (0, 0, 0))
        customer_after = _add_customer_state(before, delta)

    # Level3 fields
    _apply_level3_fields(event, customer_after=customer_after)

    # Get company state after this event
    company_money_after = _sum_cash_at_day_end(session, report_day)
    company_12_after = _sum_company_cyl_at_day_end(session, report_day, "12kg")
    company_48_after = _sum_company_cyl_at_day_end(session, report_day, "48kg")
    event.company_after = company_money_after
    event.company_12kg_after = company_12_after
    event.company_48kg_after = company_48_after

    # UI fields
    notes = _notes_for_event(event)
    _apply_ui_fields(event, money_decimals=money_decimals, notes=notes)

    # Status fields
    _apply_status_fields(event)

    # Remaining actions
    event.action_pills = _remaining_actions_for_event(event, customer_after=customer_after)

  # Sort events
  events.sort(key=lambda e: _event_order_key(e, event_sort_ids=event_sort_ids))

  # Get audit summary
  audit_summary = get_daily_audit_summary(session, day=report_day)

  return DailyReportV2Day(
    day=report_day,
    events=events,
    audit_summary=audit_summary,
  )
