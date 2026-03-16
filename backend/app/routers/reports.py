from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
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
  DailyAuditSummary,
  BalanceTransition,
  DailyReportV2Card,
  DailyReportV2CashMath,
  DailyReportV2Math,
  DailyReportV2Day,
  DailyReportV2Event,
  ActivityNote,
  Level3Action,
  Level3Counterparty,
  Level3Hero,
  Level3Money,
  Level3Settlement,
  Level3SettlementComponents,
  Level3System,
  ReportInventoryState,
  ReportInventoryTotals,
)
from app.services.ledger import boundary_from_entries, sum_ledger

router = APIRouter(prefix="/reports", tags=["reports"])


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


_EVENT_LABELS: dict[str, str] = {
  "refill": "Refill",
  "company_buy_iron": "Buy Iron",
  "collection_money": "Late Pay",
  "collection_empty": "Return Emp",
  "company_payment": "Pay Company",
  "expense": "Expense",
  "bank_deposit": "Deposit",
  "adjust": "Inventory Adjust",
  "cash_adjust": "Cash Adjust",
  "collection_payout": "Customer Payout",
  "customer_adjust": "Customer Adjust",
  "init": "System Init",
}

_ORDER_LABELS: dict[str, str] = {
  "replacement": "Replace",
  "sell_iron": "Sell Full",
  "buy_iron": "Buy Empty",
}


def _titleize_event_type(event_type: str) -> str:
  return " ".join(part.capitalize() for part in event_type.split("_"))


def _customer_identity(customer: Optional[Customer]) -> tuple[Optional[str], Optional[str]]:
  if customer is None:
    return ("Deleted customer", "Missing customer")
  return (customer.name, customer.note)


def _event_label(event: DailyReportV2Event) -> str:
  if event.event_type == "order":
    if event.order_mode:
      return _ORDER_LABELS.get(event.order_mode, "Order")
    return "Order"
  if event.event_type == "refill" and _is_company_settle_only_refill(event):
    return "Company Settle"
  if event.event_type == "bank_deposit":
    return "Bank to Wallet" if event.transfer_direction == "bank_to_wallet" else "Wallet to Bank"
  return _EVENT_LABELS.get(event.event_type, _titleize_event_type(event.event_type))


def _safe_int(value: Optional[int]) -> int:
  if value is None:
    return 0
  return int(value)


CustomerLedgerState = tuple[int, int, int]


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


def _balance_transition(
  *,
  scope: Literal["customer", "company"],
  component: Literal["money", "cyl_12", "cyl_48"],
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
  scope: Literal["customer", "company"],
  component: Literal["money", "cyl_12", "cyl_48"],
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
  event: DailyReportV2Event,
  *,
  event_sort_ids: dict[int, str],
) -> tuple[datetime, datetime, str]:
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


def _is_company_return_only_refill(event: DailyReportV2Event) -> bool:
  if event.event_type != "refill":
    return False
  buy12 = _safe_int(event.buy12)
  buy48 = _safe_int(event.buy48)
  return12 = _safe_int(event.return12)
  return48 = _safe_int(event.return48)
  total_cost = _safe_int(event.total_cost)
  paid_now = _safe_int(event.paid_now)
  has_returns = return12 > 0 or return48 > 0
  no_buys = buy12 == 0 and buy48 == 0
  no_money = total_cost == 0 and paid_now == 0
  return has_returns and no_buys and no_money


def _is_company_receive_only_refill(event: DailyReportV2Event) -> bool:
  if event.event_type != "refill":
    return False
  buy12 = _safe_int(event.buy12)
  buy48 = _safe_int(event.buy48)
  return12 = _safe_int(event.return12)
  return48 = _safe_int(event.return48)
  total_cost = _safe_int(event.total_cost)
  paid_now = _safe_int(event.paid_now)
  has_buys = buy12 > 0 or buy48 > 0
  no_returns = return12 == 0 and return48 == 0
  no_money = total_cost == 0 and paid_now == 0
  return has_buys and no_returns and no_money


def _is_company_settle_only_refill(event: DailyReportV2Event) -> bool:
  return _is_company_return_only_refill(event) or _is_company_receive_only_refill(event)


def _event_is_balanced(event: DailyReportV2Event) -> bool:
  if event.event_type == "order":
    total = _safe_int(event.order_total)
    paid = _safe_int(event.order_paid)
    if event.order_mode == "replacement":
      installed = _safe_int(event.order_installed)
      received = _safe_int(event.order_received)
      return installed == received and total == paid
    if event.order_mode in {"sell_iron", "buy_iron"}:
      return total == paid
    return True
  if event.event_type == "refill":
    buy12 = _safe_int(event.buy12)
    return12 = _safe_int(event.return12)
    buy48 = _safe_int(event.buy48)
    return48 = _safe_int(event.return48)
    total_cost = _safe_int(event.total_cost)
    paid_now = _safe_int(event.paid_now)
    return buy12 == return12 and buy48 == return48 and total_cost == paid_now
  if event.event_type in {
    "collection_money",
    "collection_empty",
    "collection_payout",
    "company_payment",
    "company_buy_iron",
    "expense",
    "bank_deposit",
    "adjust",
    "cash_adjust",
    "customer_adjust",
    "init",
  }:
    return True
  return True


def _event_action_lines(event: DailyReportV2Event) -> list[str]:
  lines: list[str] = []
  if event.event_type == "order" and event.order_mode == "replacement":
    installed = _safe_int(event.order_installed)
    received = _safe_int(event.order_received)
    if installed > received:
      diff = installed - received
      gas = event.gas_type or "12kg"
      lines.append(f"Return {diff}x{gas}")
    total = _safe_int(event.order_total)
    paid = _safe_int(event.order_paid)
    if total != paid:
      diff = total - paid
      if diff > 0:
        lines.append(f"Collect {diff}")
    return lines
  if event.event_type == "order" and event.order_mode == "sell_iron":
    total = _safe_int(event.order_total)
    paid = _safe_int(event.order_paid)
    if total != paid:
      diff = total - paid
      if diff > 0:
        lines.append(f"Collect {diff}")
    return lines
  if event.event_type == "order" and event.order_mode == "buy_iron":
    total = _safe_int(event.order_total)
    paid = _safe_int(event.order_paid)
    if total != paid:
      diff = abs(total - paid)
      if diff > 0:
        lines.append(f"Pay customer {diff}")
    return lines
  if event.event_type == "refill":
    buy12 = _safe_int(event.buy12)
    return12 = _safe_int(event.return12)
    if buy12 > return12:
      diff = buy12 - return12
      lines.append(f"Return {diff}x12kg to company")
    buy48 = _safe_int(event.buy48)
    return48 = _safe_int(event.return48)
    if buy48 > return48:
      diff = buy48 - return48
      lines.append(f"Return {diff}x48kg to company")
    total_cost = _safe_int(event.total_cost)
    paid_now = _safe_int(event.paid_now)
    if total_cost != paid_now:
      diff = abs(total_cost - paid_now)
      if diff > 0:
        lines.append(f"Pay company {diff}")
    return lines
  return lines


def _apply_ticket_fields(event: DailyReportV2Event) -> None:
  if not event.id:
    event.id = event.source_id or f"{event.event_type}:{event.effective_at.isoformat()}"
  event.label = _event_label(event)
  event.label_short = event.label
  event.is_balanced = _event_is_balanced(event)
  event.action_lines = _event_action_lines(event)


def _level3_counterparty(event: DailyReportV2Event) -> Level3Counterparty:
  if event.event_type in {"order", "collection_money", "collection_empty", "collection_payout", "customer_adjust"}:
    display_name = event.customer_name or "Customer"
    display = display_name
    if event.customer_description:
      display = f"{display_name} - {event.customer_description}"
    return Level3Counterparty(
      type="customer",
      display_name=display_name,
      description=event.customer_description,
      display=display,
    )
  if event.event_type in {"refill", "company_payment", "company_buy_iron"}:
    return Level3Counterparty(type="company", display_name="Company", description=None, display="Company")
  return Level3Counterparty(type="none", display_name=None, description=None, display=None)


def _level3_system(event: DailyReportV2Event) -> Optional[Level3System]:
  if event.event_type == "order" and event.order_mode == "replacement":
    if event.system_name:
      return Level3System(display_name=event.system_name)
  return None


def _level3_hero(event: DailyReportV2Event) -> Level3Hero:
  gas = f" {event.gas_type}" if event.gas_type else ""
  if event.event_type == "order":
    if event.order_mode == "replacement":
      return Level3Hero(text=f"Replace{gas}".strip())
    if event.order_mode == "sell_iron":
      return Level3Hero(text=f"Sell Full{gas}".strip())
    if event.order_mode == "buy_iron":
      return Level3Hero(text=f"Buy Empty{gas}".strip())
    return Level3Hero(text="Order")
  if event.event_type == "collection_money":
    return Level3Hero(text="Late Pay")
  if event.event_type == "collection_empty":
    return Level3Hero(text="Late Return")
  if event.event_type == "refill":
    if _is_company_settle_only_refill(event):
      return Level3Hero(text="Company Settle")
    return Level3Hero(text="Refill")
  if event.event_type == "company_payment":
    return Level3Hero(text="Pay Company")
  if event.event_type == "company_buy_iron":
    return Level3Hero(text="Buy Iron")
  if event.event_type == "expense":
    if event.expense_type:
      return Level3Hero(text=f"Expense: {event.expense_type}")
    return Level3Hero(text="Expense")
  if event.event_type == "adjust":
    return Level3Hero(text="Inventory Adjust")
  if event.event_type == "cash_adjust":
    return Level3Hero(text="Cash Adjust")
  if event.event_type == "bank_deposit":
    return Level3Hero(text=_event_label(event))
  if event.event_type == "collection_payout":
    return Level3Hero(text="Customer Payout")
  if event.event_type == "customer_adjust":
    return Level3Hero(text="Customer Adjust")
  if event.event_type == "init":
    return Level3Hero(text="System Init")
  return Level3Hero(text=_titleize_event_type(event.event_type))


