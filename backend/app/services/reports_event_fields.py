"""Reports event field enrichment and UI decoration.

Handles all event enrichment, UI field application, pill factories, note builders,
and Level3 schema construction for the daily reporting system.
"""

from typing import Literal, Optional

from app.schemas import ActivityNote, DailyReportEvent, Level3Counterparty, Level3Money, Level3System
from app.utils.time import business_local_datetime_from_utc

from .reports_aggregates import CustomerLedgerState


# Display labels for event types
_EVENT_LABELS: dict[str, str] = {
  "refill": "Refill",
  "company_buy_full": "Bought full cylinders",
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



def _company_payment_label(event: DailyReportEvent) -> str:
  paid = _safe_int(event.paid_amount or event.total_cost)
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
    paid = _safe_int(event.paid_amount or event.total_cost)
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


def _format_signed_money_major(value_minor: int, money_decimals: int, currency_symbol: str) -> str:
  sign = "+" if value_minor >= 0 else "-"
  amount_text = _format_money_major(abs(value_minor), money_decimals, currency_symbol)
  return f"{sign}{amount_text}"


def _inventory_adjustment_summary_lines(event: DailyReportEvent) -> list[str]:
  before = event.inventory_before
  after = event.inventory_after
  if before is None or after is None:
    return []

  lines: list[str] = []
  for gas_label, full_key, empty_key in (
    ("12kg", "full12", "empty12"),
    ("48kg", "full48", "empty48"),
  ):
    full_before = getattr(before, full_key, None)
    full_after = getattr(after, full_key, None)
    empty_before = getattr(before, empty_key, None)
    empty_after = getattr(after, empty_key, None)

    parts: list[str] = []
    if full_before is not None and full_after is not None and full_before != full_after:
      full_delta = int(full_after - full_before)
      parts.append(f"full {full_delta:+d}")
    if empty_before is not None and empty_after is not None and empty_before != empty_after:
      empty_delta = int(empty_after - empty_before)
      parts.append(f"empty {empty_delta:+d}")
    if parts:
      lines.append(f"{gas_label}: {' | '.join(parts)}")
  return lines


def _is_company_return_only_refill(event: DailyReportEvent) -> bool:
  if event.event_type != "refill":
    return False
  buy12 = _safe_int(event.buy12)
  buy48 = _safe_int(event.buy48)
  return12 = _safe_int(event.return12)
  return48 = _safe_int(event.return48)
  total_cost = _safe_int(event.total_cost)
  paid_amount = _safe_int(event.paid_amount)
  has_returns = return12 > 0 or return48 > 0
  no_buys = buy12 == 0 and buy48 == 0
  no_money = total_cost == 0 and paid_amount == 0
  return has_returns and no_buys and no_money


def _is_company_receive_only_refill(event: DailyReportEvent) -> bool:
  if event.event_type != "refill":
    return False
  buy12 = _safe_int(event.buy12)
  buy48 = _safe_int(event.buy48)
  return12 = _safe_int(event.return12)
  return48 = _safe_int(event.return48)
  total_cost = _safe_int(event.total_cost)
  paid_amount = _safe_int(event.paid_amount)
  has_buys = buy12 > 0 or buy48 > 0
  no_returns = return12 == 0 and return48 == 0
  no_money = total_cost == 0 and paid_amount == 0
  return has_buys and no_returns and no_money


def _is_company_settle_only_refill(event: DailyReportEvent) -> bool:
  return _is_company_return_only_refill(event) or _is_company_receive_only_refill(event)




def _apply_ticket_fields(event: DailyReportEvent) -> None:
  if not event.id:
    event.id = event.source_id or f"{event.event_type}:{event.effective_at.isoformat()}"
  event.label = _event_label(event)


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
  if event.event_type in {"refill", "company_payment", "company_buy_full", "company_adjustment"}:
    return Level3Counterparty(type="company", display_name="Company", description=None, display="Company")
  return Level3Counterparty(type="none", display_name=None, description=None, display=None)


def _level3_system(event: DailyReportEvent) -> Optional[Level3System]:
  if event.event_type == "order" and event.order_mode == "replacement":
    if event.system_name:
      return Level3System(display_name=event.system_name)
  return None




def _cash_delta(event: DailyReportEvent) -> int:
  if event.wallet_before is None or event.wallet_after is None:
    return 0
  return int(event.wallet_after - event.wallet_before)


def _level3_money(event: DailyReportEvent) -> Level3Money:
  verb: Literal["received", "paid", "none"] = "none"
  amount = 0

  if event.event_type == "order":
    paid = _safe_int(event.order_paid)
    if paid:
      verb = "paid" if event.order_mode == "buy_iron" else "received"
      amount = abs(paid)
  elif event.event_type == "refill":
    paid = _safe_int(event.paid_amount)
    if paid:
      verb = "paid"
      amount = abs(paid)
  elif event.event_type == "company_buy_full":
    paid = _safe_int(event.paid_amount or event.total_cost)
    if paid:
      verb = "paid"
      amount = abs(paid)
  elif event.event_type == "company_payment":
    paid = _safe_int(event.paid_amount or event.total_cost)
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






def _time_display(value) -> str:
  return business_local_datetime_from_utc(value).strftime("%H:%M:%S")


def _hero_text_for_event(event: DailyReportEvent, money_decimals: int, currency_symbol: str) -> str:
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
  if event.event_type == "company_buy_full":
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
      return f"Payment from customer {_format_money_major(amount, money_decimals, currency_symbol)}"
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
      return f"{label} {_format_money_major(amount, money_decimals, currency_symbol)}"
    return label
  if event.event_type == "collection_payout":
    amount = event.money_amount if isinstance(event.money_amount, int) else 0
    if amount:
      return f"Payment to customer {_format_money_major(amount, money_decimals, currency_symbol)}"
    return "Payment to customer"
  if event.event_type == "customer_adjust":
    return "Adjusted customer balance"
  if event.event_type == "expense":
    return event.expense_type or "Expense"
  if event.event_type == "bank_deposit":
    amount = _safe_int(event.total_cost)
    if event.transfer_direction == "bank_to_wallet":
      if amount:
        return f"Transferred {_format_money_major(amount, money_decimals, currency_symbol)} to wallet"
      return "Transferred to wallet"
    if amount:
      return f"Transferred {_format_money_major(amount, money_decimals, currency_symbol)} to bank"
    return "Transferred to bank"
  if event.event_type == "cash_adjust":
    amount = _safe_int(event.total_cost)
    if amount:
      return f"Wallet change: {_format_signed_money_major(amount, money_decimals, currency_symbol)}"
    return "Wallet adjustment"
  if event.event_type == "adjust":
    lines = _inventory_adjustment_summary_lines(event)
    if lines:
      return "\n".join(lines)
    return "Inventory adjustment"
  return event.label or "Activity"




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
  currency_symbol: str,
  notes: list[ActivityNote],
) -> None:
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

  if event.event_type == "bank_deposit":
    amount_minor = abs(_safe_int(event.total_cost))
    event.money_amount = amount_minor
    event.money_direction = "none"
    event.money_delta = 0

  if event.event_type == "cash_adjust":
    amount_minor = _safe_int(event.total_cost)
    event.money_amount = abs(amount_minor)
    event.money_direction = "in" if amount_minor >= 0 else "out"
    event.money_delta = _money_major(abs(amount_minor), money_decimals)

  event.hero_text = _hero_text_for_event(event, money_decimals, currency_symbol)
  event.hero_primary = event.hero_text
  event.context_line = _context_line(event)

  event.notes = notes




