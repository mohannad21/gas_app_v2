from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from app.db import get_session
from app.models import (
  CashDailySummary,
  CashDelta,
  CompanyDailySummary,
  CompanyDelta,
  Customer,
  Expense,
  InventoryDailySummary,
  InventoryDelta,
  Order,
  RefillEvent,
  System,
)
from app.schemas import (
  DailyReportOrder,
  DailyReportRow,
  DailyReportV2Card,
  DailyReportV2Day,
  DailyReportV2Event,
  InventorySnapshot,
  ReportInventoryState,
  ReportInventoryTotals,
)
from app.utils.time import business_date_end_utc, business_date_from_utc, business_date_start_utc

router = APIRouter(prefix="/reports", tags=["reports"])


def _as_utc(dt: datetime) -> datetime:
  return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


@router.get("/daily", response_model=List[DailyReportRow])
def list_daily_reports(session: Session = Depends(get_session)) -> List[DailyReportRow]:
  """
  Aggregate orders by delivery date and return daily rollups.
  """
  customer_alias = aliased(Customer)
  system_alias = aliased(System)

  stmt = (
    select(Order, customer_alias.name, customer_alias.notes, system_alias.name)
    .join(customer_alias, customer_alias.id == Order.customer_id)
    .join(system_alias, system_alias.id == Order.system_id)
    .where(Order.is_deleted == False)  # noqa: E712
  )
  rows = session.exec(stmt).all()

  grouped: Dict[datetime.date, List[Tuple[Order, str, Optional[str], str]]] = defaultdict(list)
  for order, customer_name, customer_notes, system_name in rows:
    grouped[business_date_from_utc(order.delivered_at)].append((order, customer_name, customer_notes, system_name))

  summaries: List[InventoryDailySummary] = session.exec(
    select(InventoryDailySummary).order_by(InventoryDailySummary.business_date)
  ).all()
  summary_by_date: Dict[datetime.date, Dict[str, InventoryDailySummary]] = defaultdict(dict)
  for summary in summaries:
    summary_by_date[summary.business_date][summary.gas_type] = summary

  summary_dates = set(summary_by_date.keys())
  all_dates = summary_dates | set(grouped.keys())

  def snapshot_from_summary(date_key: datetime.date, use_end: bool) -> Optional[InventorySnapshot]:
    day = summary_by_date.get(date_key, {})
    summary_12 = day.get("12kg")
    summary_48 = day.get("48kg")
    if not summary_12 and not summary_48:
      return None
    if use_end:
      full12 = summary_12.day_end_full if summary_12 else 0
      empty12 = summary_12.day_end_empty if summary_12 else 0
      full48 = summary_48.day_end_full if summary_48 else 0
      empty48 = summary_48.day_end_empty if summary_48 else 0
      as_of = business_date_end_utc(date_key)
    else:
      full12 = summary_12.day_start_full if summary_12 else 0
      empty12 = summary_12.day_start_empty if summary_12 else 0
      full48 = summary_48.day_start_full if summary_48 else 0
      empty48 = summary_48.day_start_empty if summary_48 else 0
      as_of = business_date_start_utc(date_key)
    return InventorySnapshot(
      as_of=as_of,
      full12=full12,
      empty12=empty12,
      total12=full12 + empty12,
      full48=full48,
      empty48=empty48,
      total48=full48 + empty48,
      reason=None,
    )

  response: List[DailyReportRow] = []
  for date_key in sorted(all_dates, reverse=True):
    items = grouped.get(date_key, [])
    installed12 = received12 = installed48 = received48 = 0
    expected = received = 0.0
    orders: List[DailyReportOrder] = []

    for order, customer_name, customer_notes, system_name in items:
      if order.gas_type == "12kg":
        installed12 += order.cylinders_installed
        received12 += order.cylinders_received
      elif order.gas_type == "48kg":
        installed48 += order.cylinders_installed
        received48 += order.cylinders_received

      expected += order.price_total
      received += order.paid_amount
      orders.append(
        DailyReportOrder(
          id=order.id,
          customer=customer_name,
          system=system_name,
          gas=order.gas_type,  # type: ignore[arg-type]
          total=order.price_total,
          paid=order.paid_amount,
          installed=order.cylinders_installed,
          receivedCyl=order.cylinders_received,
          note=customer_notes or order.note,
        )
      )

    display = date_key.strftime("%Y-%m-%d")
    response.append(
      DailyReportRow(
        date=date_key.isoformat(),
        display=display,
        installed12=installed12,
        received12=received12,
        installed48=installed48,
        received48=received48,
        expected=expected,
        received=received,
        orders=orders,
        inventory_start=snapshot_from_summary(date_key, use_end=False),
        inventory_end=snapshot_from_summary(date_key, use_end=True),
      )
    )

  return response


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
    min_inv = session.exec(select(func.min(InventoryDailySummary.business_date))).first()
    min_cash = session.exec(select(func.min(CashDailySummary.business_date))).first()
    candidates = [d for d in [min_inv, min_cash] if d]
    start_date = min(candidates) if candidates else end_date

  if end_date < start_date:
    return []

  inv_rows = session.exec(
    select(InventoryDailySummary)
    .where(InventoryDailySummary.business_date >= start_date)
    .where(InventoryDailySummary.business_date <= end_date)
  ).all()
  inv_by_date: dict[date, dict[str, InventoryDailySummary]] = defaultdict(dict)
  for row in inv_rows:
    inv_by_date[row.business_date][row.gas_type] = row

  cash_rows = session.exec(
    select(CashDailySummary)
    .where(CashDailySummary.business_date >= start_date)
    .where(CashDailySummary.business_date <= end_date)
  ).all()
  cash_by_date: dict[date, CashDailySummary] = {row.business_date: row for row in cash_rows}

  company_rows = session.exec(
    select(CompanyDailySummary)
    .where(CompanyDailySummary.business_date >= start_date)
    .where(CompanyDailySummary.business_date <= end_date)
  ).all()
  company_by_date: dict[date, CompanyDailySummary] = {row.business_date: row for row in company_rows}

  response: list[DailyReportV2Card] = []
  for current_date in sorted(inv_by_date.keys() | cash_by_date.keys() | company_by_date.keys(), reverse=True):
    if current_date < start_date or current_date > end_date:
      continue
    inv_day = inv_by_date.get(current_date, {})
    summary_12 = inv_day.get("12kg")
    summary_48 = inv_day.get("48kg")
    inventory_start = ReportInventoryTotals(
      full12=summary_12.day_start_full if summary_12 else 0,
      empty12=summary_12.day_start_empty if summary_12 else 0,
      full48=summary_48.day_start_full if summary_48 else 0,
      empty48=summary_48.day_start_empty if summary_48 else 0,
    )
    inventory_end = ReportInventoryTotals(
      full12=summary_12.day_end_full if summary_12 else 0,
      empty12=summary_12.day_end_empty if summary_12 else 0,
      full48=summary_48.day_end_full if summary_48 else 0,
      empty48=summary_48.day_end_empty if summary_48 else 0,
    )
    cash_summary = cash_by_date.get(current_date)
    cash_start = cash_summary.cash_start if cash_summary else 0.0
    cash_end = cash_summary.cash_end if cash_summary else cash_start
    company_summary = company_by_date.get(current_date)
    company_start = company_summary.payable_start if company_summary else 0.0
    company_end = company_summary.payable_end if company_summary else company_start
    last_computed = max(
      [s.computed_at for s in [summary_12, summary_48, cash_summary, company_summary] if s],
      default=None,
    )
    recalculated = False
    if last_computed:
      recalculated = last_computed > business_date_end_utc(current_date)

    response.append(
      DailyReportV2Card(
        date=current_date.isoformat(),
        cash_start=cash_start,
        cash_end=cash_end,
        company_start=company_start,
        company_end=company_end,
        inventory_start=inventory_start,
        inventory_end=inventory_end,
        problems=None,
        recalculated=recalculated,
      )
    )
  return response