def _cash_delta(event: DailyReportV2Event) -> int:
  if event.cash_before is None or event.cash_after is None:
    return 0
  return int(event.cash_after - event.cash_before)


def _level3_money(event: DailyReportV2Event) -> Level3Money:
  verb: Literal["received", "paid", "none"] = "none"
  amount = 0

  if event.event_type == "order":
    paid = _safe_int(event.order_paid)
    if paid:
      verb = "paid" if event.order_mode == "buy_iron" else "received"
      amount = abs(paid)
  elif event.event_type == "refill":
    paid = _safe_int(event.paid_now)
    if paid:
      verb = "paid"
      amount = abs(paid)
  elif event.event_type in {"company_payment", "company_buy_iron"}:
    paid = _safe_int(event.paid_now or event.total_cost)
    if paid:
      verb = "paid"
      amount = abs(paid)
  elif event.event_type == "expense":
    total = _safe_int(event.total_cost)
    if total:
      verb = "paid"
      amount = abs(total)
  elif event.event_type == "bank_deposit":
    verb = "none"
    amount = 0
  elif event.event_type == "cash_adjust":
    total = _safe_int(event.total_cost)
    if total > 0:
      verb = "received"
      amount = abs(total)
    elif total < 0:
      verb = "paid"
      amount = abs(total)
  elif event.event_type in {"collection_money", "collection_payout"}:
    delta = _cash_delta(event)
    if delta > 0:
      verb = "received"
      amount = abs(delta)
    elif delta < 0:
      verb = "paid"
      amount = abs(delta)

  return Level3Money(verb=verb, amount=amount)


def _level3_settlement(
  event: DailyReportV2Event,
  *,
  customer_after: Optional[CustomerLedgerState] = None,
) -> Level3Settlement:
  if event.event_type in {"order", "collection_money", "collection_empty", "collection_payout", "customer_adjust"}:
    if customer_after is not None:
      debt_cash, debt_12, debt_48 = customer_after
      money = debt_cash == 0
      cyl12 = debt_12 == 0
      cyl48 = debt_48 == 0
      is_settled = money and cyl12 and cyl48
      return Level3Settlement(
        scope="customer",
        is_settled=is_settled,
        components=Level3SettlementComponents(money=money, cyl12=cyl12, cyl48=cyl48),
      )
    money = True
    cyl12 = True
    cyl48 = True
    if event.event_type == "order":
      money = _safe_int(event.order_total) == _safe_int(event.order_paid)
      if event.order_mode == "replacement":
        installed = _safe_int(event.order_installed)
        received = _safe_int(event.order_received)
        if event.gas_type == "12kg":
          cyl12 = installed == received
        elif event.gas_type == "48kg":
          cyl48 = installed == received
    is_settled = money and cyl12 and cyl48
    return Level3Settlement(
      scope="customer",
      is_settled=is_settled,
      components=Level3SettlementComponents(money=money, cyl12=cyl12, cyl48=cyl48),
    )

  if event.event_type in {"refill", "company_payment", "company_buy_iron"}:
    money = True
    cyl12 = True
    cyl48 = True
    if isinstance(event.company_after, int):
      money = event.company_after == 0
    if isinstance(event.company_12kg_after, int):
      cyl12 = event.company_12kg_after == 0
    if isinstance(event.company_48kg_after, int):
      cyl48 = event.company_48kg_after == 0
    is_settled = money and cyl12 and cyl48
    return Level3Settlement(
      scope="company",
      is_settled=is_settled,
      components=Level3SettlementComponents(money=money, cyl12=cyl12, cyl48=cyl48),
    )

  return Level3Settlement(scope="none", is_settled=True, components=None)


def _event_kind(event: DailyReportV2Event) -> str:
  if event.event_type == "order":
    if event.order_mode == "replacement":
      return "replace"
    if event.order_mode == "sell_iron":
      return "sell_full"
    if event.order_mode == "buy_iron":
      return "buy_empty"
    return "order"
  if event.event_type == "collection_money":
    return "late_pay"
  if event.event_type == "collection_empty":
    return "late_return"
  if event.event_type == "refill":
    if _is_company_receive_only_refill(event):
      return "company_settle_receive_full"
    if _is_company_return_only_refill(event):
      return "company_settle_return_empty"
    return "refill"
  if event.event_type == "company_payment":
    return "company_payment"
  if event.event_type == "company_buy_iron":
    return "company_buy_iron"
  if event.event_type == "expense":
    return "expense"
  if event.event_type == "bank_deposit":
    return "deposit"
  if event.event_type == "adjust":
    return "inventory_adjust"
  if event.event_type == "cash_adjust":
    return "cash_adjust"
  if event.event_type == "collection_payout":
    return "customer_payout"
  if event.event_type == "customer_adjust":
    return "customer_adjust"
  if event.event_type == "init":
    return "init"
  return event.event_type


def _time_display(value: datetime) -> str:
  return value.strftime("%H:%M")


def _hero_text_for_event(event: DailyReportV2Event, money_decimals: int) -> str:
  gas = event.gas_type or "12kg"
  if event.event_type == "order":
    installed = _safe_int(event.order_installed)
    received = _safe_int(event.order_received)
    if event.order_mode == "replacement" and installed:
      return f"Installed {installed}x{gas}"
    if event.order_mode == "sell_iron" and installed:
      return f"Sold {installed}x{gas}"
    if event.order_mode == "buy_iron":
      qty = received if received > 0 else installed
      if qty:
        return f"Bought {qty}x{gas}"
  if event.event_type == "refill":
    if _is_company_return_only_refill(event):
      parts: list[str] = []
      if event.return12:
        parts.append(f"{event.return12}x12kg")
      if event.return48:
        parts.append(f"{event.return48}x48kg")
      if parts:
        return f"Returned {' | '.join(parts)} empties to company"
    if _is_company_receive_only_refill(event):
      parts: list[str] = []
      if event.buy12:
        parts.append(f"{event.buy12}x12kg")
      if event.buy48:
        parts.append(f"{event.buy48}x48kg")
      if parts:
        return f"Received {' | '.join(parts)} full from company"
    parts: list[str] = []
    if event.buy12:
      parts.append(f"{event.buy12}x12kg")
    if event.buy48:
      parts.append(f"{event.buy48}x48kg")
    if parts:
      return f"Bought {' | '.join(parts)}"
  if event.event_type == "company_buy_iron":
    parts: list[str] = []
    if event.buy12:
      parts.append(f"{event.buy12}x12kg")
    if event.buy48:
      parts.append(f"{event.buy48}x48kg")
    if parts:
      return f"Bought {' | '.join(parts)}"
  if event.event_type == "collection_money":
    amount = event.money_amount if isinstance(event.money_amount, int) else 0
    if amount:
      return f"Collected {_format_money_major(amount, money_decimals)}"
    return "Collected"
  if event.event_type == "collection_empty":
    parts: list[str] = []
    if event.return12:
      parts.append(f"{event.return12}x12kg")
    if event.return48:
      parts.append(f"{event.return48}x48kg")
    if parts:
      return f"Returned {' | '.join(parts)} empties"
    return "Returned empties"
  if event.event_type == "company_payment":
    amount = event.money_amount if isinstance(event.money_amount, int) else 0
    if amount:
      return f"Paid company {_format_money_major(amount, money_decimals)}"
    return "Paid company"
  if event.event_type == "collection_payout":
    amount = event.money_amount if isinstance(event.money_amount, int) else 0
    if amount:
      return f"Paid customer {_format_money_major(amount, money_decimals)}"
    return "Paid customer"
  if event.event_type == "customer_adjust":
    return "Adjusted customer balance"
  if event.event_type == "expense":
    return event.expense_type or "Expense"
  if event.event_type == "bank_deposit":
    amount = _safe_int(event.total_cost)
    if event.transfer_direction == "bank_to_wallet":
      if amount:
        return f"Transferred {_format_money_major(amount, money_decimals)} to wallet"
      return "Transferred to wallet"
    if amount:
      return f"Transferred {_format_money_major(amount, money_decimals)} to bank"
    return "Transferred to bank"
  if event.event_type == "cash_adjust":
    return "Cash Adjust"
  if event.event_type == "adjust":
    return "Inventory Adjust"
  return event.hero.text if event.hero else (event.label or "Activity")


def _activity_type(event: DailyReportV2Event) -> str:
  if event.event_type == "order" and event.order_mode == "replacement":
    return "replace"
  if event.event_type == "order" and event.order_mode == "sell_iron":
    return "sell_full"
  if event.event_type == "order" and event.order_mode == "buy_iron":
    return "buy_empty"
  if event.event_type == "collection_money":
    return "late_pay"
  if event.event_type == "collection_empty":
    return "return_empty"
  if event.event_type == "refill":
    if _is_company_receive_only_refill(event):
      return "company_settle_receive_full"
    if _is_company_return_only_refill(event):
      return "company_settle_return_empty"
    return "refill"
  if event.event_type == "company_payment":
    return "company_payment"
  if event.event_type == "company_buy_iron":
    return "company_buy_iron"
  if event.event_type == "expense":
    return "expense"
  if event.event_type == "bank_deposit":
    return "deposit"
  if event.event_type == "adjust":
    return "inventory_adjust"
  if event.event_type == "cash_adjust":
    return "cash_adjust"
  if event.event_type == "customer_adjust":
    return "customer_adjust"
  return event.event_type


def _context_line(event: DailyReportV2Event) -> str:
  label = event.label or _titleize_event_type(event.event_type)
  parts = [label, _time_display(event.effective_at)]
  if event.event_type == "order" and event.order_mode == "replacement" and event.system_name:
    parts.append(f"System: {event.system_name}")
  return " · ".join(parts)