def _apply_level3_fields(
  event: DailyReportEvent,
  *,
  customer_after: Optional[CustomerLedgerState] = None,
) -> None:
  event.counterparty = _level3_counterparty(event)
  event.system = _level3_system(event)
  event.money = _level3_money(event)
  if event.money and event.money.verb == "received":
    event.money_received = event.money.amount
  else:
    event.money_received = None




_CURRENCY_SYMBOLS: dict[str, str] = {
  "USD": "$",
  "ILS": "₪",
  "EUR": "€",
  "GBP": "£",
  "JOD": "JD",
  "EGP": "E£",
  "SAR": "﷼",
  "AED": "د.إ",
}


def currency_symbol_for_code(code: str) -> str:
  return _CURRENCY_SYMBOLS.get(code, code)


def _money_major(amount: int, decimals: int) -> int:
  if decimals <= 0:
    return int(amount)
  scale = 10 ** decimals
  return int(round(amount / scale))


def _format_money_major(amount: int, decimals: int, symbol: str) -> str:
  return f"{symbol}{_money_major(amount, decimals)}"




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

  if event.event_type in {"refill", "company_buy_full", "company_payment"}:
    _append_money_note(
      notes,
      before=event.company_before,
      after=event.company_after,
      positive_direction="you_pay_company",
      negative_direction="company_pays_you",
    )
    cyl12 = next((t for t in event.balance_transitions if t.scope == "company" and t.component == "cyl_12"), None)
    if cyl12 is not None:
      _append_cylinder_note(
        notes,
        before=cyl12.before,
        after=cyl12.after,
        empty_kind="cyl_12",
        full_kind="cyl_full_12",
        empty_direction="you_return_company",
        full_direction="company_delivers_you",
      )
    cyl48 = next((t for t in event.balance_transitions if t.scope == "company" and t.component == "cyl_48"), None)
    if cyl48 is not None:
      _append_cylinder_note(
        notes,
        before=cyl48.before,
        after=cyl48.after,
        empty_kind="cyl_48",
        full_kind="cyl_full_48",
        empty_direction="you_return_company",
        full_direction="company_delivers_you",
      )
    return notes

  return notes


