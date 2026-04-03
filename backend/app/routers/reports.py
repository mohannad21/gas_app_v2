"""Reports router - daily reporting endpoints.

Public routes for generating daily financial reports with event feeds and balance tracking.
All helper logic delegated to reports_aggregates and reports_event_fields service modules.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.auth import get_tenant_id
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
  DailyReportV2Day,
  DailyReportV2Event,
  ReportInventoryTotals,
)
from app.services.reports_aggregates import (
  _date_range,
  _sum_inventory_at_day_end,
  _sum_inventory_before_day,
  _sum_cash_at_day_end,
  _sum_cash_before_day,
  _sum_bank_before_day,
  _sum_company_at_day_end,
  _sum_company_before_day,
  _sum_company_cyl_at_day_end,
  _sum_company_cyl_before_day,
  _seed_customer_states_before_day,
  _customer_balance_transitions,
  _company_balance_transitions,
  _event_order_key,
  _daily_deltas,
  _sold_full_by_day,
  _customer_day_state_bounds,
  _company_day_state_bounds,
  _snapshot_transitions_for_customer,
  _snapshot_transitions_for_company,
  _snapshot_lines_for_customer,
  _snapshot_lines_for_company,
  _report_inventory_state,
  _apply_ledger_entries_to_balances,
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
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/daily_v2", response_model=list[DailyReportV2Card])
def list_daily_reports_v2(
  from_: Optional[str] = Query(default=None, alias="from"),
  to: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
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
      .where(CompanyTransaction.tenant_id == tenant_id)
      .where(CompanyTransaction.day >= start_date)
      .where(CompanyTransaction.day <= end_date)
      .where(CompanyTransaction.kind.in_(["refill", "buy_iron"]))
      .where(CompanyTransaction.deleted_at == None)  # noqa: E711
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
  customers = {
    c.id: c for c in session.exec(
      select(Customer)
      .where(Customer.tenant_id == tenant_id)
    ).all()
  }

  # Load activity data for problem identification
  customer_activity_rows = session.exec(
    select(CustomerTransaction.day, CustomerTransaction.customer_id, CustomerTransaction.kind)
    .where(CustomerTransaction.tenant_id == tenant_id)
    .where(CustomerTransaction.day >= start_date)
    .where(CustomerTransaction.day <= end_date)
    .where(CustomerTransaction.deleted_at == None)  # noqa: E711
  ).all()
  customer_activity_by_day: dict[date, set[str]] = defaultdict(set)
  customer_activity_kinds: dict[tuple[date, str], set[str]] = defaultdict(set)
  for day, customer_id, kind in customer_activity_rows:
    if customer_id:
      customer_activity_by_day[day].add(customer_id)
      customer_activity_kinds[(day, customer_id)].add(kind)

  company_activity_rows = session.exec(
    select(CompanyTransaction.day)
    .where(CompanyTransaction.tenant_id == tenant_id)
    .where(CompanyTransaction.day >= start_date)
    .where(CompanyTransaction.day <= end_date)
    .where(CompanyTransaction.deleted_at == None)  # noqa: E711
  ).all()
  company_activity_days = {row[0] if isinstance(row, tuple) else row for row in company_activity_rows}

  customer_sales_rows = session.exec(
    select(CustomerTransaction.day, func.coalesce(func.sum(CustomerTransaction.paid), 0))
    .where(CustomerTransaction.tenant_id == tenant_id)
    .where(CustomerTransaction.day >= start_date)
    .where(CustomerTransaction.day <= end_date)
    .where(CustomerTransaction.kind == "order")
    .where(CustomerTransaction.deleted_at == None)  # noqa: E711
    .group_by(CustomerTransaction.day)
  ).all()
  customer_sales_by_day = {row[0]: int(row[1] or 0) for row in customer_sales_rows}

  customer_pay_rows = session.exec(
    select(CustomerTransaction.day, func.coalesce(func.sum(CustomerTransaction.paid), 0))
    .where(CustomerTransaction.tenant_id == tenant_id)
    .where(CustomerTransaction.day >= start_date)
    .where(CustomerTransaction.day <= end_date)
    .where(CustomerTransaction.kind == "payment")
    .where(CustomerTransaction.deleted_at == None)  # noqa: E711
    .group_by(CustomerTransaction.day)
  ).all()
  customer_pay_by_day = {row[0]: int(row[1] or 0) for row in customer_pay_rows}

  company_paid_rows = session.exec(
    select(CompanyTransaction.day, func.coalesce(func.sum(CompanyTransaction.paid), 0))
    .where(CompanyTransaction.tenant_id == tenant_id)
    .where(CompanyTransaction.day >= start_date)
    .where(CompanyTransaction.day <= end_date)
    .where(CompanyTransaction.deleted_at == None)  # noqa: E711
    .group_by(CompanyTransaction.day)
  ).all()
  company_paid_by_day = {row[0]: int(row[1] or 0) for row in company_paid_rows}

  expense_rows = session.exec(
    select(Expense.day, func.coalesce(func.sum(Expense.amount), 0))
    .where(Expense.tenant_id == tenant_id)
    .where(Expense.day >= start_date)
    .where(Expense.day <= end_date)
    .where(Expense.kind == "expense")
    .where(Expense.deleted_at == None)  # noqa: E711
    .group_by(Expense.day)
  ).all()
  expenses_by_day = {row[0]: int(row[1] or 0) for row in expense_rows}

  adjustment_rows = session.exec(
    select(CashAdjustment.day, func.coalesce(func.sum(CashAdjustment.delta_cash), 0))
    .where(CashAdjustment.tenant_id == tenant_id)
    .where(CashAdjustment.day >= start_date)
    .where(CashAdjustment.day <= end_date)
    .where(CashAdjustment.deleted_at == None)  # noqa: E711
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
    problem_transitions = []

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
      problem_transitions.extend(
        _snapshot_transitions_for_customer(before=before, after=after)
      )

    # Company problems
    if current in company_activity_days or current in refill_days:
      company_before, company_after = _company_day_state_bounds(session, day=current)
      problem_lines.extend(
        _snapshot_lines_for_company(before=company_before, after=company_after)
      )
      problem_transitions.extend(
        _snapshot_transitions_for_company(
          money_before=company_before[0],
          money_after=company_after[0],
          cyl12_before=company_before[1],
          cyl12_after=company_after[1],
          cyl48_before=company_before[2],
          cyl48_after=company_after[2],
        )
      )

    card = DailyReportV2Card(
      date=current.isoformat(),
      cash_start=cash_start,
      cash_end=running_cash,
      sold_12kg=sold_full.get((current, "12kg"), 0),
      sold_48kg=sold_full.get((current, "48kg"), 0),
      net_today=running_cash - cash_start,
      cash_math=DailyReportV2CashMath(
        sales=customer_sales_by_day.get(current, 0),
        late=customer_pay_by_day.get(current, 0),
        expenses=expenses_by_day.get(current, 0),
        company=company_paid_by_day.get(current, 0),
        adjust=adjustments_by_day.get(current, 0),
        other=0,
      ),
      math=None,
      company_start=company_start,
      company_end=running_company,
      company_12kg_start=company_12_start,
      company_12kg_end=running_company_12,
      company_48kg_start=company_48_start,
      company_48kg_end=running_company_48,
      company_give_start=0,
      company_give_end=0,
      company_receive_start=0,
      company_receive_end=0,
      company_12kg_give_start=0,
      company_12kg_give_end=0,
      company_12kg_receive_start=0,
      company_12kg_receive_end=0,
      company_48kg_give_start=0,
      company_48kg_give_end=0,
      company_48kg_receive_start=0,
      company_48kg_receive_end=0,
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
      problem_transitions=problem_transitions,
      recalculated=False,
    )
    response.append(card)

  return response


@router.get("/day_v2", response_model=DailyReportV2Day)
def get_daily_report_v2(
  date: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> DailyReportV2Day:
  """Return full event feed for a single business date."""
  if date:
    try:
      report_day = datetime.fromisoformat(date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
  else:
    report_day = datetime.now(timezone.utc).date()

  # Load events for the day
  entries = session.exec(
    select(LedgerEntry)
    .where(LedgerEntry.tenant_id == tenant_id)
    .where(LedgerEntry.day == report_day)
    .order_by(LedgerEntry.happened_at)
  ).all()

  customer_txns = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.tenant_id == tenant_id)
    .where(CustomerTransaction.day == report_day)
    .where(CustomerTransaction.deleted_at == None)  # noqa: E711
  ).all()

  company_txns = session.exec(
    select(CompanyTransaction)
    .where(CompanyTransaction.tenant_id == tenant_id)
    .where(CompanyTransaction.day == report_day)
    .where(CompanyTransaction.deleted_at == None)  # noqa: E711
  ).all()

  expenses = session.exec(
    select(Expense)
    .where(Expense.tenant_id == tenant_id)
    .where(Expense.day == report_day)
    .where(Expense.deleted_at == None)  # noqa: E711
  ).all()

  cash_adjustments = session.exec(
    select(CashAdjustment)
    .where(CashAdjustment.tenant_id == tenant_id)
    .where(CashAdjustment.day == report_day)
    .where(CashAdjustment.deleted_at == None)  # noqa: E711
  ).all()

  inventory_adjustments = session.exec(
    select(InventoryAdjustment)
    .where(InventoryAdjustment.tenant_id == tenant_id)
    .where(InventoryAdjustment.day == report_day)
    .where(InventoryAdjustment.deleted_at == None)  # noqa: E711
  ).all()

  # Get customer and system lookups
  customer_ids = {txn.customer_id for txn in customer_txns if txn.customer_id}
  customer_ids.update({e.customer_id for e in entries if e.customer_id})
  customers = {
    c.id: c for c in session.exec(
      select(Customer)
      .where(Customer.tenant_id == tenant_id)
    ).all() if c.id in customer_ids
  }

  system_ids = {txn.system_id for txn in customer_txns if txn.system_id}
  systems = {
    s.id: s for s in session.exec(
      select(System)
      .where(System.tenant_id == tenant_id)
    ).all() if s.id in system_ids
  }

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

  running_cash = _sum_cash_before_day(session, report_day)
  running_bank = _sum_bank_before_day(session, report_day)
  running_company_money = _sum_company_before_day(session, report_day)
  running_company_12 = _sum_company_cyl_before_day(session, report_day, "12kg")
  running_company_48 = _sum_company_cyl_before_day(session, report_day, "48kg")
  running_inventory = _sum_inventory_before_day(session, report_day)

  # Build event objects
  events: list[DailyReportV2Event] = []
  event_sort_ids: dict[int, str] = {}
  event_source_keys: dict[int, tuple[str, str]] = {}

  entries_by_source: dict[tuple[str, str], list[LedgerEntry]] = defaultdict(list)
  for entry in entries:
    entries_by_source[(entry.source_type, entry.source_id)].append(entry)

  for txn in customer_txns:
    event = DailyReportV2Event(
      id=txn.id,
      source_id=txn.id,
      event_type="order" if txn.kind == "order" else "collection_money" if txn.kind == "payment" else "collection_empty" if txn.kind == "return" else "collection_payout" if txn.kind == "payout" else "customer_adjust" if txn.kind == "adjust" else txn.kind,
      effective_at=txn.happened_at,
      created_at=txn.created_at,
      customer_id=txn.customer_id,
      customer_name=customers[txn.customer_id].name if txn.customer_id and txn.customer_id in customers else None,
      customer_description=customers[txn.customer_id].note if txn.customer_id and txn.customer_id in customers else None,
      order_total=txn.total if txn.kind == "order" else None,
      order_paid=txn.paid if txn.kind == "order" else None,
      order_mode=txn.mode if txn.kind == "order" else None,
      gas_type=txn.gas_type,
      system_name=systems[txn.system_id].name if txn.system_id and txn.system_id in systems else None,
      system_type=systems[txn.system_id].gas_type if txn.system_id and txn.system_id in systems else None,
      reason=txn.note,
      order_installed=txn.installed if txn.kind == "order" else None,
      order_received=txn.received if txn.kind == "order" else None,
      return12=txn.received if txn.kind == "return" and txn.gas_type == "12kg" else None,
      return48=txn.received if txn.kind == "return" and txn.gas_type == "48kg" else None,
    )
    events.append(event)
    event_sort_ids[id(event)] = txn.id or ""
    event_source_keys[id(event)] = ("customer_txn", txn.id)

  for txn in company_txns:
    event = DailyReportV2Event(
      id=txn.id,
      source_id=txn.id,
      event_type="refill" if txn.kind == "refill" else "company_buy_iron" if txn.kind == "buy_iron" else "company_payment" if txn.kind == "payment" else "company_adjustment" if txn.kind == "adjust" else txn.kind,
      effective_at=txn.happened_at,
      created_at=txn.created_at,
      reason=txn.note,
      buy12=txn.buy12,
      return12=txn.return12,
      buy48=txn.buy48,
      return48=txn.return48,
      total_cost=txn.total,
      paid_now=txn.paid,
    )
    events.append(event)
    event_sort_ids[id(event)] = txn.id or ""
    event_source_keys[id(event)] = ("company_txn", txn.id)

  for exp in expenses:
    event = DailyReportV2Event(
      id=exp.id,
      source_id=exp.id,
      event_type="bank_deposit" if exp.kind == "deposit" else "expense",
      effective_at=exp.happened_at,
      created_at=exp.created_at,
      total_cost=exp.amount,
      expense_type=expense_categories[exp.category_id].name if exp.kind == "expense" and exp.category_id and exp.category_id in expense_categories else None,
      transfer_direction="bank_to_wallet" if exp.kind == "deposit" and exp.paid_from == "bank" else "wallet_to_bank" if exp.kind == "deposit" else None,
      reason=exp.note,
    )
    events.append(event)
    event_sort_ids[id(event)] = exp.id or ""
    event_source_keys[id(event)] = ("expense", exp.id)

  for ca in cash_adjustments:
    event = DailyReportV2Event(
      id=ca.id,
      source_id=ca.id,
      event_type="cash_adjust",
      effective_at=ca.happened_at,
      created_at=ca.created_at,
      total_cost=ca.delta_cash,
      reason=ca.note,
    )
    events.append(event)
    event_sort_ids[id(event)] = ca.id or ""
    event_source_keys[id(event)] = ("cash_adjust", ca.id)

  for ia in inventory_adjustments:
    event = DailyReportV2Event(
      id=ia.id,
      source_id=ia.id,
      event_type="adjust",
      effective_at=ia.happened_at,
      created_at=ia.created_at,
      gas_type=ia.gas_type,
      reason=ia.note,
    )
    events.append(event)
    event_sort_ids[id(event)] = ia.id or ""
    event_source_keys[id(event)] = ("inventory_adjust", ia.id)

  # Get settings
  settings = session.get(SystemSettings, "system")
  money_decimals = settings.money_decimals if settings else 2

  events.sort(key=lambda e: _event_order_key(e, event_sort_ids=event_sort_ids))

  # Apply fields in order: ticket -> level3 -> status -> remaining actions -> UI
  for event in events:
    customer_before = running_customer_states.get(event.customer_id, (0, 0, 0)) if event.customer_id else None
    company_before = (running_company_money, running_company_12, running_company_48)

    event.cash_before = running_cash
    event.bank_before = running_bank
    if customer_before is not None:
      event.customer_money_before = customer_before[0]
      event.customer_12kg_before = customer_before[1]
      event.customer_48kg_before = customer_before[2]
    event.company_before = running_company_money
    event.company_12kg_before = running_company_12
    event.company_48kg_before = running_company_48
    event.inventory_before = _report_inventory_state(running_inventory)

    source_key = event_source_keys.get(id(event))
    event_entries = entries_by_source.get(source_key, []) if source_key else []
    running_cash, running_bank, running_company_money, running_company_12, running_company_48, running_inventory = _apply_ledger_entries_to_balances(
      event_entries,
      cash=running_cash,
      bank=running_bank,
      company_money=running_company_money,
      company_12=running_company_12,
      company_48=running_company_48,
      inventory=running_inventory,
      customer_states=running_customer_states,
    )

    customer_after = running_customer_states.get(event.customer_id, customer_before) if event.customer_id else None

    event.cash_after = running_cash
    event.bank_after = running_bank
    if customer_after is not None:
      event.customer_money_after = customer_after[0]
      event.customer_12kg_after = customer_after[1]
      event.customer_48kg_after = customer_after[2]
    event.company_after = running_company_money
    event.company_12kg_after = running_company_12
    event.company_48kg_after = running_company_48
    event.inventory_after = _report_inventory_state(running_inventory)

    balance_transitions = []
    if customer_before is not None and customer_after is not None:
      balance_transitions.extend(
        _customer_balance_transitions(
          before=customer_before,
          after=customer_after,
          display_name=event.customer_name,
          display_description=event.customer_description,
        )
      )
    balance_transitions.extend(
      _company_balance_transitions(
        money_before=company_before[0],
        money_after=running_company_money,
        cyl12_before=company_before[1],
        cyl12_after=running_company_12,
        cyl48_before=company_before[2],
        cyl48_after=running_company_48,
      )
    )
    event.balance_transitions = balance_transitions

    # Ticket fields
    _apply_ticket_fields(event)

    # Level3 fields
    _apply_level3_fields(event, customer_after=customer_after)

    # Status fields
    _apply_status_fields(event)

    # Remaining actions
    event.action_pills = _remaining_actions_for_event(event, customer_after=customer_after)

    # UI fields
    notes = _notes_for_event(event)
    _apply_ui_fields(event, money_decimals=money_decimals, notes=notes)

  # Get audit summary
  audit_summary = get_daily_audit_summary(session, day=report_day)

  return DailyReportV2Day(
    date=report_day.isoformat(),
    cash_start=_sum_cash_before_day(session, report_day),
    cash_end=_sum_cash_at_day_end(session, report_day),
    company_start=_sum_company_before_day(session, report_day),
    company_end=_sum_company_at_day_end(session, report_day),
    company_12kg_start=_sum_company_cyl_before_day(session, report_day, "12kg"),
    company_12kg_end=_sum_company_cyl_at_day_end(session, report_day, "12kg"),
    company_48kg_start=_sum_company_cyl_before_day(session, report_day, "48kg"),
    company_48kg_end=_sum_company_cyl_at_day_end(session, report_day, "48kg"),
    company_give_start=0,
    company_give_end=0,
    company_receive_start=0,
    company_receive_end=0,
    company_12kg_give_start=0,
    company_12kg_give_end=0,
    company_12kg_receive_start=0,
    company_12kg_receive_end=0,
    company_48kg_give_start=0,
    company_48kg_give_end=0,
    company_48kg_receive_start=0,
    company_48kg_receive_end=0,
    inventory_start=_sum_inventory_before_day(session, report_day),
    inventory_end=_sum_inventory_at_day_end(session, report_day),
    audit_summary=audit_summary,
    events=events,
  )
