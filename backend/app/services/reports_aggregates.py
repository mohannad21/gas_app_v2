"""Reports data aggregation and ledger math helpers.

Handles all database aggregation, ledger sum calculations, balance transitions,
and snapshot builders for the daily reporting system.
"""

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from app.models import LedgerEntry
from app.schemas import BalanceTransition, DailyAuditSummary, DailyReportEvent, ReportInventoryState, ReportInventoryTotals
from app.services.ledger import sum_ledger


# Type alias for customer ledger state: (money_debt, cyl12_debt, cyl48_debt)
CustomerLedgerState = tuple[int, int, int]


def _date_range(start: date, end: date) -> list[date]:
  if end < start:
    return []
  days = (end - start).days
  return [start + timedelta(days=offset) for offset in range(days + 1)]


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


def _sum_bank_at_day_end(session: Session, day: date) -> int:
  return sum_ledger(session, account="bank", unit="money", day_to=day)


def _sum_bank_before_day(session: Session, day: date) -> int:
  prev = day - timedelta(days=1)
  return _sum_bank_at_day_end(session, prev)


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


def _seed_customer_states_before_day(
  session: Session,
  *,
  customer_ids: set[str],
  day: date,
) -> dict[str, CustomerLedgerState]:
  if not customer_ids:
    return {}

  prev = day - timedelta(days=1)
  seeded: dict[str, list[int]] = {customer_id: [0, 0, 0] for customer_id in customer_ids}
  rows = session.exec(
    select(
      LedgerEntry.customer_id,
      LedgerEntry.account,
      LedgerEntry.gas_type,
      func.coalesce(func.sum(LedgerEntry.amount), 0),
    )
    .where(LedgerEntry.customer_id.in_(list(customer_ids)))
    .where(LedgerEntry.day <= prev)
    .where(
      or_(
        and_(LedgerEntry.account == "cust_money_debts", LedgerEntry.unit == "money"),
        and_(
          LedgerEntry.account == "cust_cylinders_debts",
          LedgerEntry.unit == "count",
          LedgerEntry.state == "empty",
        ),
      )
    )
    .group_by(LedgerEntry.customer_id, LedgerEntry.account, LedgerEntry.gas_type)
  ).all()

  for customer_id, account, gas_type, amount in rows:
    if not customer_id:
      continue
    state = seeded.setdefault(customer_id, [0, 0, 0])
    if account == "cust_money_debts":
      state[0] = int(amount or 0)
    elif account == "cust_cylinders_debts" and gas_type == "12kg":
      state[1] = int(amount or 0)
    elif account == "cust_cylinders_debts" and gas_type == "48kg":
      state[2] = int(amount or 0)

  return {
    customer_id: (state[0], state[1], state[2])
    for customer_id, state in seeded.items()
  }


def _customer_state_delta_from_entries(entries: list[LedgerEntry]) -> CustomerLedgerState:
  return (
    sum(row.amount for row in entries if row.account == "cust_money_debts"),
    sum(
      row.amount
      for row in entries
      if row.account == "cust_cylinders_debts" and row.gas_type == "12kg"
    ),
    sum(
      row.amount
      for row in entries
      if row.account == "cust_cylinders_debts" and row.gas_type == "48kg"
    ),
  )


def _add_customer_state(state: CustomerLedgerState, delta: CustomerLedgerState) -> CustomerLedgerState:
  return (
    state[0] + delta[0],
    state[1] + delta[1],
    state[2] + delta[2],
  )


def _report_inventory_state(totals: ReportInventoryTotals) -> ReportInventoryState:
  return ReportInventoryState(
    full12=totals.full12,
    empty12=totals.empty12,
    full48=totals.full48,
    empty48=totals.empty48,
  )


