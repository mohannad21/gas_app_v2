"""Reports event field enrichment and UI decoration.

Handles all event enrichment, UI field application, pill factories, note builders,
and Level3 schema construction for the daily reporting system.
"""

from typing import Literal, Optional

from app.models import Customer
from app.schemas import ActivityNote, DailyReportEvent, Level3Action, Level3Counterparty, Level3Hero, Level3Money, Level3Settlement, Level3SettlementComponents, Level3System
from app.utils.time import business_local_datetime_from_utc

from .reports_aggregates import CustomerLedgerState


# Display labels for event types
_EVENT_LABELS: dict[str, str] = {
  "refill": "Refill",
  "company_buy_iron": "Bought full cylinders",
  "collection_money": "Payment from customer",
  "collection_empty": "Returned empties",
  "company_payment": "Payment to company",
  "expense": "Expense",
  "bank_deposit": "Deposit",
  "adjust": "Inventory adjustment",
  "cash_adjust": "Wallet adjustment",
  "collection_payout": "Payment to customer",
  "customer_adjust": "Balance adjustment",
  "init": "Opening balance",
}

_ORDER_LABELS: dict[str, str] = {
  "replacement": "Replacement",
  "sell_iron": "Sell Full",
  "buy_iron": "Buy Empty",
}


def _titleize_event_type(event_type: str) -> str:
  return " ".join(part.capitalize() for part in event_type.split("_"))


def _customer_identity(customer: Optional[Customer]) -> tuple[Optional[str], Optional[str]]:
  if customer is None:
    return ("Deleted customer", "Missing customer")
  return (customer.name, customer.note)


def _company_payment_label(event: DailyReportEvent) -> str:
  paid = _safe_int(event.paid_now or event.total_cost)
  if paid < 0:
    return "Payment from company"
  return "Payment to company"


def _event_label(event: DailyReportEvent) -> str:
  if event.event_type == "order":
    if event.order_mode:
      return _ORDER_LABELS.get(event.order_mode, "Order")
    return "Order"
  if event.event_type == "refill" and _is_company_return_only_refill(event):
    return "Returned empties"
  if event.event_type == "refill" and _is_company_settle_only_refill(event):
    return "Returned empties"
  if event.event_type == "company_payment":
    paid = _safe_int(event.paid_now or event.total_cost)
    if paid < 0:
      return "Payment from company"
    return "Payment to company"
  if event.event_type == "bank_deposit":
    return "Bank → Wallet" if event.transfer_direction == "bank_to_wallet" else "Wallet → Bank"
  return _EVENT_LABELS.get(event.event_type, _titleize_event_type(event.event_type))


def _safe_int(value: Optional[int]) -> int:
  if value is None:
    return 0
  return int(value)


def _is_company_return_only_refill(event: DailyReportEvent) -> bool:
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


def _is_company_receive_only_refill(event: DailyReportEvent) -> bool:
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


def _is_company_settle_only_refill(event: DailyReportEvent) -> bool:
  return _is_company_return_only_refill(event) or _is_company_receive_only_refill(event)


def _event_is_balanced(event: DailyReportEvent) -> bool:
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


def _event_action_lines(event: DailyReportEvent) -> list[str]:
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


def _apply_ticket_fields(event: DailyReportEvent) -> None:
  if not event.id:
    event.id = event.source_id or f"{event.event_type}:{event.effective_at.isoformat()}"
  event.label = _event_label(event)
  event.label_short = event.label
  event.is_balanced = _event_is_balanced(event)
  event.action_lines = _event_action_lines(event)


def _level3_counterparty(event: DailyReportEvent) -> Level3Counterparty:
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
  if event.event_type in {"refill", "company_payment", "company_buy_iron", "company_adjustment"}:
    return Level3Counterparty(type="company", display_name="Company", description=None, display="Company")
  return Level3Counterparty(type="none", display_name=None, description=None, display=None)


def _level3_system(event: DailyReportEvent) -> Optional[Level3System]:
  if event.event_type == "order" and event.order_mode == "replacement":
    if event.system_name:
      return Level3System(display_name=event.system_name)
  return None