def _apply_ui_fields(
  event: DailyReportV2Event,
  *,
  money_decimals: int,
  notes: list[ActivityNote],
) -> None:
  event.event_kind = _event_kind(event)
  event.activity_type = _activity_type(event)
  event.time_display = _time_display(event.effective_at)
  if event.counterparty and event.counterparty.type == "customer":
    if event.counterparty.description:
      event.display_name = f"{event.counterparty.display_name} — {event.counterparty.description}"
    else:
      event.display_name = event.counterparty.display_name
    event.display_description = event.counterparty.description
  elif event.counterparty and event.counterparty.type == "company":
    event.display_name = event.counterparty.display_name or "Company"
    event.display_description = None
  else:
    event.display_name = event.label
    event.display_description = None

  if event.money:
    if event.money.verb == "received":
      event.money_amount = int(event.money.amount or 0)
      event.money_direction = "in"
      event.money_delta = _money_major(event.money_amount, money_decimals)
    elif event.money.verb == "paid":
      event.money_amount = int(event.money.amount or 0)
      event.money_direction = "out"
      event.money_delta = _money_major(event.money_amount, money_decimals)
    else:
      event.money_amount = 0
      event.money_direction = "none"
      event.money_delta = 0
  else:
    event.money_amount = 0
    event.money_direction = "none"
    event.money_delta = 0

  event.hero_text = _hero_text_for_event(event, money_decimals)
  event.hero_primary = event.hero_text
  event.context_line = _context_line(event)

  event.notes = notes

  if event.status_mode == "settlement":
    event.status = "balance_settled" if event.is_ok else "needs_action"
  else:
    if event.is_atomic_ok and len(notes) == 0:
      event.status = "atomic_ok"
    else:
      event.status = "needs_action"

  if event.is_ok:
    event.status_badge = "Balance settled" if event.status_mode == "settlement" else "OK"
  else:
    event.status_badge = None

  event.remaining_actions = list(event.action_pills)


def _customer_actions_from_debt(debt_cash: int, debt_12: int, debt_48: int) -> list[Level3Action]:
  actions: list[Level3Action] = []
  if debt_cash > 0:
    actions.append(Level3Action(category="money", direction="customer_pays", amount=debt_cash))
  elif debt_cash < 0:
    actions.append(Level3Action(category="money", direction="pay_customer", amount=abs(debt_cash)))
  if debt_12 > 0:
    actions.append(
      Level3Action(
        category="cylinders",
        direction="customer_returns_empty",
        gas_type="12",
        qty=debt_12,
        unit="empty",
      )
    )
  elif debt_12 < 0:
    actions.append(
      Level3Action(
        category="cylinders",
        direction="deliver_full_to_customer",
        gas_type="12",
        qty=abs(debt_12),
        unit="full",
      )
    )
  if debt_48 > 0:
    actions.append(
      Level3Action(
        category="cylinders",
        direction="customer_returns_empty",
        gas_type="48",
        qty=debt_48,
        unit="empty",
      )
    )
  elif debt_48 < 0:
    actions.append(
      Level3Action(
        category="cylinders",
        direction="deliver_full_to_customer",
        gas_type="48",
        qty=abs(debt_48),
        unit="full",
      )
    )
  return actions


def _company_actions_from_debt(
  company_money: Optional[int],
  company_cyl_12: Optional[int],
  company_cyl_48: Optional[int],
) -> list[Level3Action]:
  actions: list[Level3Action] = []
  if isinstance(company_money, int):
    if company_money > 0:
      actions.append(Level3Action(category="money", direction="pay_company", amount=company_money))
    elif company_money < 0:
      actions.append(Level3Action(category="money", direction="company_pays", amount=abs(company_money)))
  if isinstance(company_cyl_12, int):
    if company_cyl_12 < 0:
      actions.append(
        Level3Action(
          category="cylinders",
          direction="return_empty_to_company",
          gas_type="12",
          qty=abs(company_cyl_12),
          unit="empty",
        )
      )
    elif company_cyl_12 > 0:
      actions.append(
        Level3Action(
          category="cylinders",
          direction="company_delivers_full_to_you",
          gas_type="12",
          qty=company_cyl_12,
          unit="full",
        )
      )
  if isinstance(company_cyl_48, int):
    if company_cyl_48 < 0:
      actions.append(
        Level3Action(
          category="cylinders",
          direction="return_empty_to_company",
          gas_type="48",
          qty=abs(company_cyl_48),
          unit="empty",
        )
      )
    elif company_cyl_48 > 0:
      actions.append(
        Level3Action(
          category="cylinders",
          direction="company_delivers_full_to_you",
          gas_type="48",
          qty=company_cyl_48,
          unit="full",
        )
      )
  return actions


def _apply_level3_fields(
  event: DailyReportV2Event,
  *,
  customer_after: Optional[CustomerLedgerState] = None,
) -> None:
  event.counterparty = _level3_counterparty(event)
  event.counterparty_display = event.counterparty.display if event.counterparty else None
  event.system = _level3_system(event)
  event.hero = _level3_hero(event)
  event.hero_text = event.hero.text if event.hero else None
  event.money = _level3_money(event)
  if event.money and event.money.verb == "received":
    event.money_received = event.money.amount
  else:
    event.money_received = None
  event.settlement = _level3_settlement(event, customer_after=customer_after)
  if event.counterparty and event.counterparty.type == "customer" and customer_after is not None:
    event.open_actions = _customer_actions_from_debt(*customer_after)
  elif event.counterparty and event.counterparty.type == "company":
    event.open_actions = _company_actions_from_debt(
      event.company_after,
      event.company_12kg_after,
      event.company_48kg_after,
    )
  else:
    event.open_actions = []


def _status_mode(event: DailyReportV2Event) -> Literal["atomic", "settlement"]:
  if event.event_type in {
    "collection_money",
    "collection_empty",
    "collection_payout",
    "customer_adjust",
    "company_payment",
  }:
    return "settlement"
  if event.event_type == "refill" and _is_company_settle_only_refill(event):
    return "settlement"
  return "atomic"


def _gas_short(gas_type: Optional[str]) -> Optional[str]:
  if not gas_type:
    return None
  if gas_type.startswith("12"):
    return "12"
  if gas_type.startswith("48"):
    return "48"
  return None


def _format_money(amount: int) -> str:
  return f"₪{amount}"


def _money_major(amount: int, decimals: int) -> int:
  if decimals <= 0:
    return int(amount)
  scale = 10 ** decimals
  return int(round(amount / scale))


def _format_money_major(amount: int, decimals: int) -> str:
  return f"₪{_money_major(amount, decimals)}"


def _empty_word(qty: int) -> str:
  return "empty" if qty == 1 else "empties"


def _pill(
  *,
  category: Literal["money", "cylinders"],
  kind: Literal["money", "empty_12", "empty_48", "full_12", "full_48"],
  direction: Literal["customer->dist", "dist->customer", "dist->company", "company->dist"],
  severity: Literal["warning", "danger"],
  text: str,
  amount: Optional[int] = None,
  gas_type: Optional[str] = None,
  qty: Optional[int] = None,
  unit: Optional[str] = None,
) -> Level3Action:
  return Level3Action(
    category=category,
    direction=direction,
    amount=amount,
    gas_type=gas_type,
    qty=qty,
    unit=unit,
    kind=kind,
    severity=severity,
    text=text,
  )


def _money_pill(direction: Literal["customer->dist", "dist->customer", "dist->company", "company->dist"], amount: int) -> Level3Action:
  if direction == "customer->dist":
    return _pill(
      category="money",
      kind="money",
      direction=direction,
      severity="warning",
      text=f"Customer pays you {_format_money(amount)}",
      amount=amount,
    )
  if direction == "dist->customer":
    return _pill(
      category="money",
      kind="money",
      direction=direction,
      severity="warning",
      text=f"You pay customer {_format_money(amount)}",
      amount=amount,
    )
  if direction == "dist->company":
    return _pill(
      category="money",
      kind="money",
      direction=direction,
      severity="danger",
      text=f"You pay company {_format_money(amount)}",
      amount=amount,
    )
  return _pill(
    category="money",
    kind="money",
    direction="company->dist",
    severity="danger",
    text=f"Company pays you {_format_money(amount)}",
    amount=amount,
  )


def _empty_pill(
  *,
  direction: Literal["customer->dist", "dist->company"],
  gas: Literal["12", "48"],
  qty: int,
) -> Level3Action:
  gas_label = f"{gas}kg"
  empties = _empty_word(qty)
  if direction == "customer->dist":
    return _pill(
      category="cylinders",
      kind=f"empty_{gas}",
      direction=direction,
      severity="warning",
      text=f"Customer returns {qty}x{gas_label} {empties}",
      gas_type=gas,
      qty=qty,
      unit="empty",
    )
  return _pill(
    category="cylinders",
    kind=f"empty_{gas}",
    direction="dist->company",
    severity="danger",
    text=f"You return company {qty}x{gas_label} {empties}",
    gas_type=gas,
    qty=qty,
    unit="empty",
  )


def _full_pill(
  *,
  direction: Literal["dist->customer", "company->dist"],
  gas: Literal["12", "48"],
  qty: int,
) -> Level3Action:
  gas_label = f"{gas}kg"
  if direction == "dist->customer":
    return _pill(
      category="cylinders",
      kind=f"full_{gas}",
      direction=direction,
      severity="warning",
      text=f"You deliver customer {qty}x{gas_label} full",
      gas_type=gas,
      qty=qty,
      unit="full",
    )
  return _pill(
    category="cylinders",
    kind=f"full_{gas}",
    direction="company->dist",
    severity="danger",
    text=f"Company delivers you {qty}x{gas_label} full",
    gas_type=gas,
    qty=qty,
    unit="full",
  )