def _apply_ledger_entries_to_balances(
  entries: list[LedgerEntry],
  *,
  cash: int,
  bank: int,
  company_money: int,
  company_12: int,
  company_48: int,
  inventory: ReportInventoryTotals,
  customer_states: dict[str, CustomerLedgerState],
) -> tuple[int, int, int, int, int, ReportInventoryTotals]:
  next_inventory = ReportInventoryTotals(
    full12=inventory.full12,
    empty12=inventory.empty12,
    full48=inventory.full48,
    empty48=inventory.empty48,
  )

  for row in entries:
    if row.account == "cash" and row.unit == "money":
      cash += row.amount
      continue
    if row.account == "bank" and row.unit == "money":
      bank += row.amount
      continue
    if row.account == "company_money_debts" and row.unit == "money":
      company_money += row.amount
      continue
    if row.account == "company_cylinders_debts" and row.unit == "count":
      if row.gas_type == "12kg":
        company_12 += row.amount
      elif row.gas_type == "48kg":
        company_48 += row.amount
      continue
    if row.account == "cust_money_debts" and row.unit == "money" and row.customer_id:
      before = customer_states.get(row.customer_id, (0, 0, 0))
      customer_states[row.customer_id] = (before[0] + row.amount, before[1], before[2])
      continue
    if row.account == "cust_cylinders_debts" and row.unit == "count" and row.customer_id:
      before = customer_states.get(row.customer_id, (0, 0, 0))
      if row.gas_type == "12kg":
        customer_states[row.customer_id] = (before[0], before[1] + row.amount, before[2])
      elif row.gas_type == "48kg":
        customer_states[row.customer_id] = (before[0], before[1], before[2] + row.amount)
      continue
    if row.account == "inv" and row.unit == "count":
      if row.gas_type == "12kg" and row.state == "full":
        next_inventory.full12 += row.amount
      elif row.gas_type == "12kg" and row.state == "empty":
        next_inventory.empty12 += row.amount
      elif row.gas_type == "48kg" and row.state == "full":
        next_inventory.full48 += row.amount
      elif row.gas_type == "48kg" and row.state == "empty":
        next_inventory.empty48 += row.amount

  return (cash, bank, company_money, company_12, company_48, next_inventory)


def _balance_transition(
  *,
  scope: str,
  component: str,
  before: int,
  after: int,
  display_name: Optional[str] = None,
  display_description: Optional[str] = None,
  intent: Optional[str] = None,
) -> BalanceTransition:
  return BalanceTransition(
    scope=scope,
    component=component,
    before=int(before or 0),
    after=int(after or 0),
    display_name=display_name,
    display_description=display_description,
    intent=intent,
  )


def _append_transition(
  transitions: list[BalanceTransition],
  *,
  scope: str,
  component: str,
  before: int,
  after: int,
  include_static: bool = False,
  display_name: Optional[str] = None,
  display_description: Optional[str] = None,
  intent: Optional[str] = None,
) -> None:
  if before == after and (after == 0 or not include_static):
    return
  transitions.append(
    _balance_transition(
      scope=scope,
      component=component,
      before=before,
      after=after,
      display_name=display_name,
      display_description=display_description,
      intent=intent,
    )
  )


def _customer_balance_transitions(
  *,
  before: CustomerLedgerState,
  after: CustomerLedgerState,
  include_static: bool = False,
  display_name: Optional[str] = None,
  display_description: Optional[str] = None,
  intent: Optional[str] = None,
) -> list[BalanceTransition]:
  transitions: list[BalanceTransition] = []
  _append_transition(
    transitions,
    scope="customer",
    component="money",
    before=before[0],
    after=after[0],
    include_static=include_static,
    display_name=display_name,
    display_description=display_description,
    intent=intent,
  )
  _append_transition(
    transitions,
    scope="customer",
    component="cyl_12",
    before=before[1],
    after=after[1],
    include_static=include_static,
    display_name=display_name,
    display_description=display_description,
    intent=intent,
  )
  _append_transition(
    transitions,
    scope="customer",
    component="cyl_48",
    before=before[2],
    after=after[2],
    include_static=include_static,
    display_name=display_name,
    display_description=display_description,
    intent=intent,
  )
  return transitions


def _event_order_key(
  event: DailyReportEvent,
  *,
  event_sort_ids: dict[int, str],
) -> tuple:
  return (
    event.effective_at,
    event.created_at,
    event_sort_ids.get(id(event), event.id or event.source_id or event.event_type or ""),
  )