def _level3_hero(event: DailyReportEvent) -> Level3Hero:
  gas = f" {event.gas_type}" if event.gas_type else ""
  if event.event_type == "order":
    if event.order_mode == "replacement":
      return Level3Hero(text=f"Replacement{gas}".strip())
    if event.order_mode == "sell_iron":
      return Level3Hero(text=f"Sell Full{gas}".strip())
    if event.order_mode == "buy_iron":
      return Level3Hero(text=f"Buy Empty{gas}".strip())
    return Level3Hero(text="Order")
  if event.event_type == "collection_money":
    return Level3Hero(text="Payment from customer")
  if event.event_type == "collection_empty":
    return Level3Hero(text="Returned empties")
  if event.event_type == "refill":
    if _is_company_settle_only_refill(event):
      return Level3Hero(text="Returned empties")
    return Level3Hero(text="Refill")
  if event.event_type == "company_payment":
    return Level3Hero(text=_company_payment_label(event))
  if event.event_type == "company_buy_iron":
    return Level3Hero(text="Bought full cylinders")
  if event.event_type == "company_adjustment":
    return Level3Hero(text="Balance adjustment")
  if event.event_type == "expense":
    if event.expense_type:
      return Level3Hero(text=f"Expense: {event.expense_type}")
    return Level3Hero(text="Expense")
  if event.event_type == "adjust":
    return Level3Hero(text="Inventory adjustment")
  if event.event_type == "cash_adjust":
    return Level3Hero(text="Wallet adjustment")
  if event.event_type == "bank_deposit":
    return Level3Hero(text=_event_label(event))
  if event.event_type == "collection_payout":
    return Level3Hero(text="Payment to customer")
  if event.event_type == "customer_adjust":
    return Level3Hero(text="Balance adjustment")
  if event.event_type == "init":
    return Level3Hero(text="Opening balance")
  return Level3Hero(text=_titleize_event_type(event.event_type))


def _cash_delta(event: DailyReportEvent) -> int:
  if event.cash_before is None or event.cash_after is None:
    return 0
  return int(event.cash_after - event.cash_before)


def _level3_money(event: DailyReportEvent) -> Level3Money:
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
  elif event.event_type == "company_buy_iron":
    paid = _safe_int(event.paid_now or event.total_cost)
    if paid:
      verb = "paid"
      amount = abs(paid)
  elif event.event_type == "company_payment":
    paid = _safe_int(event.paid_now or event.total_cost)
    if paid < 0:
      verb = "received"
      amount = abs(paid)
    elif paid > 0:
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
  event: DailyReportEvent,
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


def _event_kind(event: DailyReportEvent) -> str:
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


def _time_display(value) -> str:
  return business_local_datetime_from_utc(value).strftime("%H:%M")


def _hero_text_for_event(event: DailyReportEvent, money_decimals: int) -> str:
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
      return f"Payment from customer {_format_money_major(amount, money_decimals)}"
    return "Payment from customer"
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
    label = _company_payment_label(event)
    if amount:
      return f"{label} {_format_money_major(amount, money_decimals)}"
    return label
  if event.event_type == "collection_payout":
    amount = event.money_amount if isinstance(event.money_amount, int) else 0
    if amount:
      return f"Payment to customer {_format_money_major(amount, money_decimals)}"
    return "Payment to customer"
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
    return "Wallet adjustment"
  if event.event_type == "adjust":
    return "Inventory adjustment"
  return event.hero.text if event.hero else (event.label or "Activity")


def _activity_type(event: DailyReportEvent) -> str:
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


def _context_line(event: DailyReportEvent) -> str:
  label = event.label or _titleize_event_type(event.event_type)
  parts = [label, _time_display(event.effective_at)]
  if event.event_type == "order" and event.order_mode == "replacement" and event.system_name:
    parts.append(f"System: {event.system_name}")
  return " · ".join(parts)