def _customer_pills_from_debt(debt_cash: int, debt_12: int, debt_48: int) -> list[Level3Action]:
  actions: list[Level3Action] = []
  if debt_cash > 0:
    actions.append(_money_pill("customer->dist", debt_cash))
  elif debt_cash < 0:
    actions.append(_money_pill("dist->customer", abs(debt_cash)))
  if debt_12 > 0:
    actions.append(_empty_pill(direction="customer->dist", gas="12", qty=debt_12))
  elif debt_12 < 0:
    actions.append(_full_pill(direction="dist->customer", gas="12", qty=abs(debt_12)))
  if debt_48 > 0:
    actions.append(_empty_pill(direction="customer->dist", gas="48", qty=debt_48))
  elif debt_48 < 0:
    actions.append(_full_pill(direction="dist->customer", gas="48", qty=abs(debt_48)))
  return actions


def _company_pills_from_debt(
  company_money: Optional[int],
  company_cyl_12: Optional[int],
  company_cyl_48: Optional[int],
) -> list[Level3Action]:
  actions: list[Level3Action] = []
  if isinstance(company_money, int):
    if company_money > 0:
      actions.append(_money_pill("dist->company", company_money))
    elif company_money < 0:
      actions.append(_money_pill("company->dist", abs(company_money)))
  if isinstance(company_cyl_12, int):
    if company_cyl_12 < 0:
      actions.append(_empty_pill(direction="dist->company", gas="12", qty=abs(company_cyl_12)))
    elif company_cyl_12 > 0:
      actions.append(_full_pill(direction="company->dist", gas="12", qty=company_cyl_12))
  if isinstance(company_cyl_48, int):
    if company_cyl_48 < 0:
      actions.append(_empty_pill(direction="dist->company", gas="48", qty=abs(company_cyl_48)))
    elif company_cyl_48 > 0:
      actions.append(_full_pill(direction="company->dist", gas="48", qty=company_cyl_48))
  return actions


def _atomic_action_pills(event: DailyReportV2Event) -> list[Level3Action]:
  actions: list[Level3Action] = []

  if event.event_type == "order":
    total = _safe_int(event.order_total)
    paid = _safe_int(event.order_paid)
    diff = total - paid
    gas = _gas_short(event.gas_type)

    if event.order_mode == "replacement":
      installed = _safe_int(event.order_installed)
      received = _safe_int(event.order_received)
      if installed > received:
        if gas:
          actions.append(_empty_pill(direction="customer->dist", gas=gas, qty=installed - received))
      elif received > installed:
        if gas:
          actions.append(_full_pill(direction="dist->customer", gas=gas, qty=received - installed))
      if diff > 0:
        actions.append(_money_pill("customer->dist", diff))
      elif diff < 0:
        actions.append(_money_pill("dist->customer", abs(diff)))
      return actions

    if event.order_mode == "sell_iron":
      if diff > 0:
        actions.append(_money_pill("customer->dist", diff))
      elif diff < 0:
        actions.append(_money_pill("dist->customer", abs(diff)))
      return actions

    if event.order_mode == "buy_iron":
      if diff > 0:
        actions.append(_money_pill("dist->customer", diff))
      elif diff < 0:
        actions.append(_money_pill("customer->dist", abs(diff)))
      return actions

  if event.event_type == "refill":
    buy12 = _safe_int(event.buy12)
    return12 = _safe_int(event.return12)
    buy48 = _safe_int(event.buy48)
    return48 = _safe_int(event.return48)
    if buy12 > return12:
      actions.append(_empty_pill(direction="dist->company", gas="12", qty=buy12 - return12))
    elif return12 > buy12:
      actions.append(_full_pill(direction="company->dist", gas="12", qty=return12 - buy12))
    if buy48 > return48:
      actions.append(_empty_pill(direction="dist->company", gas="48", qty=buy48 - return48))
    elif return48 > buy48:
      actions.append(_full_pill(direction="company->dist", gas="48", qty=return48 - buy48))
    total_cost = _safe_int(event.total_cost)
    paid_now = _safe_int(event.paid_now)
    diff = total_cost - paid_now
    if diff > 0:
      actions.append(_money_pill("dist->company", diff))
    elif diff < 0:
      actions.append(_money_pill("company->dist", abs(diff)))
    return actions

  if event.event_type == "company_buy_iron":
    total_cost = _safe_int(event.total_cost)
    paid_now = _safe_int(event.paid_now)
    diff = total_cost - paid_now
    if diff > 0:
      actions.append(_money_pill("dist->company", diff))
    elif diff < 0:
      actions.append(_money_pill("company->dist", abs(diff)))
    return actions

  if event.event_type in {"expense", "adjust", "cash_adjust", "bank_deposit"}:
    return actions

  return actions


def _remaining_actions_for_event(
  event: DailyReportV2Event,
  *,
  customer_before: Optional[CustomerLedgerState] = None,
  customer_after: Optional[CustomerLedgerState] = None,
) -> list[Level3Action]:
  if event.event_type == "order" and event.order_mode == "replacement":
    actions: list[Level3Action] = []
    total = _safe_int(event.order_total)
    paid = _safe_int(event.order_paid)
    diff = total - paid
    gas = _gas_short(event.gas_type)
    installed = _safe_int(event.order_installed)
    received = _safe_int(event.order_received)

    if customer_after is not None:
      after_cash, after_12, after_48 = customer_after
      after_cyl = after_12 if gas == "12" else after_48 if gas == "48" else 0
      if after_cyl > 0 and gas:
        actions.append(_empty_pill(direction="customer->dist", gas=gas, qty=after_cyl))
      elif after_cyl < 0 and gas:
        actions.append(_full_pill(direction="dist->customer", gas=gas, qty=abs(after_cyl)))
      if after_cash > 0:
        actions.append(_money_pill("customer->dist", after_cash))
      elif after_cash < 0:
        actions.append(_money_pill("dist->customer", abs(after_cash)))
      return actions

    if installed > received and gas:
      actions.append(_empty_pill(direction="customer->dist", gas=gas, qty=installed - received))
    elif received > installed and gas:
      actions.append(_full_pill(direction="dist->customer", gas=gas, qty=received - installed))

    if diff > 0:
      actions.append(_money_pill("customer->dist", diff))
    elif diff < 0:
      actions.append(_money_pill("dist->customer", abs(diff)))
    return actions

  if event.event_type == "refill":
    actions = _company_pills_from_debt(
      event.company_after,
      event.company_12kg_after,
      event.company_48kg_after,
    )
    return [action for action in actions if action.direction != "company->dist"]

  if event.event_type == "collection_money":
    if customer_after is None:
      return []
    debt_cash, debt_12, debt_48 = customer_after
    event.has_other_outstanding_cylinders = debt_12 != 0 or debt_48 != 0
    return _customer_pills_from_debt(debt_cash, debt_12, debt_48)

  if event.event_type == "collection_empty":
    if customer_after is None:
      return []
    debt_cash, debt_12, debt_48 = customer_after
    event.has_other_outstanding_cash = debt_cash != 0
    return _customer_pills_from_debt(debt_cash, debt_12, debt_48)

  if event.event_type == "collection_payout":
    if customer_after is None:
      return []
    return _customer_pills_from_debt(*customer_after)

  if event.event_type == "customer_adjust":
    if customer_after is None:
      return []
    return _customer_pills_from_debt(*customer_after)

  if event.event_type == "company_payment":
    actions: list[Level3Action] = []
    if isinstance(event.company_after, int):
      if event.company_after > 0:
        actions.append(_money_pill("dist->company", event.company_after))
      elif event.company_after < 0:
        text = f"Company still owes you {_format_money(abs(event.company_after))}"
        actions.append(
          _pill(
            category="money",
            kind="money",
            direction="company->dist",
            severity="danger",
            text=text,
            amount=abs(event.company_after),
          )
        )
    return actions

  return _atomic_action_pills(event) if _status_mode(event) == "atomic" else []


def _note(
  *,
  kind: Literal["money", "cyl_12", "cyl_48", "cyl_full_12", "cyl_full_48"],
  direction: Literal[
    "customer_pays_you",
    "you_pay_customer",
    "you_paid_customer_earlier",
    "customer_paid_earlier",
    "customer_extra_paid",
    "you_pay_company",
    "you_paid_earlier",
    "company_pays_you",
    "customer_returns_you",
    "you_return_company",
    "you_returned_earlier",
    "you_deliver_customer",
    "company_delivers_you",
  ],
  remaining_after: int,
  remaining_before: Optional[int] = None,
) -> ActivityNote:
  return ActivityNote(
    kind=kind,
    direction=direction,
    remaining_after=remaining_after,
    remaining_before=remaining_before,
  )