def _company_balance_transitions(
  *,
  money_before: int,
  money_after: int,
  cyl12_before: int,
  cyl12_after: int,
  cyl48_before: int,
  cyl48_after: int,
  include_static: bool = False,
) -> list[BalanceTransition]:
  transitions: list[BalanceTransition] = []
  _append_transition(
    transitions,
    scope="company",
    component="money",
    before=money_before,
    after=money_after,
    include_static=include_static,
  )
  _append_transition(
    transitions,
    scope="company",
    component="cyl_12",
    before=cyl12_before,
    after=cyl12_after,
    include_static=include_static,
  )
  _append_transition(
    transitions,
    scope="company",
    component="cyl_48",
    before=cyl48_before,
    after=cyl48_after,
    include_static=include_static,
  )
  return transitions


def _daily_deltas(
  session: Session,
  *,
  account: str,
  gas_type: Optional[str] = None,
  state: Optional[str] = None,
  unit: str,
  date_start: date,
  date_end: date,
) -> dict[date, int]:
  rows = session.exec(
    select(
      LedgerEntry.day,
      func.coalesce(func.sum(LedgerEntry.amount), 0),
    )
    .where(LedgerEntry.account == account)
    .where(LedgerEntry.unit == unit)
    .where(LedgerEntry.day >= date_start)
    .where(LedgerEntry.day <= date_end)
    .where(
      LedgerEntry.gas_type == gas_type if gas_type else True
    )
    .where(
      LedgerEntry.state == state if state else True
    )
    .group_by(LedgerEntry.day)
  ).all()
  return {day: int(delta or 0) for day, delta in rows}


def _sold_full_by_day(
  session: Session,
  *,
  date_start: date,
  date_end: date,
) -> dict[tuple[date, str], int]:
  rows = session.exec(
    select(
      LedgerEntry.day,
      LedgerEntry.gas_type,
      func.coalesce(func.sum(LedgerEntry.amount), 0),
    )
    .where(LedgerEntry.account == "inv")
    .where(LedgerEntry.state == "full")
    .where(LedgerEntry.unit == "count")
    .where(LedgerEntry.day >= date_start)
    .where(LedgerEntry.day <= date_end)
    .group_by(LedgerEntry.day, LedgerEntry.gas_type)
  ).all()
  return {(day, gas_type): int(qty or 0) for day, gas_type, qty in rows}


def _cash_math_by_day(
  session: Session,
  *,
  date_start: date,
  date_end: date,
) -> dict[date, dict[str, int]]:
  result: dict[date, dict[str, int]] = {}

  # Simplified aggregation — the original had complex logic
  # This just queries the ledger and categorizes by source
  rows = session.exec(
    select(
      LedgerEntry.day,
      LedgerEntry.source_type,
      func.coalesce(func.sum(LedgerEntry.amount), 0),
    )
    .where(LedgerEntry.account == "cash")
    .where(LedgerEntry.unit == "money")
    .where(LedgerEntry.day >= date_start)
    .where(LedgerEntry.day <= date_end)
    .group_by(LedgerEntry.day, LedgerEntry.source_type)
  ).all()

  for day, source_type, amount in rows:
    if day not in result:
      result[day] = {"sales": 0, "late": 0, "expenses": 0, "company": 0, "adjust": 0, "other": 0}
    category = source_type or "other"
    result[day][category] = int(amount or 0)

  return result


def _customer_day_state_bounds(
  session: Session,
  *,
  customer_id: str,
  day: date,
) -> tuple[CustomerLedgerState, CustomerLedgerState]:
  before_state = _seed_customer_states_before_day(session, customer_ids={customer_id}, day=day).get(customer_id, (0, 0, 0))

  # Get entries for the day
  entries = session.exec(
    select(LedgerEntry)
    .where(LedgerEntry.customer_id == customer_id)
    .where(LedgerEntry.day == day)
  ).all()

  delta = _customer_state_delta_from_entries(entries)
  after_state = _add_customer_state(before_state, delta)

  return (before_state, after_state)