def _apply_ui_fields(
  event: DailyReportEvent,
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

  # Some event builders leave list-shaped UI fields as None for unsupported
  # event types. Normalize them here so report rendering never crashes.
  if not isinstance(event.action_pills, list):
    event.action_pills = []
  if not isinstance(event.remaining_actions, list):
    event.remaining_actions = []
  if not isinstance(event.open_actions, list):
    event.open_actions = []

  event.notes = notes

  event.remaining_actions = list(event.action_pills)
  has_remaining_actions = len(event.remaining_actions) > 0

  if event.status_mode == "settlement":
    event.is_ok = event.settlement.is_settled if event.settlement is not None else not has_remaining_actions
    event.status = "balance_settled" if event.is_ok and not has_remaining_actions else "needs_action"
  else:
    if event.is_atomic_ok and len(notes) == 0:
      event.status = "atomic_ok"
      event.is_ok = True
    else:
      event.status = "needs_action"
      event.is_ok = False

  if event.is_ok:
    event.status_badge = "Balance settled" if event.status_mode == "settlement" else "OK"
  else:
    event.status_badge = None


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
  event: DailyReportEvent,
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


def _status_mode(event: DailyReportEvent) -> Literal["atomic", "settlement"]:
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


def _atomic_action_pills(event: DailyReportEvent) -> list[Level3Action]:
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
  event: DailyReportEvent,
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

  return []


def _note(
  *,
  kind: str,
  direction: str,
  remaining_after: int,
  remaining_before: Optional[int] = None,
) -> ActivityNote:
  return ActivityNote(
    kind=kind,
    direction=direction,
    remaining_after=remaining_after,
    remaining_before=remaining_before,
  )


def _remaining_before_value(before: Optional[int], after: int) -> Optional[int]:
  if before is None or before == 0:
    return None
  if before > 0 and after > 0:
    return before
  if before < 0 and after < 0:
    return abs(before)
  return None


def _append_money_note(
  notes: list[ActivityNote],
  *,
  before: Optional[int],
  after: Optional[int],
  positive_direction: str,
  negative_direction: str,
) -> None:
  if after is None or after == 0:
    return
  if after > 0:
    notes.append(
      _note(
        kind="money",
        direction=positive_direction,
        remaining_after=after,
        remaining_before=_remaining_before_value(before, after),
      )
    )
    return
  notes.append(
    _note(
      kind="money",
      direction=negative_direction,
      remaining_after=abs(after),
      remaining_before=_remaining_before_value(before, after),
    )
  )


def _append_cylinder_note(
  notes: list[ActivityNote],
  *,
  before: Optional[int],
  after: Optional[int],
  empty_kind: str,
  full_kind: str,
  empty_direction: str,
  full_direction: str,
) -> None:
  if after is None or after == 0:
    return
  if after > 0:
    notes.append(
      _note(
        kind=empty_kind,
        direction=empty_direction,
        remaining_after=after,
        remaining_before=_remaining_before_value(before, after),
      )
    )
    return
  notes.append(
    _note(
      kind=full_kind,
      direction=full_direction,
      remaining_after=abs(after),
      remaining_before=_remaining_before_value(before, after),
    )
  )


def _notes_for_event(event: DailyReportEvent) -> list[ActivityNote]:
  """Generates activity notes for various event types."""
  notes: list[ActivityNote] = []

  if event.event_type == "collection_money":
    amount = event.money.amount if event.money is not None else 0
    if amount > 0:
      notes.append(_note(kind="money", direction="customer_pays_you", remaining_after=amount))
    return notes

  if event.event_type == "collection_payout":
    amount = event.money.amount if event.money is not None else 0
    if amount > 0:
      notes.append(_note(kind="money", direction="you_pay_customer", remaining_after=amount))
    return notes

  if event.event_type in {"order", "collection_empty", "customer_adjust"}:
    _append_money_note(
      notes,
      before=event.customer_money_before,
      after=event.customer_money_after,
      positive_direction="customer_pays_you",
      negative_direction="you_pay_customer",
    )
    _append_cylinder_note(
      notes,
      before=event.customer_12kg_before,
      after=event.customer_12kg_after,
      empty_kind="cyl_12",
      full_kind="cyl_full_12",
      empty_direction="customer_returns_you",
      full_direction="you_deliver_customer",
    )
    _append_cylinder_note(
      notes,
      before=event.customer_48kg_before,
      after=event.customer_48kg_after,
      empty_kind="cyl_48",
      full_kind="cyl_full_48",
      empty_direction="customer_returns_you",
      full_direction="you_deliver_customer",
    )
    return notes

  if event.event_type in {"refill", "company_buy_iron", "company_payment"}:
    _append_money_note(
      notes,
      before=event.company_before,
      after=event.company_after,
      positive_direction="you_pay_company",
      negative_direction="company_pays_you",
    )
    _append_cylinder_note(
      notes,
      before=event.company_12kg_before,
      after=event.company_12kg_after,
      empty_kind="cyl_12",
      full_kind="cyl_full_12",
      empty_direction="you_return_company",
      full_direction="company_delivers_you",
    )
    _append_cylinder_note(
      notes,
      before=event.company_48kg_before,
      after=event.company_48kg_after,
      empty_kind="cyl_48",
      full_kind="cyl_full_48",
      empty_direction="you_return_company",
      full_direction="company_delivers_you",
    )
    return notes

  return notes


def _apply_status_fields(event: DailyReportEvent) -> None:
  event.status_mode = _status_mode(event)
  event.action_pills = _atomic_action_pills(event)
  event.is_ok = len(event.action_pills) == 0 and event.is_balanced
  event.is_atomic_ok = event.is_ok and event.status_mode == "atomic"