def _notes_for_event(
  event: DailyReportV2Event,
  *,
  customer_before: Optional[CustomerLedgerState] = None,
  customer_after: Optional[CustomerLedgerState] = None,
  money_decimals: int,
) -> list[ActivityNote]:
  notes: list[ActivityNote] = []

  if event.event_type == "order" and event.order_mode == "replacement":
    total = _safe_int(event.order_total)
    paid = _safe_int(event.order_paid)
    diff = total - paid
    gas = _gas_short(event.gas_type)
    installed = _safe_int(event.order_installed)
    received = _safe_int(event.order_received)

    if gas:
      if customer_before is not None and customer_after is not None:
        after_cyl = customer_after[1] if gas == "12" else customer_after[2]
        before_cyl = customer_before[1] if gas == "12" else customer_before[2]
        if after_cyl > 0:
          kind = "cyl_12" if gas == "12" else "cyl_48"
          remaining_before = before_cyl if before_cyl > 0 else None
          notes.append(
            _note(
              kind=kind,
              direction="customer_returns_you",
              remaining_after=after_cyl,
              remaining_before=remaining_before,
            )
          )
        elif after_cyl < 0:
          kind = "cyl_full_12" if gas == "12" else "cyl_full_48"
          notes.append(
            _note(
              kind=kind,
              direction="you_deliver_customer",
              remaining_after=abs(after_cyl),
            )
          )
      else:
        if installed > received:
          kind = "cyl_12" if gas == "12" else "cyl_48"
          notes.append(
            _note(
              kind=kind,
              direction="customer_returns_you",
              remaining_after=installed - received,
            )
          )
        elif received > installed:
          kind = "cyl_full_12" if gas == "12" else "cyl_full_48"
          notes.append(
            _note(
              kind=kind,
              direction="you_deliver_customer",
              remaining_after=received - installed,
            )
          )

    if customer_before is not None and customer_after is not None:
      before_cash = customer_before[0]
      after_cash = customer_after[0]
      paid_earlier = max(0, before_cash - max(after_cash, 0))
      extra_credit = max(0, max(-after_cash, 0) - max(-before_cash, 0))

      if paid_earlier > 0 and after_cash <= 0:
        notes.append(
          _note(
            kind="money",
            direction="customer_paid_earlier",
            remaining_after=_money_major(paid_earlier, money_decimals),
          )
        )
      if extra_credit > 0:
        notes.append(
          _note(
            kind="money",
            direction="customer_extra_paid",
            remaining_after=_money_major(extra_credit, money_decimals),
          )
        )

      if after_cash > 0:
        remaining_before = _money_major(before_cash, money_decimals) if before_cash > 0 else None
        notes.append(
          _note(
            kind="money",
            direction="customer_pays_you",
            remaining_after=_money_major(after_cash, money_decimals),
            remaining_before=remaining_before,
          )
        )
    elif diff > 0:
      notes.append(
        _note(
          kind="money",
          direction="customer_pays_you",
          remaining_after=_money_major(diff, money_decimals),
        )
      )
    return notes

  if event.event_type == "refill":
    if isinstance(event.company_before, int) and isinstance(event.company_after, int):
      before_money = event.company_before
      after_money = event.company_after
      paid_earlier = 0
      if before_money > 0:
        if after_money <= 0:
          paid_earlier = before_money
        elif after_money < before_money:
          paid_earlier = before_money - after_money
      if paid_earlier > 0:
        notes.append(
          _note(
            kind="money",
            direction="you_paid_earlier",
            remaining_after=_money_major(paid_earlier, money_decimals),
          )
        )

      credit_before = max(-before_money, 0)
      credit_after = max(-after_money, 0)
      extra_credit = max(credit_after - credit_before, 0)
      if extra_credit > 0:
        notes.append(
          _note(
            kind="money",
            direction="company_pays_you",
            remaining_after=_money_major(extra_credit, money_decimals),
          )
        )

    for gas, kind, full_kind in (("12", "cyl_12", "cyl_full_12"), ("48", "cyl_48", "cyl_full_48")):
      before_attr = "company_12kg_before" if gas == "12" else "company_48kg_before"
      after_attr = "company_12kg_after" if gas == "12" else "company_48kg_after"
      before = getattr(event, before_attr)
      after = getattr(event, after_attr)
      if not isinstance(before, int) or not isinstance(after, int):
        continue

      returned_earlier = 0
      if before < 0:
        if after < 0 and abs(after) < abs(before):
          returned_earlier = abs(before) - abs(after)
        elif after >= 0:
          returned_earlier = abs(before)
      if returned_earlier > 0:
        notes.append(
          _note(
            kind=kind,
            direction="you_returned_earlier",
            remaining_after=returned_earlier,
          )
        )

      credit_before = max(before, 0)
      credit_after = max(after, 0)
      extra_full = max(credit_after - credit_before, 0)
      if extra_full > 0:
        notes.append(
          _note(
            kind=full_kind,
            direction="company_delivers_you",
            remaining_after=extra_full,
          )
        )
    return notes

  if event.event_type == "collection_money":
    if customer_before is None or customer_after is None:
      return notes
    before_cash, _, _ = customer_before
    debt_cash, debt_12, debt_48 = customer_after
    event.has_other_outstanding_cylinders = debt_12 != 0 or debt_48 != 0
    if debt_cash > 0:
      notes.append(
        _note(
          kind="money",
          direction="customer_pays_you",
          remaining_after=_money_major(debt_cash, money_decimals),
          remaining_before=_money_major(before_cash, money_decimals) if before_cash > 0 else None,
        )
      )
    elif debt_cash < 0:
      notes.append(
        _note(
          kind="money",
          direction="you_pay_customer",
          remaining_after=_money_major(abs(debt_cash), money_decimals),
          remaining_before=_money_major(abs(before_cash), money_decimals) if before_cash < 0 else None,
        )
      )
    return notes

  if event.event_type == "collection_empty":
    if customer_before is None or customer_after is None:
      return notes
    _, before_12, before_48 = customer_before
    debt_cash, debt_12, debt_48 = customer_after
    event.has_other_outstanding_cash = debt_cash != 0

    if debt_12 > 0:
      notes.append(
        _note(
          kind="cyl_12",
          direction="customer_returns_you",
          remaining_after=debt_12,
          remaining_before=before_12 if before_12 > 0 else None,
        )
      )
    elif debt_12 < 0:
      notes.append(
        _note(
          kind="cyl_full_12",
          direction="you_deliver_customer",
          remaining_after=abs(debt_12),
          remaining_before=abs(before_12) if before_12 < 0 else None,
        )
      )
    if debt_48 > 0:
      notes.append(
        _note(
          kind="cyl_48",
          direction="customer_returns_you",
          remaining_after=debt_48,
          remaining_before=before_48 if before_48 > 0 else None,
        )
      )
    elif debt_48 < 0:
      notes.append(
        _note(
          kind="cyl_full_48",
          direction="you_deliver_customer",
          remaining_after=abs(debt_48),
          remaining_before=abs(before_48) if before_48 < 0 else None,
        )
      )
    return notes

  if event.event_type == "collection_payout":
    if customer_before is None or customer_after is None:
      return notes
    before_cash, _, _ = customer_before
    debt_cash, debt_12, debt_48 = customer_after
    event.has_other_outstanding_cylinders = debt_12 != 0 or debt_48 != 0
    paid_earlier = max(0, max(-before_cash, 0) - max(-debt_cash, 0))
    if paid_earlier > 0:
      notes.append(
        _note(
          kind="money",
          direction="you_paid_customer_earlier",
          remaining_after=_money_major(paid_earlier, money_decimals),
        )
      )
    if debt_cash > 0:
      notes.append(
        _note(
          kind="money",
          direction="customer_pays_you",
          remaining_after=_money_major(debt_cash, money_decimals),
          remaining_before=_money_major(before_cash, money_decimals) if before_cash > 0 else None,
        )
      )
    elif debt_cash < 0:
      notes.append(
        _note(
          kind="money",
          direction="you_pay_customer",
          remaining_after=_money_major(abs(debt_cash), money_decimals),
          remaining_before=_money_major(abs(before_cash), money_decimals) if before_cash < 0 else None,
        )
      )
    return notes

  if event.event_type == "company_payment":
    if isinstance(event.company_after, int) and event.company_after > 0:
      remaining_before = None
      if isinstance(event.company_before, int) and event.company_before > 0:
        remaining_before = _money_major(event.company_before, money_decimals)
      notes.append(
        _note(
          kind="money",
          direction="you_pay_company",
          remaining_after=_money_major(event.company_after, money_decimals),
          remaining_before=remaining_before,
        )
      )
    return notes

  return notes


def _apply_status_fields(
  event: DailyReportV2Event,
  *,
  customer_before: Optional[CustomerLedgerState] = None,
  customer_after: Optional[CustomerLedgerState] = None,
) -> None:
  event.is_atomic_ok = event.is_balanced if event.is_balanced is not None else None
  mode = _status_mode(event)
  event.status_mode = mode
  event.action_pills = _remaining_actions_for_event(
    event,
    customer_before=customer_before,
    customer_after=customer_after,
  )
  event.is_ok = len(event.action_pills) == 0


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


def _sold_full_by_day(session: Session, start: date, end: date) -> dict[tuple[date, str], int]:
  stmt = (
    select(LedgerEntry.day, LedgerEntry.gas_type, func.coalesce(func.sum(-LedgerEntry.amount), 0))
    .where(LedgerEntry.account == "inv")
    .where(LedgerEntry.state == "full")
    .where(LedgerEntry.unit == "count")
    .where(LedgerEntry.amount < 0)
    .where(LedgerEntry.day >= start)
    .where(LedgerEntry.day <= end)
    .group_by(LedgerEntry.day, LedgerEntry.gas_type)
  )
  rows = session.exec(stmt).all()
  out: dict[tuple[date, str], int] = {}
  for day, gas_type, total in rows:
    if not gas_type:
      continue
    out[(day, gas_type)] = int(total or 0)
  return out


def _cash_math_by_day(session: Session, start: date, end: date) -> dict[date, dict[str, int]]:
  cash_rows = session.exec(
    select(LedgerEntry.day, LedgerEntry.source_type, LedgerEntry.source_id, LedgerEntry.amount)
    .where(LedgerEntry.account == "cash")
    .where(LedgerEntry.unit == "money")
    .where(LedgerEntry.day >= start)
    .where(LedgerEntry.day <= end)
  ).all()

  if not cash_rows:
    return {}

  customer_ids = {row[2] for row in cash_rows if row[1] == "customer_txn"}
  expense_ids = {row[2] for row in cash_rows if row[1] == "expense"}

  customer_txns = (
    {row.id: row for row in session.exec(select(CustomerTransaction).where(CustomerTransaction.id.in_(customer_ids))).all()}
    if customer_ids
    else {}
  )
  expenses = (
    {row.id: row for row in session.exec(select(Expense).where(Expense.id.in_(expense_ids))).all()}
    if expense_ids
    else {}
  )

  def resolve_category(source_type: str, source_id: str) -> str:
    if source_type == "customer_txn":
      txn = customer_txns.get(source_id)
      if txn and txn.kind == "order":
        return "sales"
      if txn and txn.kind == "payment":
        return "late"
      return "other"
    if source_type == "company_txn":
      return "company"
    if source_type == "expense":
      expense = expenses.get(source_id)
      if expense and expense.kind == "expense":
        return "expenses"
      return "other"
    if source_type == "cash_adjust":
      return "adjust"
    return "other"

  by_day: dict[date, dict[str, int]] = defaultdict(lambda: defaultdict(int))
  for day, source_type, source_id, amount in cash_rows:
    category = resolve_category(source_type, source_id)
    by_day[day][category] += int(amount or 0)
  return by_day