@router.get("/day_v2", response_model=DailyReportV2Day)
def get_daily_report_v2(date: str, session: Session = Depends(get_session)) -> DailyReportV2Day:
  try:
    business_date = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc

  start = business_date_start_utc(business_date)
  end = business_date_start_utc(business_date + timedelta(days=1))

  inv_rows = session.exec(
    select(InventoryDelta)
    .where(InventoryDelta.effective_at >= start)
    .where(InventoryDelta.effective_at < end)
    .where(InventoryDelta.source_type.in_(["order", "refill", "adjust", "init"]))
    .order_by(InventoryDelta.effective_at, InventoryDelta.created_at, InventoryDelta.id)
  ).all()
  order_ids = {row.source_id for row in inv_rows if row.source_type == "order" and row.source_id}
  order_map: dict[str, tuple[Order, str, str]] = {}
  if order_ids:
    customer_alias = aliased(Customer)
    system_alias = aliased(System)
    rows = session.exec(
      select(Order, customer_alias.name, system_alias.name)
      .join(customer_alias, customer_alias.id == Order.customer_id)
      .join(system_alias, system_alias.id == Order.system_id)
      .where(Order.id.in_(list(order_ids)))
    ).all()
    order_map = {row[0].id: (row[0], row[1], row[2]) for row in rows if not row[0].is_deleted}

  filtered_inv_rows: list[InventoryDelta] = []
  for row in inv_rows:
    if row.source_type == "order":
      if row.source_id and row.source_id in order_map:
        filtered_inv_rows.append(row)
    else:
      filtered_inv_rows.append(row)

  cash_rows = session.exec(
    select(CashDelta)
    .where(CashDelta.effective_at >= start)
    .where(CashDelta.effective_at < end)
    .where(
      CashDelta.source_type.in_(
        ["order", "expense", "cash_adjust", "cash_init", "refill_payment", "company_payment", "bank_deposit"]
      )
    )
    .order_by(CashDelta.effective_at, CashDelta.created_at, CashDelta.id)
  ).all()
  if order_map:
    cash_rows = [
      row
      for row in cash_rows
      if row.source_type != "order" or (row.source_id and row.source_id in order_map)
    ]
  else:
    cash_rows = [row for row in cash_rows if row.source_type != "order"]
  expense_ids = {row.source_id for row in cash_rows if row.source_type == "expense" and row.source_id}
  expense_map = {
    expense.id: expense
    for expense in session.exec(select(Expense).where(Expense.id.in_(list(expense_ids)))).all()
  } if expense_ids else {}

  company_rows = session.exec(
    select(CompanyDelta)
    .where(CompanyDelta.effective_at >= start)
    .where(CompanyDelta.effective_at < end)
    .where(CompanyDelta.source_type.in_(["refill", "company_payment"]))
    .order_by(CompanyDelta.effective_at, CompanyDelta.created_at, CompanyDelta.id)
  ).all()

  event_map: dict[str, dict[str, object]] = {}

  def _event_key(event_type: str, source_id: Optional[str], fallback_id: str) -> str:
    if source_id:
      return f"{event_type}:{source_id}"
    return f"{event_type}:{fallback_id}"

  for row in filtered_inv_rows:
    event_type = row.source_type
    key = _event_key(event_type, row.source_id, row.id)
    entry = event_map.get(key)
    if not entry:
      entry = {
        "event_type": event_type,
        "source_id": row.source_id,
        "effective_at": row.effective_at,
        "created_at": row.created_at,
        "inventory_deltas": [],
        "cash_deltas": [],
        "company_deltas": [],
        "label": None,
        "gas_type": None,
        "customer_id": None,
        "customer_name": None,
        "system_name": None,
        "expense_type": None,
        "reason": None,
      }
      if event_type == "refill":
        entry["label"] = "Refill"
      elif event_type == "adjust":
        entry["label"] = "Adjustment"
        entry["gas_type"] = row.gas_type
      elif event_type == "init":
        entry["label"] = "Inventory Init"
        entry["gas_type"] = row.gas_type
      elif event_type == "order" and row.source_id and row.source_id in order_map:
        order, customer_name, system_name = order_map[row.source_id]
        entry["label"] = f"Order - {customer_name}"
        entry["gas_type"] = order.gas_type
        entry["customer_id"] = order.customer_id
        entry["customer_name"] = customer_name
        entry["system_name"] = system_name
      entry["reason"] = row.reason
      event_map[key] = entry
    else:
      if row.created_at < entry["created_at"]:
        entry["created_at"] = row.created_at
    entry["inventory_deltas"].append(row)

  for row in cash_rows:
    if row.source_type == "refill_payment":
      event_type = "refill"
    elif row.source_type == "company_payment":
      event_type = "company_payment"
    else:
      event_type = row.source_type
    key = _event_key(event_type, row.source_id, row.id)
    entry = event_map.get(key)
    if not entry:
      entry = {
        "event_type": event_type,
        "source_id": row.source_id,
        "effective_at": row.effective_at,
        "created_at": row.created_at,
        "inventory_deltas": [],
        "cash_deltas": [],
        "company_deltas": [],
        "label": None,
        "gas_type": None,
        "customer_id": None,
        "customer_name": None,
        "system_name": None,
        "expense_type": None,
        "reason": None,
      }
      if event_type == "expense":
        expense = expense_map.get(row.source_id) if row.source_id else None
        entry["label"] = f"Expense - {expense.expense_type}" if expense else "Expense"
        entry["expense_type"] = expense.expense_type if expense else None
        entry["reason"] = expense.note if expense and expense.note else None
      elif event_type == "refill":
        entry["label"] = "Refill"
      elif event_type == "company_payment":
        entry["label"] = "Company Payment"
        entry["reason"] = row.reason
      elif event_type == "bank_deposit":
        entry["label"] = "Bank Deposit"
        entry["reason"] = row.reason
      elif event_type == "cash_adjust":
        entry["label"] = "Cash Adjustment"
        entry["reason"] = row.reason
      elif event_type == "cash_init":
        entry["label"] = "Cash Init"
        entry["reason"] = row.reason
      elif event_type == "order" and row.source_id and row.source_id in order_map:
        order, customer_name, system_name = order_map[row.source_id]
        entry["label"] = f"Order - {customer_name}"
        entry["gas_type"] = order.gas_type
        entry["customer_id"] = order.customer_id
        entry["customer_name"] = customer_name
        entry["system_name"] = system_name
      event_map[key] = entry
    else:
      if row.created_at < entry["created_at"]:
        entry["created_at"] = row.created_at
    entry["cash_deltas"].append(row)

  for row in company_rows:
    event_type = "refill" if row.source_type == "refill" else "company_payment"
    key = _event_key(event_type, row.source_id, row.id)
    entry = event_map.get(key)
    if not entry:
      entry = {
        "event_type": event_type,
        "source_id": row.source_id,
        "effective_at": row.effective_at,
        "created_at": row.created_at,
        "inventory_deltas": [],
        "cash_deltas": [],
        "company_deltas": [],
        "label": None,
        "gas_type": None,
        "customer_id": None,
        "customer_name": None,
        "system_name": None,
        "expense_type": None,
        "reason": None,
      }
      if event_type == "refill":
        entry["label"] = "Refill"
      elif event_type == "company_payment":
        entry["label"] = "Company Payment"
        entry["reason"] = row.reason
      event_map[key] = entry
    else:
      if row.created_at < entry["created_at"]:
        entry["created_at"] = row.created_at
    entry["company_deltas"].append(row)
  events = sorted(
    event_map.values(),
    key=lambda item: (item["effective_at"], item["created_at"], item["source_id"] or ""),
  )
  refill_ids = {entry["source_id"] for entry in events if entry["event_type"] == "refill" and entry["source_id"]}
  refill_map: dict[str, RefillEvent] = {}
  if refill_ids:
    refill_rows = session.exec(select(RefillEvent).where(RefillEvent.id.in_(list(refill_ids)))).all()
    refill_map = {row.id: row for row in refill_rows}

  summary_rows = session.exec(
    select(InventoryDailySummary).where(InventoryDailySummary.business_date == business_date)
  ).all()
  summary_by_gas = {row.gas_type: row for row in summary_rows}
  summary_12 = summary_by_gas.get("12kg")
  summary_48 = summary_by_gas.get("48kg")
  inventory_start = ReportInventoryTotals(
    full12=summary_12.day_start_full if summary_12 else 0,
    empty12=summary_12.day_start_empty if summary_12 else 0,
    full48=summary_48.day_start_full if summary_48 else 0,
    empty48=summary_48.day_start_empty if summary_48 else 0,
  )
  inventory_end = ReportInventoryTotals(
    full12=summary_12.day_end_full if summary_12 else 0,
    empty12=summary_12.day_end_empty if summary_12 else 0,
    full48=summary_48.day_end_full if summary_48 else 0,
    empty48=summary_48.day_end_empty if summary_48 else 0,
  )
  cash_summary = session.exec(
    select(CashDailySummary).where(CashDailySummary.business_date == business_date)
  ).first()
  cash_start = cash_summary.cash_start if cash_summary else 0.0
  cash_end = cash_summary.cash_end if cash_summary else cash_start
  company_summary = session.exec(
    select(CompanyDailySummary).where(CompanyDailySummary.business_date == business_date)
  ).first()
  company_start = company_summary.payable_start if company_summary else 0.0
  company_end = company_summary.payable_end if company_summary else company_start

  running_cash = cash_start
  running_company = company_start
  running_full = {"12kg": inventory_start.full12, "48kg": inventory_start.full48}
  running_empty = {"12kg": inventory_start.empty12, "48kg": inventory_start.empty48}

  event_rows: list[DailyReportV2Event] = []
  for entry in events:
    refill_event = refill_map.get(entry["source_id"]) if entry["event_type"] == "refill" and entry["source_id"] else None
    cash_before = running_cash
    cash_delta = sum(row.delta_cash for row in entry["cash_deltas"])
    if entry["event_type"] == "cash_init":
      cash_after = cash_before
    else:
      cash_after = cash_before + cash_delta
      running_cash = cash_after

    company_before: Optional[float] = None
    company_after: Optional[float] = None
    company_delta = sum(row.delta_payable for row in entry["company_deltas"])
    if company_delta or entry["company_deltas"]:
      company_before = running_company
      company_after = running_company + company_delta
      running_company = company_after

    inv_before: Optional[ReportInventoryState] = None
    inv_after: Optional[ReportInventoryState] = None
    buy12 = return12 = buy48 = return48 = None
    inv_deltas: list[InventoryDelta] = entry["inventory_deltas"]
    if inv_deltas:
      inv_deltas_sorted = sorted(inv_deltas, key=lambda row: (row.effective_at, row.created_at, row.id))
      if entry["event_type"] == "refill":
        total_buy12 = total_return12 = total_buy48 = total_return48 = 0
        inv_before = ReportInventoryState(
          full12=running_full["12kg"],
          empty12=running_empty["12kg"],
          full48=running_full["48kg"],
          empty48=running_empty["48kg"],
        )
        for row in inv_deltas_sorted:
          if row.gas_type == "12kg":
            total_buy12 += max(row.delta_full, 0)
            total_return12 += max(-row.delta_empty, 0)
          elif row.gas_type == "48kg":
            total_buy48 += max(row.delta_full, 0)
            total_return48 += max(-row.delta_empty, 0)
          running_full[row.gas_type] += row.delta_full
          running_empty[row.gas_type] += row.delta_empty
        inv_after = ReportInventoryState(
          full12=running_full["12kg"],
          empty12=running_empty["12kg"],
          full48=running_full["48kg"],
          empty48=running_empty["48kg"],
        )
        buy12 = total_buy12
        return12 = total_return12
        buy48 = total_buy48
        return48 = total_return48
      else:
        row = inv_deltas_sorted[-1]
        gas = row.gas_type
        before_full = running_full[gas]
        before_empty = running_empty[gas]
        for delta in inv_deltas_sorted:
          running_full[delta.gas_type] += delta.delta_full
          running_empty[delta.gas_type] += delta.delta_empty
        after_full = running_full[gas]
        after_empty = running_empty[gas]
        show_full = entry["event_type"] == "order" or row.delta_full != 0
        show_empty = entry["event_type"] == "order" or row.delta_empty != 0
        inv_before = ReportInventoryState(
          full12=before_full if gas == "12kg" and show_full else None,
          empty12=before_empty if gas == "12kg" and show_empty else None,
          full48=before_full if gas == "48kg" and show_full else None,
          empty48=before_empty if gas == "48kg" and show_empty else None,
        )
        inv_after = ReportInventoryState(
          full12=after_full if gas == "12kg" and show_full else None,
          empty12=after_empty if gas == "12kg" and show_empty else None,
          full48=after_full if gas == "48kg" and show_full else None,
          empty48=after_empty if gas == "48kg" and show_empty else None,
        )

    event_rows.append(
      DailyReportV2Event(
        event_type=entry["event_type"],
        effective_at=_as_utc(entry["effective_at"]),
        created_at=_as_utc(entry["created_at"]),
        source_id=entry["source_id"],
        label=entry["label"],
        gas_type=entry["gas_type"],
        customer_id=entry["customer_id"],
        customer_name=entry["customer_name"],
        system_name=entry["system_name"],
        expense_type=entry["expense_type"],
        reason=entry["reason"],
        buy12=buy12,
        return12=return12,
        buy48=buy48,
        return48=return48,
        total_cost=refill_event.total_cost if refill_event else None,
        paid_now=refill_event.paid_now if refill_event else None,
        unit_price_buy_12=refill_event.unit_price_buy_12 if refill_event else None,
        unit_price_buy_48=refill_event.unit_price_buy_48 if refill_event else None,
        cash_before=cash_before,
        cash_after=cash_after,
        company_before=company_before,
        company_after=company_after,
        inventory_before=inv_before,
        inventory_after=inv_after,
      )
    )

  return DailyReportV2Day(
    date=business_date.isoformat(),
    cash_start=cash_start,
    cash_end=cash_end,
    company_start=company_start,
    company_end=company_end,
    inventory_start=inventory_start,
    inventory_end=inventory_end,
    events=event_rows,
  )
