from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Literal

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
  DailyAuditSummary,
  DailyReportV2Card,
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
  if event.event_type == "refill" and _is_company_return_only_refill(event):
    return "Return Emp"
  return _EVENT_LABELS.get(event.event_type, _titleize_event_type(event.event_type))


def _safe_int(value: Optional[int]) -> int:
  if value is None:
    return 0
  return int(value)


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
  if event.event_type in {"order", "collection_money", "collection_empty", "collection_payout"}:
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
    return Level3Hero(text="Bank Deposit")
  if event.event_type == "collection_payout":
    return Level3Hero(text="Customer Payout")
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
    total = _safe_int(event.total_cost)
    if total:
      verb = "received"
      amount = abs(total)
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
  customer_debt: Optional[tuple[int, int, int]] = None,
) -> Level3Settlement:
  if event.event_type in {"order", "collection_money", "collection_empty", "collection_payout"}:
    if customer_debt is not None:
      debt_cash, debt_12, debt_48 = customer_debt
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
  if event.event_type == "expense":
    return event.expense_type or "Expense"
  if event.event_type == "bank_deposit":
    return "Deposit"
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
    event.status = "balance_settled" if len(notes) == 0 else "needs_action"
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
  customer_debt: Optional[tuple[int, int, int]] = None,
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
  event.settlement = _level3_settlement(event, customer_debt=customer_debt)
  if event.counterparty and event.counterparty.type == "customer" and customer_debt is not None:
    event.open_actions = _customer_actions_from_debt(*customer_debt)
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
    "company_payment",
  }:
    return "settlement"
  if event.event_type == "refill" and _is_company_return_only_refill(event):
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
  customer_debt: Optional[tuple[int, int, int]] = None,
) -> list[Level3Action]:
  if event.event_type == "order" and event.order_mode == "replacement":
    actions: list[Level3Action] = []
    total = _safe_int(event.order_total)
    paid = _safe_int(event.order_paid)
    diff = total - paid
    gas = _gas_short(event.gas_type)
    installed = _safe_int(event.order_installed)
    received = _safe_int(event.order_received)

    if installed > received and gas:
      actions.append(_empty_pill(direction="customer->dist", gas=gas, qty=installed - received))
    elif received > installed and gas:
      actions.append(_full_pill(direction="dist->customer", gas=gas, qty=received - installed))

    if diff > 0:
      actions.append(_money_pill("customer->dist", diff))
    elif diff < 0:
      actions.append(_money_pill("dist->customer", abs(diff)))
    return actions

  if event.event_type == "refill" and _is_company_return_only_refill(event):
    actions: list[Level3Action] = []
    if isinstance(event.company_12kg_after, int) and event.company_12kg_after < 0:
      actions.append(_empty_pill(direction="dist->company", gas="12", qty=abs(event.company_12kg_after)))
    if isinstance(event.company_48kg_after, int) and event.company_48kg_after < 0:
      actions.append(_empty_pill(direction="dist->company", gas="48", qty=abs(event.company_48kg_after)))
    return actions

  if event.event_type == "refill":
    actions: list[Level3Action] = []
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
    return actions

  if event.event_type == "collection_money":
    actions: list[Level3Action] = []
    if customer_debt is None:
      return actions
    debt_cash, debt_12, debt_48 = customer_debt
    event.has_other_outstanding_cylinders = debt_12 != 0 or debt_48 != 0
    if debt_cash > 0:
      paid = 0
      if isinstance(event.cash_before, int) and isinstance(event.cash_after, int):
        paid = max(event.cash_after - event.cash_before, 0)
      was = debt_cash + paid
      text = f"Customer still owes you {_format_money(debt_cash)} (was {_format_money(was)})"
      actions.append(
        _pill(
          category="money",
          kind="money",
          direction="customer->dist",
          severity="warning",
          text=text,
          amount=debt_cash,
        )
      )
    return actions

  if event.event_type == "collection_empty":
    actions: list[Level3Action] = []
    if customer_debt is None:
      return actions
    debt_cash, debt_12, debt_48 = customer_debt
    event.has_other_outstanding_cash = debt_cash != 0

    if debt_12 > 0:
      returned = _safe_int(event.return12)
      was = debt_12 + returned
      text = f"Customer still owes {debt_12}x12kg empty (was {was})"
      actions.append(
        _pill(
          category="cylinders",
          kind="empty_12",
          direction="customer->dist",
          severity="warning",
          text=text,
          gas_type="12",
          qty=debt_12,
          unit="empty",
        )
      )
    if debt_48 > 0:
      returned = _safe_int(event.return48)
      was = debt_48 + returned
      text = f"Customer still owes {debt_48}x48kg empty (was {was})"
      actions.append(
        _pill(
          category="cylinders",
          kind="empty_48",
          direction="customer->dist",
          severity="warning",
          text=text,
          gas_type="48",
          qty=debt_48,
          unit="empty",
        )
      )
    return actions

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
    "you_pay_company",
    "customer_returns_you",
    "you_return_company",
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
  customer_debt: Optional[tuple[int, int, int]] = None,
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

    if installed > received and gas:
      kind = "cyl_12" if gas == "12" else "cyl_48"
      notes.append(
        _note(
          kind=kind,
          direction="customer_returns_you",
          remaining_after=installed - received,
        )
      )
    elif received > installed and gas:
      kind = "cyl_full_12" if gas == "12" else "cyl_full_48"
      notes.append(
        _note(
          kind=kind,
          direction="you_deliver_customer",
          remaining_after=received - installed,
        )
      )

    if diff > 0:
      notes.append(
        _note(
          kind="money",
          direction="customer_pays_you",
          remaining_after=_money_major(diff, money_decimals),
        )
      )
    return notes

  if event.event_type == "refill":
    if _is_company_return_only_refill(event):
      if isinstance(event.company_12kg_after, int) and event.company_12kg_after < 0:
        remaining_before = None
        if isinstance(event.company_12kg_before, int) and event.company_12kg_before < 0:
          remaining_before = abs(event.company_12kg_before)
        notes.append(
          _note(
            kind="cyl_12",
            direction="you_return_company",
            remaining_after=abs(event.company_12kg_after),
            remaining_before=remaining_before,
          )
        )
      if isinstance(event.company_48kg_after, int) and event.company_48kg_after < 0:
        remaining_before = None
        if isinstance(event.company_48kg_before, int) and event.company_48kg_before < 0:
          remaining_before = abs(event.company_48kg_before)
        notes.append(
          _note(
            kind="cyl_48",
            direction="you_return_company",
            remaining_after=abs(event.company_48kg_after),
            remaining_before=remaining_before,
          )
        )
      return notes

    buy12 = _safe_int(event.buy12)
    return12 = _safe_int(event.return12)
    buy48 = _safe_int(event.buy48)
    return48 = _safe_int(event.return48)
    if buy12 > return12:
      notes.append(
        _note(
          kind="cyl_12",
          direction="you_return_company",
          remaining_after=buy12 - return12,
        )
      )
    elif return12 > buy12:
      notes.append(
        _note(
          kind="cyl_full_12",
          direction="company_delivers_you",
          remaining_after=return12 - buy12,
        )
      )
    if buy48 > return48:
      notes.append(
        _note(
          kind="cyl_48",
          direction="you_return_company",
          remaining_after=buy48 - return48,
        )
      )
    elif return48 > buy48:
      notes.append(
        _note(
          kind="cyl_full_48",
          direction="company_delivers_you",
          remaining_after=return48 - buy48,
        )
      )
    total_cost = _safe_int(event.total_cost)
    paid_now = _safe_int(event.paid_now)
    diff = total_cost - paid_now
    if diff > 0:
      notes.append(
        _note(
          kind="money",
          direction="you_pay_company",
          remaining_after=_money_major(diff, money_decimals),
        )
      )
    return notes

  if event.event_type == "collection_money":
    if customer_debt is None:
      return notes
    debt_cash, debt_12, debt_48 = customer_debt
    event.has_other_outstanding_cylinders = debt_12 != 0 or debt_48 != 0
    if debt_cash > 0:
      paid = 0
      if isinstance(event.cash_before, int) and isinstance(event.cash_after, int):
        paid = max(event.cash_after - event.cash_before, 0)
      remaining_after = _money_major(debt_cash, money_decimals)
      remaining_before = _money_major(debt_cash + paid, money_decimals)
      notes.append(
        _note(
          kind="money",
          direction="customer_pays_you",
          remaining_after=remaining_after,
          remaining_before=remaining_before,
        )
      )
    return notes

  if event.event_type == "collection_empty":
    if customer_debt is None:
      return notes
    debt_cash, debt_12, debt_48 = customer_debt
    event.has_other_outstanding_cash = debt_cash != 0

    if debt_12 > 0:
      returned = _safe_int(event.return12)
      notes.append(
        _note(
          kind="cyl_12",
          direction="customer_returns_you",
          remaining_after=debt_12,
          remaining_before=debt_12 + returned,
        )
      )
    if debt_48 > 0:
      returned = _safe_int(event.return48)
      notes.append(
        _note(
          kind="cyl_48",
          direction="customer_returns_you",
          remaining_after=debt_48,
          remaining_before=debt_48 + returned,
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
  customer_debt: Optional[tuple[int, int, int]] = None,
) -> None:
  event.is_atomic_ok = event.is_balanced if event.is_balanced is not None else None
  mode = _status_mode(event)
  event.status_mode = mode
  event.action_pills = _remaining_actions_for_event(event, customer_debt=customer_debt)
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
  settings = session.get(SystemSettings, "system")
  money_decimals = settings.money_decimals if settings else 2

  events: list[DailyReportV2Event] = []
  stable_row_key = lambda row: (row.happened_at, row.created_at, row.id)

  # system init entries (opening balances)
  system_init_rows = [row for row in ledger_rows if row.source_type == "system_init"]
  if system_init_rows:
    by_source: dict[str, list[LedgerEntry]] = defaultdict(list)
    for row in system_init_rows:
      by_source[row.source_id].append(row)
    for source_id, rows in by_source.items():
      base = min(rows, key=stable_row_key)
      event = DailyReportV2Event(
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

  # group return transactions by group_id
  customer_txns = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.day == business_date)
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).all()
  customer_txn_by_id = {txn.id: txn for txn in customer_txns}
  grouped_returns: dict[str, list[CustomerTransaction]] = defaultdict(list)
  other_txns: list[CustomerTransaction] = []
  for txn in customer_txns:
    if txn.kind == "return" and txn.group_id:
      grouped_returns[txn.group_id].append(txn)
    else:
      other_txns.append(txn)
  return_group_txn_ids: dict[str, list[str]] = {
    group_id: [t.id for t in txns] for group_id, txns in grouped_returns.items()
  }
  return_group_latest: dict[str, CustomerTransaction] = {}
  for group_id, txns in grouped_returns.items():
    return_group_latest[group_id] = max(txns, key=stable_row_key)

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
  company_txns = session.exec(
    select(CompanyTransaction)
    .where(CompanyTransaction.day == business_date)
    .where(CompanyTransaction.is_reversed == False)  # noqa: E712
  ).all()
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
  expenses = session.exec(
    select(Expense)
    .where(Expense.day == business_date)
    .where(Expense.is_reversed == False)  # noqa: E712
  ).all()
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

  cash_adjustments = session.exec(
    select(CashAdjustment)
    .where(CashAdjustment.day == business_date)
    .where(CashAdjustment.is_reversed == False)  # noqa: E712
  ).all()
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
    if event.event_type == "collection_empty" and event.source_id in return_group_txn_ids:
      rows: list[LedgerEntry] = []
      for txn_id in return_group_txn_ids[event.source_id]:
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
  events.sort(
    key=lambda ev: (ev.effective_at, ev.created_at, event_sort_ids.get(id(ev), ev.source_id or ""))
  )
  running_cash = cash_start
  running_company = company_start
  running_company_12 = company_12kg_start
  running_company_48 = company_48kg_start
  running_full = {"12kg": inventory_start.full12, "48kg": inventory_start.full48}
  running_empty = {"12kg": inventory_start.empty12, "48kg": inventory_start.empty48}
  event_rows: list[DailyReportV2Event] = []

  for event in events:
    entry_rows = event_entries.get(id(event), [])
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

    customer_debt: Optional[tuple[int, int, int]] = None
    if event.event_type == "collection_empty" and event.source_id in return_group_latest:
      txn = return_group_latest[event.source_id]
      customer_debt = (txn.debt_cash, txn.debt_cylinders_12, txn.debt_cylinders_48)
    elif event.source_id and event.event_type in {
      "order",
      "collection_money",
      "collection_payout",
      "customer_adjust",
    }:
      txn = customer_txn_by_id.get(event.source_id)
      if txn:
        customer_debt = (txn.debt_cash, txn.debt_cylinders_12, txn.debt_cylinders_48)

    _apply_ticket_fields(event)
    _apply_level3_fields(event, customer_debt=customer_debt)
    _apply_status_fields(event, customer_debt=customer_debt)
    notes = _notes_for_event(event, customer_debt=customer_debt, money_decimals=money_decimals)
    _apply_ui_fields(event, money_decimals=money_decimals, notes=notes)

    if event.event_type not in {"customer_adjust", "init"}:
      event_rows.append(event)

  event_rows.sort(
    key=lambda ev: (ev.effective_at, ev.created_at, event_sort_ids.get(id(ev), ev.id or ev.source_id or "")),
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