def _customer_day_state_bounds(session: Session, *, customer_id: str, day: date) -> tuple[CustomerLedgerState, CustomerLedgerState]:
  prev = day - timedelta(days=1)
  return (
    (
      sum_ledger(session, account="cust_money_debts", unit="money", customer_id=customer_id, day_to=prev),
      sum_ledger(
        session,
        account="cust_cylinders_debts",
        gas_type="12kg",
        state="empty",
        unit="count",
        customer_id=customer_id,
        day_to=prev,
      ),
      sum_ledger(
        session,
        account="cust_cylinders_debts",
        gas_type="48kg",
        state="empty",
        unit="count",
        customer_id=customer_id,
        day_to=prev,
      ),
    ),
    (
      sum_ledger(session, account="cust_money_debts", unit="money", customer_id=customer_id, day_to=day),
      sum_ledger(
        session,
        account="cust_cylinders_debts",
        gas_type="12kg",
        state="empty",
        unit="count",
        customer_id=customer_id,
        day_to=day,
      ),
      sum_ledger(
        session,
        account="cust_cylinders_debts",
        gas_type="48kg",
        state="empty",
        unit="count",
        customer_id=customer_id,
        day_to=day,
      ),
    ),
  )


def _company_day_state_bounds(session: Session, *, day: date) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
  prev = day - timedelta(days=1)
  return (
    (
      sum_ledger(session, account="company_money_debts", unit="money", day_to=prev),
      sum_ledger(session, account="company_cylinders_debts", gas_type="12kg", unit="count", day_to=prev),
      sum_ledger(session, account="company_cylinders_debts", gas_type="48kg", unit="count", day_to=prev),
    ),
    (
      sum_ledger(session, account="company_money_debts", unit="money", day_to=day),
      sum_ledger(session, account="company_cylinders_debts", gas_type="12kg", unit="count", day_to=day),
      sum_ledger(session, account="company_cylinders_debts", gas_type="48kg", unit="count", day_to=day),
    ),
  )


def _snapshot_transitions_for_customer(
  *,
  session: Session,
  day: date,
  customer_id: str,
  customers: dict[str, Customer],
  intent: Optional[str] = None,
) -> list[BalanceTransition]:
  customer = customers.get(customer_id)
  name, description = _customer_identity(customer)
  start_state, end_state = _customer_day_state_bounds(session, customer_id=customer_id, day=day)
  return _customer_balance_transitions(
    before=start_state,
    after=end_state,
    include_static=True,
    display_name=name,
    display_description=description,
    intent=intent,
  )


def _snapshot_transitions_for_company(
  *,
  session: Session,
  day: date,
) -> list[BalanceTransition]:
  start_state, end_state = _company_day_state_bounds(session, day=day)
  return _company_balance_transitions(
    money_before=start_state[0],
    money_after=end_state[0],
    cyl12_before=start_state[1],
    cyl12_after=end_state[1],
    cyl48_before=start_state[2],
    cyl48_after=end_state[2],
    include_static=True,
  )


def _snapshot_lines_for_customer(
  *,
  session: Session,
  day: date,
  customer_id: str,
  customers: dict[str, Customer],
  money_decimals: int,
) -> list[tuple[int, int, int, str]]:
  prev = day - timedelta(days=1)
  customer = customers.get(customer_id)
  name, _ = _customer_identity(customer)

  s_cash = sum_ledger(session, account="cust_money_debts", unit="money", customer_id=customer_id, day_to=prev)
  e_cash = sum_ledger(session, account="cust_money_debts", unit="money", customer_id=customer_id, day_to=day)
  s_12 = sum_ledger(
    session,
    account="cust_cylinders_debts",
    gas_type="12kg",
    state="empty",
    unit="count",
    customer_id=customer_id,
    day_to=prev,
  )
  e_12 = sum_ledger(
    session,
    account="cust_cylinders_debts",
    gas_type="12kg",
    state="empty",
    unit="count",
    customer_id=customer_id,
    day_to=day,
  )
  s_48 = sum_ledger(
    session,
    account="cust_cylinders_debts",
    gas_type="48kg",
    state="empty",
    unit="count",
    customer_id=customer_id,
    day_to=prev,
  )
  e_48 = sum_ledger(
    session,
    account="cust_cylinders_debts",
    gas_type="48kg",
    state="empty",
    unit="count",
    customer_id=customer_id,
    day_to=day,
  )

  lines: list[tuple[int, int, int, str]] = []

  def add_line(priority: int, sub: int, amount: int, text: str) -> None:
    if amount <= 0:
      return
    lines.append((priority, sub, -amount, text))

  paid_earlier = max(0, s_cash - max(e_cash, 0))
  if e_cash > 0:
    add_line(0, 0, e_cash, f"Remaining payment: {name} {_format_money_major(e_cash, money_decimals)}")
  if paid_earlier > 0:
    settled = " ✅ Settled" if e_cash == 0 else ""
    add_line(1, 0, paid_earlier, f"Paid earlier: {name} {_format_money_major(paid_earlier, money_decimals)}{settled}")
  if e_cash < 0:
    add_line(2, 0, abs(e_cash), f"Extra paid: {name} {_format_money_major(abs(e_cash), money_decimals)}")

  returned_earlier_12 = max(0, s_12 - max(e_12, 0))
  if e_12 > 0:
    add_line(0, 1, e_12, f"Remaining empties: {name} {e_12}x12kg empty")
  if returned_earlier_12 > 0:
    settled = " ✅ Settled" if e_12 == 0 else ""
    add_line(1, 1, returned_earlier_12, f"Returned earlier: {name} {returned_earlier_12}x12kg empty{settled}")
  if e_12 < 0:
    add_line(2, 1, abs(e_12), f"Extra empties: {name} {abs(e_12)}x12kg empty")

  returned_earlier_48 = max(0, s_48 - max(e_48, 0))
  if e_48 > 0:
    add_line(0, 2, e_48, f"Remaining empties: {name} {e_48}x48kg empty")
  if returned_earlier_48 > 0:
    settled = " ✅ Settled" if e_48 == 0 else ""
    add_line(1, 2, returned_earlier_48, f"Returned earlier: {name} {returned_earlier_48}x48kg empty{settled}")
  if e_48 < 0:
    add_line(2, 2, abs(e_48), f"Extra empties: {name} {abs(e_48)}x48kg empty")

  return lines