def _company_day_state_bounds(
  session: Session,
  *,
  day: date,
) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
  money_before = _sum_company_before_day(session, day)
  money_after = _sum_company_at_day_end(session, day)
  cyl12_before = _sum_company_cyl_before_day(session, day, "12kg")
  cyl12_after = _sum_company_cyl_at_day_end(session, day, "12kg")
  cyl48_before = _sum_company_cyl_before_day(session, day, "48kg")
  cyl48_after = _sum_company_cyl_at_day_end(session, day, "48kg")

  return ((money_before, cyl12_before, cyl48_before), (money_after, cyl12_after, cyl48_after))


def _snapshot_transitions_for_customer(
  *,
  before: CustomerLedgerState,
  after: CustomerLedgerState,
  intent: Optional[str] = None,
) -> list[BalanceTransition]:
  return _customer_balance_transitions(before=before, after=after, include_static=True, intent=intent)


def _snapshot_transitions_for_company(
  *,
  money_before: int,
  money_after: int,
  cyl12_before: int,
  cyl12_after: int,
  cyl48_before: int,
  cyl48_after: int,
) -> list[BalanceTransition]:
  return _company_balance_transitions(
    money_before=money_before,
    money_after=money_after,
    cyl12_before=cyl12_before,
    cyl12_after=cyl12_after,
    cyl48_before=cyl48_before,
    cyl48_after=cyl48_after,
    include_static=True,
  )


def _snapshot_lines_for_customer(
  *,
  customer_id: str,
  before: CustomerLedgerState,
  after: CustomerLedgerState,
) -> list[tuple[str, str, str]]:
  """Returns snapshot output lines (customer_id, problem_type, description)."""
  lines: list[tuple[str, str, str]] = []
  money_before, cyl12_before, cyl48_before = before
  money_after, cyl12_after, cyl48_after = after

  if money_after > 0:
    lines.append((customer_id, "cash_outstanding", f"₪{money_after}"))
  if cyl12_after > 0:
    lines.append((customer_id, "cyl12_outstanding", f"{cyl12_after}x12kg"))
  if cyl48_after > 0:
    lines.append((customer_id, "cyl48_outstanding", f"{cyl48_after}x48kg"))

  return lines


def _snapshot_lines_for_company(
  *,
  before: tuple[int, int, int],
  after: tuple[int, int, int],
) -> list[tuple[str, str, str]]:
  """Returns snapshot output lines (type, category, value)."""
  lines: list[tuple[str, str, str]] = []
  money_before, cyl12_before, cyl48_before = before
  money_after, cyl12_after, cyl48_after = after

  if money_after > 0:
    lines.append(("company", "cash_outstanding", f"₪{money_after}"))
  if cyl12_after > 0:
    lines.append(("company", "cyl12_outstanding", f"{cyl12_after}x12kg"))
  if cyl48_after > 0:
    lines.append(("company", "cyl48_outstanding", f"{cyl48_after}x48kg"))

  return lines


def get_daily_audit_summary(
  session: Session,
  *,
  day: date,
) -> DailyAuditSummary:
  """Public function: compute daily audit summary with cash, debt, and inventory deltas."""
  cash_before = _sum_cash_before_day(session, day)
  cash_after = _sum_cash_at_day_end(session, day)
  cash_delta = cash_after - cash_before

  inv_before = _sum_inventory_before_day(session, day)
  inv_after = _sum_inventory_at_day_end(session, day)

  company_before = _sum_company_before_day(session, day)
  company_after = _sum_company_at_day_end(session, day)
  company_delta = company_after - company_before

  inv_delta_12 = (inv_after.full12 - inv_before.full12) + (inv_after.empty12 - inv_before.empty12)
  inv_delta_48 = (inv_after.full48 - inv_before.full48) + (inv_after.empty48 - inv_before.empty48)

  return DailyAuditSummary(
    cash_in=cash_delta,
    new_debt=company_delta,
    inv_delta_12=inv_delta_12,
    inv_delta_48=inv_delta_48,
  )