def _snapshot_lines_for_company(
  *,
  session: Session,
  day: date,
  money_decimals: int,
) -> list[tuple[int, int, int, str]]:
  prev = day - timedelta(days=1)
  s_cash = sum_ledger(session, account="company_money_debts", unit="money", day_to=prev)
  e_cash = sum_ledger(session, account="company_money_debts", unit="money", day_to=day)
  s_12 = sum_ledger(
    session,
    account="company_cylinders_debts",
    gas_type="12kg",
    unit="count",
    day_to=prev,
  )
  e_12 = sum_ledger(
    session,
    account="company_cylinders_debts",
    gas_type="12kg",
    unit="count",
    day_to=day,
  )
  s_48 = sum_ledger(
    session,
    account="company_cylinders_debts",
    gas_type="48kg",
    unit="count",
    day_to=prev,
  )
  e_48 = sum_ledger(
    session,
    account="company_cylinders_debts",
    gas_type="48kg",
    unit="count",
    day_to=day,
  )

  lines: list[tuple[int, int, int, str]] = []

  def add_line(priority: int, sub: int, amount: int, text: str) -> None:
    if amount <= 0:
      return
    lines.append((priority, sub, -amount, text))

  paid_earlier = max(0, s_cash - max(e_cash, 0))
  if e_cash > 0:
    add_line(0, 0, e_cash, f"Remaining company payment: {_format_money_major(e_cash, money_decimals)}")
  if paid_earlier > 0:
    settled = " ✅ Settled" if e_cash == 0 else ""
    add_line(1, 0, paid_earlier, f"Paid earlier: company {_format_money_major(paid_earlier, money_decimals)}{settled}")
  if e_cash < 0:
    add_line(2, 0, abs(e_cash), f"Extra paid: company {_format_money_major(abs(e_cash), money_decimals)}")

  returned_earlier_12 = max(0, s_12 - max(e_12, 0))
  if e_12 > 0:
    add_line(0, 1, e_12, f"Remaining company empties: {e_12}x12kg empty")
  if returned_earlier_12 > 0:
    settled = " ✅ Settled" if e_12 == 0 else ""
    add_line(1, 1, returned_earlier_12, f"Returned earlier: company {returned_earlier_12}x12kg empty{settled}")
  if e_12 < 0:
    add_line(2, 1, abs(e_12), f"Extra empties: company {abs(e_12)}x12kg empty")

  returned_earlier_48 = max(0, s_48 - max(e_48, 0))
  if e_48 > 0:
    add_line(0, 2, e_48, f"Remaining company empties: {e_48}x48kg empty")
  if returned_earlier_48 > 0:
    settled = " ✅ Settled" if e_48 == 0 else ""
    add_line(1, 2, returned_earlier_48, f"Returned earlier: company {returned_earlier_48}x48kg empty{settled}")
  if e_48 < 0:
    add_line(2, 2, abs(e_48), f"Extra empties: company {abs(e_48)}x48kg empty")

  return lines

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
  sold_full = _sold_full_by_day(session, start_date, end_date)

  running_cash = _sum_cash_before_day(session, start_date)
  running_company = _sum_company_before_day(session, start_date)
  running_company_12 = _sum_company_cyl_before_day(session, start_date, "12kg")
  running_company_48 = _sum_company_cyl_before_day(session, start_date, "48kg")
  inv_start = _sum_inventory_before_day(session, start_date)
  running_full12 = inv_start.full12
  running_empty12 = inv_start.empty12
  running_full48 = inv_start.full48
  running_empty48 = inv_start.empty48

  settings = session.get(SystemSettings, "system")
  money_decimals = settings.money_decimals if settings else 2
  customers = {c.id: c for c in session.exec(select(Customer)).all()}

  cash_math_by_day = _cash_math_by_day(session, start_date, end_date)

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

  response: list[DailyReportV2Card] = []
  for current in _date_range(start_date, end_date):
    cash_start = running_cash
    running_cash += cash_deltas.get(current, 0)
    cash_end = running_cash
    net_today = cash_end - cash_start

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

    sold_12kg = sold_full.get((current, "12kg"), 0)
    sold_48kg = sold_full.get((current, "48kg"), 0)

    cash_math_values = {
      "sales": 0,
      "late": 0,
      "expenses": 0,
      "company": 0,
      "adjust": 0,
      "other": 0,
    }
    for key, value in (cash_math_by_day.get(current) or {}).items():
      if key in cash_math_values:
        cash_math_values[key] = int(value or 0)
    cash_math_total = sum(cash_math_values.values())
    remainder = net_today - cash_math_total
    if remainder:
      cash_math_values["other"] += remainder

    problem_entries: list[tuple[int, int, int, str]] = []
    problem_transitions: list[BalanceTransition] = []
    for customer_id in sorted(customer_activity_by_day.get(current, set())):
      transition_intent = None
      kinds = customer_activity_kinds.get((current, customer_id), set())
      if kinds == {"adjust"}:
        transition_intent = "customer_adjust"
      problem_entries.extend(
        _snapshot_lines_for_customer(
          session=session,
          day=current,
          customer_id=customer_id,
          customers=customers,
          money_decimals=money_decimals,
        )
      )
      problem_transitions.extend(
        _snapshot_transitions_for_customer(
          session=session,
          day=current,
          customer_id=customer_id,
          customers=customers,
          intent=transition_intent,
        )
      )
    if current in company_activity_days:
      problem_entries.extend(
        _snapshot_lines_for_company(
          session=session,
          day=current,
          money_decimals=money_decimals,
        )
      )
      problem_transitions.extend(
        _snapshot_transitions_for_company(
          session=session,
          day=current,
        )
      )
    problem_entries_sorted = sorted(problem_entries, key=lambda entry: (entry[0], entry[1], entry[2], entry[3]))
    problem_lines = [entry[3] for entry in problem_entries_sorted]
    if len(problem_lines) > 8:
      remaining = len(problem_lines) - 7
      problem_lines = problem_lines[:7] + [f"... +{remaining} more"]

    math_payload = DailyReportV2Math(
      customers={
        "sales_cash": customer_sales_by_day.get(current, 0),
        "paid_earlier": customer_pay_by_day.get(current, 0),
        "extra_paid": 0,
      },
      company={
        "paid_company": company_paid_by_day.get(current, 0),
        "extra_company": 0,
      },
      result={
        "expenses": expenses_by_day.get(current, 0),
        "adjustments": adjustments_by_day.get(current, 0),
        "pocket_delta": net_today,
      },
    )

    response.append(
      DailyReportV2Card(
        date=current.isoformat(),
        cash_start=cash_start,
        cash_end=cash_end,
        sold_12kg=sold_12kg,
        sold_48kg=sold_48kg,
        net_today=net_today,
        cash_math=DailyReportV2CashMath(**cash_math_values),
        math=math_payload,
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
        inventory_start=inv_start,
        inventory_end=inv_end,
        problems=problem_lines,
        problem_transitions=problem_transitions,
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
  bank_start = _sum_bank_before_day(session, business_date)
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
  ledger_rows = session.exec(select(LedgerEntry).where(LedgerEntry.day == business_date)).all()
  ledger_by_source: dict[tuple[str, str], list[LedgerEntry]] = defaultdict(list)
  for row in ledger_rows:
    ledger_by_source[(row.source_type, row.source_id)].append(row)

  # Load day-local source rows first so counterparty lookups can be scoped to the ids
  # that actually appear in this day detail.
  customer_txns = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.day == business_date)
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).all()
  adjustments = session.exec(
    select(InventoryAdjustment)
    .where(InventoryAdjustment.day == business_date)
    .where(InventoryAdjustment.is_reversed == False)  # noqa: E712
  ).all()
  company_txns = session.exec(
    select(CompanyTransaction)
    .where(CompanyTransaction.day == business_date)
    .where(CompanyTransaction.is_reversed == False)  # noqa: E712
  ).all()
  expenses = session.exec(
    select(Expense)
    .where(Expense.day == business_date)
    .where(Expense.is_reversed == False)  # noqa: E712
  ).all()
  cash_adjustments = session.exec(
    select(CashAdjustment)
    .where(CashAdjustment.day == business_date)
    .where(CashAdjustment.is_reversed == False)  # noqa: E712
  ).all()

  system_init_rows = [row for row in ledger_rows if row.source_type == "system_init"]
  involved_customer_ids = {
    row.customer_id
    for row in system_init_rows
    if row.customer_id
  }
  involved_customer_ids.update(txn.customer_id for txn in customer_txns if txn.customer_id)
  involved_system_ids = {txn.system_id for txn in customer_txns if txn.system_id}
  involved_category_ids = {expense.category_id for expense in expenses if expense.category_id}

  customers = (
    {
      customer.id: customer
      for customer in session.exec(select(Customer).where(Customer.id.in_(list(involved_customer_ids)))).all()
    }
    if involved_customer_ids
    else {}
  )
  systems = (
    {
      system.id: system
      for system in session.exec(select(System).where(System.id.in_(list(involved_system_ids)))).all()
    }
    if involved_system_ids
    else {}
  )
  categories = (
    {
      category.id: category.name
      for category in session.exec(
        select(ExpenseCategory).where(ExpenseCategory.id.in_(list(involved_category_ids)))
      ).all()
    }
    if involved_category_ids
    else {}
  )
  settings = session.get(SystemSettings, "system")
  money_decimals = settings.money_decimals if settings else 2

  events: list[DailyReportV2Event] = []
  stable_row_key = lambda row: (row.happened_at, row.created_at, row.id)

  # system init entries (opening balances)
  if system_init_rows:
    by_source: dict[str, list[LedgerEntry]] = defaultdict(list)
    for row in system_init_rows:
      by_source[row.source_id].append(row)
    for source_id, rows in by_source.items():
      general_rows = [row for row in rows if not row.customer_id]
      customer_rows: dict[str, list[LedgerEntry]] = defaultdict(list)
      for row in rows:
        if row.customer_id:
          customer_rows[row.customer_id].append(row)

      if general_rows:
        base = min(general_rows, key=stable_row_key)
        event = DailyReportV2Event(
          id=f"{source_id}:system",
          event_type="init",
          effective_at=base.happened_at,
          created_at=base.happened_at,
          source_id=source_id,
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
          reason="System initialization",
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
        events.append(event)

      for customer_id, scoped_rows in customer_rows.items():
        base = min(scoped_rows, key=stable_row_key)
        customer = customers.get(customer_id)
        cust_name, cust_desc = _customer_identity(customer)
        event = DailyReportV2Event(
          id=f"{source_id}:customer:{customer_id}",
          event_type="init",
          effective_at=base.happened_at,
          created_at=base.happened_at,
          source_id=source_id,
          label=None,
          label_short=None,
          order_mode=None,
          gas_type=None,
          customer_id=customer_id,
          customer_name=cust_name,
          customer_description=cust_desc,
          system_name=None,
          system_type=None,
          expense_type=None,
          reason="Customer opening balance",
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
        events.append(event)

  grouped_returns: dict[str, list[CustomerTransaction]] = defaultdict(list)
  grouped_adjustments: dict[str, list[CustomerTransaction]] = defaultdict(list)
  other_txns: list[CustomerTransaction] = []
  for txn in customer_txns:
    if txn.kind == "return" and txn.group_id:
      grouped_returns[txn.group_id].append(txn)
    elif txn.kind == "adjust":
      grouped_adjustments[txn.group_id or txn.id].append(txn)
    else:
      other_txns.append(txn)
  return_group_txn_ids: dict[str, list[str]] = {
    group_id: [t.id for t in txns] for group_id, txns in grouped_returns.items()
  }
  adjust_group_txn_ids: dict[str, list[str]] = {
    group_id: [t.id for t in txns] for group_id, txns in grouped_adjustments.items()
  }

  for txn in other_txns:
    source_key = ("customer_txn", txn.id)
    entry_rows = ledger_by_source.get(source_key, [])
    event_type = (
      "order"
      if txn.kind == "order"
      else "collection_money"
      if txn.kind == "payment"
      else "collection_payout"
      if txn.kind == "payout"
      else "customer_adjust"
    )
    if txn.kind == "adjust":
      event_type = "customer_adjust"
    customer = customers.get(txn.customer_id)
    cust_name, cust_desc = _customer_identity(customer)
    system = systems.get(txn.system_id) if txn.system_id else None
    cash_delta = sum(row.amount for row in entry_rows if row.account == "cash")
    inv_rows = [row for row in entry_rows if row.account == "inv"]
    event = DailyReportV2Event(
      event_type=event_type,
      effective_at=txn.happened_at,
      created_at=txn.created_at,
      source_id=txn.id,
      label=None,
      label_short=None,
      order_mode=txn.mode if txn.kind == "order" else None,
      gas_type=txn.gas_type,
      customer_id=txn.customer_id,
      customer_name=cust_name,
      customer_description=cust_desc,
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
    events.append(event)

  for group_id, txns in grouped_returns.items():
    base = min(txns, key=stable_row_key)
    qty_12 = sum(t.received for t in txns if t.gas_type == "12kg")
    qty_48 = sum(t.received for t in txns if t.gas_type == "48kg")
    customer = customers.get(base.customer_id)
    cust_name, cust_desc = _customer_identity(customer)
    system = systems.get(base.system_id) if base.system_id else None
    event = DailyReportV2Event(
      event_type="collection_empty",
      effective_at=base.happened_at,
      created_at=base.created_at,
      source_id=group_id,
      label=None,
      label_short=None,
      order_mode=None,
      gas_type=None,
      customer_id=base.customer_id,
      customer_name=cust_name,
      customer_description=cust_desc,
      system_name=system.name if system else None,
      system_type=system.name if system else None,
      expense_type=None,
      reason=base.note,
      buy12=None,
      return12=qty_12,
      buy48=None,
      return48=qty_48,
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
    events.append(event)

  for group_id, txns in grouped_adjustments.items():
    base = min(txns, key=stable_row_key)
    customer = customers.get(base.customer_id)
    cust_name, cust_desc = _customer_identity(customer)
    event = DailyReportV2Event(
      event_type="customer_adjust",
      effective_at=base.happened_at,
      created_at=base.created_at,
      source_id=group_id,
      label=None,
      label_short=None,
      order_mode=None,
      gas_type=None,
      customer_id=base.customer_id,
      customer_name=cust_name,
      customer_description=cust_desc,
      system_name=None,
      system_type=None,
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
    events.append(event)

  # inventory adjustments
  for adj in adjustments:
    event = DailyReportV2Event(
      event_type="adjust",
      effective_at=adj.happened_at,
      created_at=adj.created_at,
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
    events.append(event)

  # company transactions
  for txn in company_txns:
    event_type = "refill"
    buy12 = txn.buy12
    buy48 = txn.buy48
    return12 = txn.return12
    return48 = txn.return48
    total_cost = txn.total
    paid_now = txn.paid
    if txn.kind == "payment":
      event_type = "company_payment"
      buy12 = None
      buy48 = None
      return12 = None
      return48 = None
      total_cost = txn.paid
      paid_now = txn.paid
    elif txn.kind == "buy_iron":
      event_type = "company_buy_iron"
      buy12 = txn.new12
      buy48 = txn.new48
      return12 = 0
      return48 = 0
    elif (
      txn.kind == "refill"
      and (txn.new12 or txn.new48)
      and not (txn.buy12 or txn.buy48 or txn.return12 or txn.return48)
    ):
      # Legacy data: new shells stored as a refill with no swap quantities.
      event_type = "company_buy_iron"
      buy12 = txn.new12
      buy48 = txn.new48
      return12 = 0
      return48 = 0
    event = DailyReportV2Event(
      event_type=event_type,
      effective_at=txn.happened_at,
      created_at=txn.created_at,
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
      buy12=buy12,
      return12=return12,
      buy48=buy48,
      return48=return48,
      total_cost=total_cost,
      paid_now=paid_now,
      order_total=None,
      order_paid=None,
      order_installed=None,
      order_received=None,
      cash_before=None,
      cash_after=None,
      inventory_before=None,
      inventory_after=None,
    )
    events.append(event)

  # expenses and deposits
  for expense in expenses:
    if expense.kind == "deposit":
      event_type = "bank_deposit"
    else:
      event_type = "expense"
    event = DailyReportV2Event(
      event_type=event_type,
      effective_at=expense.happened_at,
      created_at=expense.created_at,
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
      transfer_direction="bank_to_wallet" if expense.paid_from == "bank" else "wallet_to_bank",
      reason=expense.note,
      buy12=None,
      return12=None,
      buy48=None,
      return48=None,
      total_cost=expense.amount,
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
    events.append(event)

  for adjustment in cash_adjustments:
    event = DailyReportV2Event(
      event_type="cash_adjust",
      effective_at=adjustment.happened_at,
      created_at=adjustment.created_at,
      source_id=adjustment.id,
      label=None,
      label_short=None,
      order_mode=None,
      gas_type=None,
      customer_id=None,
      customer_name=None,
      customer_description=None,
      system_name=None,
      system_type=None,
      expense_type="Cash Adjustment",
      reason=adjustment.note,
      buy12=None,
      return12=None,
      buy48=None,
      return48=None,
      total_cost=adjustment.delta_cash,
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
    events.append(event)

  def _event_source_key(event: DailyReportV2Event) -> Optional[tuple[str, str]]:
    if not event.source_id:
      return None
    if event.event_type in {"order", "collection_money", "collection_payout", "collection_empty", "customer_adjust"}:
      return ("customer_txn", event.source_id)
    if event.event_type in {"refill", "company_payment", "company_buy_iron"}:
      return ("company_txn", event.source_id)
    if event.event_type == "init":
      return ("system_init", event.source_id)
    if event.event_type in {"expense", "bank_deposit"}:
      return ("expense", event.source_id)
    if event.event_type == "cash_adjust":
      return ("cash_adjust", event.source_id)
    if event.event_type == "adjust":
      return ("inventory_adjust", event.source_id)
    return None

  def _ledger_entries_for_event(event: DailyReportV2Event) -> list[LedgerEntry]:
    if event.event_type == "init":
      rows = ledger_by_source.get(("system_init", event.source_id), [])
      if event.customer_id:
        return [row for row in rows if row.customer_id == event.customer_id]
      return [row for row in rows if not row.customer_id]
    if event.event_type == "collection_empty" and event.source_id in return_group_txn_ids:
      rows: list[LedgerEntry] = []
      for txn_id in return_group_txn_ids[event.source_id]:
        rows.extend(ledger_by_source.get(("customer_txn", txn_id), []))
      return rows
    if event.event_type == "customer_adjust" and event.source_id in adjust_group_txn_ids:
      rows: list[LedgerEntry] = []
      for txn_id in adjust_group_txn_ids[event.source_id]:
        rows.extend(ledger_by_source.get(("customer_txn", txn_id), []))
      return rows
    source_key = _event_source_key(event)
    return ledger_by_source.get(source_key, []) if source_key else []

  event_entries: dict[int, list[LedgerEntry]] = {}
  event_sort_ids: dict[int, str] = {}
  for event in events:
    rows = _ledger_entries_for_event(event)
    event_entries[id(event)] = rows
    boundary = boundary_from_entries(rows)
    event_sort_ids[id(event)] = boundary.entry_id if boundary else (event.source_id or event.event_type or "")

  # sort and apply running balances for cash/inventory
  # Canonical feed ordering is effective business time first, then creation time,
  # then a stable ledger/source tie-breaker. Running balance assignment uses the
  # same key in ascending order; the returned feed reverses that order for display.
  events.sort(
    key=lambda ev: _event_order_key(ev, event_sort_ids=event_sort_ids)
  )
  customer_state_by_id = _seed_customer_states_before_day(
    session,
    customer_ids={event.customer_id for event in events if event.customer_id},
    day=business_date,
  )
  running_cash = cash_start
  running_bank = bank_start
  running_company = company_start
  running_company_12 = company_12kg_start
  running_company_48 = company_48kg_start
  running_full = {"12kg": inventory_start.full12, "48kg": inventory_start.full48}
  running_empty = {"12kg": inventory_start.empty12, "48kg": inventory_start.empty48}
  event_rows: list[DailyReportV2Event] = []

  for event in events:
    entry_rows = event_entries.get(id(event), [])
    cash_delta = sum(row.amount for row in entry_rows if row.account == "cash")
    bank_delta = sum(row.amount for row in entry_rows if row.account == "bank")
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

    event.bank_before = running_bank
    event.bank_after = running_bank + bank_delta
    running_bank = event.bank_after

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

    customer_before: Optional[CustomerLedgerState] = None
    customer_after: Optional[CustomerLedgerState] = None
    if event.customer_id:
      customer_before = customer_state_by_id.get(event.customer_id, (0, 0, 0))
      customer_delta = _customer_state_delta_from_entries(entry_rows)
      customer_after = _add_customer_state(customer_before, customer_delta)
      customer_state_by_id[event.customer_id] = customer_after
      event.customer_money_before = customer_before[0]
      event.customer_money_after = customer_after[0]
      event.customer_12kg_before = customer_before[1]
      event.customer_12kg_after = customer_after[1]
      event.customer_48kg_before = customer_before[2]
      event.customer_48kg_after = customer_after[2]

    if customer_before is not None and customer_after is not None:
      event.balance_transitions = _customer_balance_transitions(
        before=customer_before,
        after=customer_after,
        include_static=False,
        intent="customer_adjust" if event.event_type == "customer_adjust" else None,
      )
    elif event.event_type in {"refill", "company_payment", "company_buy_iron", "init"}:
      event.balance_transitions = _company_balance_transitions(
        money_before=event.company_before or 0,
        money_after=event.company_after or 0,
        cyl12_before=event.company_12kg_before or 0,
        cyl12_after=event.company_12kg_after or 0,
        cyl48_before=event.company_48kg_before or 0,
        cyl48_after=event.company_48kg_after or 0,
        include_static=False,
      )
    else:
      event.balance_transitions = []

    _apply_ticket_fields(event)
    _apply_level3_fields(event, customer_after=customer_after)
    _apply_status_fields(
      event,
      customer_before=customer_before,
      customer_after=customer_after,
    )
    notes = _notes_for_event(
      event,
      customer_before=customer_before,
      customer_after=customer_after,
      money_decimals=money_decimals,
    )
    _apply_ui_fields(event, money_decimals=money_decimals, notes=notes)

    event_rows.append(event)

  event_rows.sort(
    key=lambda ev: _event_order_key(ev, event_sort_ids=event_sort_ids),
    reverse=True,
  )

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
    inventory_start=inventory_start,
    inventory_end=inventory_end,
    audit_summary=get_daily_audit_summary(session, business_date),
    events=event_rows,
  )

