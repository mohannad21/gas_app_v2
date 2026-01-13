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
  CollectionEvent,
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
  DailyAuditSummary,
  InventorySnapshot,
  ReportInventoryState,
  ReportInventoryTotals,
)
from app.utils.time import business_date_end_utc, business_date_from_utc, business_date_start_utc

router = APIRouter(prefix="/reports", tags=["reports"])


def _as_utc(dt: datetime) -> datetime:
  return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _sum_customer_balances(session: Session) -> dict[str, float | int]:
  customers = session.exec(
    select(Customer).where(Customer.is_deleted == False)  # noqa: E712
  ).all()

  money_receivable = 0.0
  money_payable = 0.0
  cyl_receivable_12 = 0
  cyl_payable_12 = 0
  cyl_receivable_48 = 0
  cyl_payable_48 = 0

  for customer in customers:
    money_balance = float(customer.money_balance or 0)
    if money_balance > 0:
      money_receivable += money_balance
    elif money_balance < 0:
      money_payable += abs(money_balance)

    cyl_12 = int(customer.cylinder_balance_12kg or 0)
    if cyl_12 > 0:
      cyl_receivable_12 += cyl_12
    elif cyl_12 < 0:
      cyl_payable_12 += abs(cyl_12)

    cyl_48 = int(customer.cylinder_balance_48kg or 0)
    if cyl_48 > 0:
      cyl_receivable_48 += cyl_48
    elif cyl_48 < 0:
      cyl_payable_48 += abs(cyl_48)

  return {
    "money_receivable": money_receivable,
    "money_payable": money_payable,
    "cyl_receivable_12": cyl_receivable_12,
    "cyl_payable_12": cyl_payable_12,
    "cyl_receivable_48": cyl_receivable_48,
    "cyl_payable_48": cyl_payable_48,
  }


def get_daily_audit_summary(session: Session, business_date: date) -> DailyAuditSummary:
  start = business_date_start_utc(business_date)
  end = business_date_start_utc(business_date + timedelta(days=1))

  cash_in = session.exec(
    select(func.sum(CashDelta.delta_cash))
    .where(CashDelta.effective_at >= start)
    .where(CashDelta.effective_at < end)
    .where(CashDelta.delta_cash > 0)
    .where(CashDelta.source_type != "cash_init")
    .where(CashDelta.is_deleted == False)  # noqa: E712
  ).first() or 0.0

  order_rows = session.exec(
    select(Order)
    .where(Order.delivered_at >= start)
    .where(Order.delivered_at < end)
    .where(Order.is_deleted == False)  # noqa: E712
  ).all()
  new_debt = 0.0
  for order in order_rows:
    gross_paid = order.paid_amount
    if gross_paid is None:
      money_received = order.money_received or 0.0
      money_given = order.money_given or 0.0
      gross_paid = money_received - money_given
    applied_credit = order.applied_credit or 0.0
    new_debt += order.price_total - (gross_paid + applied_credit)

  inv_rows = session.exec(
    select(InventoryDelta)
    .where(InventoryDelta.effective_at >= start)
    .where(InventoryDelta.effective_at < end)
    .where(InventoryDelta.is_deleted == False)  # noqa: E712
    .where(
      InventoryDelta.source_type.in_(
        ["order", "refill", "adjust", "init", "init_credit", "init_return", "collection_empty"]
      )
    )
  ).all()
  inv_delta_12 = 0
  inv_delta_48 = 0
  for row in inv_rows:
    delta = row.delta_full + row.delta_empty
    if row.gas_type == "12kg":
      inv_delta_12 += delta
    elif row.gas_type == "48kg":
      inv_delta_48 += delta

  return DailyAuditSummary(
    cash_in=cash_in,
    new_debt=new_debt,
    inv_delta_12=inv_delta_12,
    inv_delta_48=inv_delta_48,
  )


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
  customer_totals = _sum_customer_balances(session)

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
    company_12kg_start = company_summary.payable_12kg_start if company_summary else 0
    company_12kg_end = company_summary.payable_12kg_end if company_summary else company_12kg_start
    company_48kg_start = company_summary.payable_48kg_start if company_summary else 0
    company_48kg_end = company_summary.payable_48kg_end if company_summary else company_48kg_start
    company_give_start = company_summary.payable_give_start if company_summary else 0.0
    company_give_end = company_summary.payable_give_end if company_summary else company_give_start
    company_receive_start = company_summary.payable_receive_start if company_summary else 0.0
    company_receive_end = company_summary.payable_receive_end if company_summary else company_receive_start
    company_12kg_give_start = company_summary.payable_12kg_give_start if company_summary else 0
    company_12kg_give_end = company_summary.payable_12kg_give_end if company_summary else company_12kg_give_start
    company_12kg_receive_start = company_summary.payable_12kg_receive_start if company_summary else 0
    company_12kg_receive_end = company_summary.payable_12kg_receive_end if company_summary else company_12kg_receive_start
    company_48kg_give_start = company_summary.payable_48kg_give_start if company_summary else 0
    company_48kg_give_end = company_summary.payable_48kg_give_end if company_summary else company_48kg_give_start
    company_48kg_receive_start = company_summary.payable_48kg_receive_start if company_summary else 0
    company_48kg_receive_end = company_summary.payable_48kg_receive_end if company_summary else company_48kg_receive_start
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
        customer_money_receivable=float(customer_totals["money_receivable"]),
        customer_money_payable=float(customer_totals["money_payable"]),
        customer_12kg_receivable=int(customer_totals["cyl_receivable_12"]),
        customer_12kg_payable=int(customer_totals["cyl_payable_12"]),
        customer_48kg_receivable=int(customer_totals["cyl_receivable_48"]),
        customer_48kg_payable=int(customer_totals["cyl_payable_48"]),
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
    .where(InventoryDelta.is_deleted == False)  # noqa: E712
    .where(
      InventoryDelta.source_type.in_(
        ["order", "refill", "adjust", "init", "init_credit", "init_return", "collection_empty"]
      )
    )
    .order_by(InventoryDelta.effective_at, InventoryDelta.created_at, InventoryDelta.id)
  ).all()
  order_ids = {row.source_id for row in inv_rows if row.source_type == "order" and row.source_id}
  order_map: dict[str, tuple[Order, str, Optional[str], str, Optional[str]]] = {}
  if order_ids:
    customer_alias = aliased(Customer)
    system_alias = aliased(System)
    rows = session.exec(
      select(Order, customer_alias.name, customer_alias.notes, system_alias.name, system_alias.system_type)
      .join(customer_alias, customer_alias.id == Order.customer_id)
      .join(system_alias, system_alias.id == Order.system_id)
      .where(Order.id.in_(list(order_ids)))
    ).all()
    order_map = {row[0].id: (row[0], row[1], row[2], row[3], row[4]) for row in rows if not row[0].is_deleted}

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
    .where(CashDelta.is_deleted == False)  # noqa: E712
    .where(
      CashDelta.source_type.in_(
        [
          "order",
          "expense",
          "cash_adjust",
          "cash_init",
          "refill_payment",
          "company_payment",
          "bank_deposit",
          "collection_money",
        ]
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

  collection_ids = {
    row.source_id for row in inv_rows if row.source_type == "collection_empty" and row.source_id
  }
  collection_ids.update(
    {
      row.source_id for row in cash_rows if row.source_type == "collection_money" and row.source_id
    }
  )
  collection_map: dict[str, tuple[CollectionEvent, str, Optional[str], Optional[str], Optional[str]]] = {}
  if collection_ids:
    rows = session.exec(
      select(
        CollectionEvent,
        Customer.name,
        Customer.notes,
        System.name,
        System.system_type,
      )
      .join(Customer, Customer.id == CollectionEvent.customer_id)
      .outerjoin(System, System.id == CollectionEvent.system_id)
      .where(CollectionEvent.id.in_(list(collection_ids)))
    ).all()
    collection_map = {
      row[0].id: (row[0], row[1], row[2], row[3], row[4])
      for row in rows
      if not row[0].is_deleted
    }

  company_rows = session.exec(
    select(CompanyDelta)
    .where(CompanyDelta.effective_at >= start)
    .where(CompanyDelta.effective_at < end)
    .where(
      CompanyDelta.source_type.in_(
        ["refill", "company_payment", "init_balance", "init_credit", "init_return"]
      )
    )
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
        "customer_description": None,
        "system_name": None,
        "system_type": None,
        "expense_type": None,
        "reason": None,
        "order_total": None,
        "order_paid": None,
        "order_installed": None,
        "order_received": None,
        "collection_action": None,
        "collection_amount": None,
        "collection_qty_12kg": None,
        "collection_qty_48kg": None,
      }
      if event_type == "refill":
        entry["label"] = "Refill"
      elif event_type == "adjust":
        entry["label"] = "Adjustment"
        entry["gas_type"] = row.gas_type
      elif event_type == "init":
        entry["label"] = "Inventory Init"
        entry["gas_type"] = row.gas_type
      elif event_type == "init_credit":
        entry["label"] = "Init Credit"
        entry["gas_type"] = row.gas_type
      elif event_type == "init_return":
        entry["label"] = "Init Return"
        entry["gas_type"] = row.gas_type
      elif event_type == "order" and row.source_id and row.source_id in order_map:
        order, customer_name, customer_description, system_name, system_type = order_map[row.source_id]
        entry["label"] = f"Order - {customer_name}"
        entry["gas_type"] = order.gas_type
        entry["customer_id"] = order.customer_id
        entry["customer_name"] = customer_name
        entry["customer_description"] = customer_description
        entry["system_name"] = system_name
        entry["system_type"] = system_type
        entry["order_total"] = order.price_total
        entry["order_paid"] = order.paid_amount
        entry["order_installed"] = order.cylinders_installed
        entry["order_received"] = order.cylinders_received
      elif event_type == "collection_empty" and row.source_id and row.source_id in collection_map:
        collection, customer_name, customer_description, system_name, system_type = collection_map[row.source_id]
        entry["label"] = "Collection - Empties"
        entry["customer_id"] = collection.customer_id
        entry["customer_name"] = customer_name
        entry["customer_description"] = customer_description
        entry["system_name"] = system_name
        entry["system_type"] = system_type
        entry["collection_action"] = collection.action_type
        entry["collection_amount"] = collection.amount_money
        entry["collection_qty_12kg"] = collection.qty_12kg
        entry["collection_qty_48kg"] = collection.qty_48kg
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
        "customer_description": None,
        "system_name": None,
        "system_type": None,
        "expense_type": None,
        "reason": None,
        "order_total": None,
        "order_paid": None,
        "order_installed": None,
        "order_received": None,
        "collection_action": None,
        "collection_amount": None,
        "collection_qty_12kg": None,
        "collection_qty_48kg": None,
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
        order, customer_name, customer_description, system_name, system_type = order_map[row.source_id]
        entry["label"] = f"Order - {customer_name}"
        entry["gas_type"] = order.gas_type
        entry["customer_id"] = order.customer_id
        entry["customer_name"] = customer_name
        entry["customer_description"] = customer_description
        entry["system_name"] = system_name
        entry["system_type"] = system_type
        entry["order_total"] = order.price_total
        entry["order_paid"] = order.paid_amount
        entry["order_installed"] = order.cylinders_installed
        entry["order_received"] = order.cylinders_received
      elif event_type == "collection_money" and row.source_id and row.source_id in collection_map:
        collection, customer_name, customer_description, system_name, system_type = collection_map[row.source_id]
        entry["label"] = "Collection - Money"
        entry["customer_id"] = collection.customer_id
        entry["customer_name"] = customer_name
        entry["customer_description"] = customer_description
        entry["system_name"] = system_name
        entry["system_type"] = system_type
        entry["collection_action"] = collection.action_type
        entry["collection_amount"] = collection.amount_money
        entry["collection_qty_12kg"] = collection.qty_12kg
        entry["collection_qty_48kg"] = collection.qty_48kg
      event_map[key] = entry
    else:
      if row.created_at < entry["created_at"]:
        entry["created_at"] = row.created_at
    entry["cash_deltas"].append(row)

  for row in company_rows:
    if row.source_type == "refill":
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
        "customer_description": None,
        "system_name": None,
        "system_type": None,
        "expense_type": None,
        "reason": None,
        "order_total": None,
        "order_paid": None,
        "order_installed": None,
        "order_received": None,
        "collection_action": None,
        "collection_amount": None,
        "collection_qty_12kg": None,
        "collection_qty_48kg": None,
      }
      if event_type == "refill":
        entry["label"] = "Refill"
      elif event_type == "company_payment":
        entry["label"] = "Company Payment"
        entry["reason"] = row.reason
      elif event_type == "init_balance":
        entry["label"] = "Company Init"
        entry["reason"] = row.reason
      elif event_type == "init_credit":
        entry["label"] = "Company Init Credit"
        entry["reason"] = row.reason
      elif event_type == "init_return":
        entry["label"] = "Company Init Return"
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
  company_12kg_start = company_summary.payable_12kg_start if company_summary else 0
  company_12kg_end = company_summary.payable_12kg_end if company_summary else company_12kg_start
  company_48kg_start = company_summary.payable_48kg_start if company_summary else 0
  company_48kg_end = company_summary.payable_48kg_end if company_summary else company_48kg_start
  company_give_start = company_summary.payable_give_start if company_summary else 0.0
  company_give_end = company_summary.payable_give_end if company_summary else company_give_start
  company_receive_start = company_summary.payable_receive_start if company_summary else 0.0
  company_receive_end = company_summary.payable_receive_end if company_summary else company_receive_start
  company_12kg_give_start = company_summary.payable_12kg_give_start if company_summary else 0
  company_12kg_give_end = company_summary.payable_12kg_give_end if company_summary else company_12kg_give_start
  company_12kg_receive_start = company_summary.payable_12kg_receive_start if company_summary else 0
  company_12kg_receive_end = company_summary.payable_12kg_receive_end if company_summary else company_12kg_receive_start
  company_48kg_give_start = company_summary.payable_48kg_give_start if company_summary else 0
  company_48kg_give_end = company_summary.payable_48kg_give_end if company_summary else company_48kg_give_start
  company_48kg_receive_start = company_summary.payable_48kg_receive_start if company_summary else 0
  company_48kg_receive_end = company_summary.payable_48kg_receive_end if company_summary else company_48kg_receive_start
  customer_totals = _sum_customer_balances(session)

  running_cash = cash_start
  running_company = company_start
  running_company_12 = company_12kg_start
  running_company_48 = company_48kg_start
  running_full = {"12kg": inventory_start.full12, "48kg": inventory_start.full48}
  running_empty = {"12kg": inventory_start.empty12, "48kg": inventory_start.empty48}

  event_rows: list[DailyReportV2Event] = []
  for entry in events:
    refill_event = refill_map.get(entry["source_id"]) if entry["event_type"] == "refill" and entry["source_id"] else None
    cash_before = running_cash
    cash_delta = sum(row.delta_cash for row in entry["cash_deltas"])
    if entry["event_type"] == "cash_init":
      cash_before = 0
      cash_after = cash_start
      running_cash = cash_after
    else:
      cash_after = cash_before + cash_delta
      running_cash = cash_after

    company_before: Optional[float] = None
    company_after: Optional[float] = None
    company_12kg_before: Optional[int] = None
    company_12kg_after: Optional[int] = None
    company_48kg_before: Optional[int] = None
    company_48kg_after: Optional[int] = None
    company_delta = sum(row.delta_payable for row in entry["company_deltas"])
    company_delta_12 = sum(row.delta_12kg for row in entry["company_deltas"])
    company_delta_48 = sum(row.delta_48kg for row in entry["company_deltas"])
    if company_delta or entry["company_deltas"]:
      company_before = running_company
      company_after = running_company + company_delta
      running_company = company_after
    if company_delta_12 or entry["company_deltas"]:
      company_12kg_before = running_company_12
      company_12kg_after = running_company_12 + company_delta_12
      running_company_12 = company_12kg_after
    if company_delta_48 or entry["company_deltas"]:
      company_48kg_before = running_company_48
      company_48kg_after = running_company_48 + company_delta_48
      running_company_48 = company_48kg_after

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
        customer_description=entry["customer_description"],
        system_name=entry["system_name"],
        system_type=entry["system_type"],
        expense_type=entry["expense_type"],
        reason=entry["reason"],
        buy12=buy12,
        return12=return12,
        buy48=buy48,
        return48=return48,
        total_cost=refill_event.total_cost if refill_event else None,
        paid_now=refill_event.paid_now if refill_event else None,
        order_total=entry["order_total"],
        order_paid=entry["order_paid"],
        order_installed=entry["order_installed"],
        order_received=entry["order_received"],
        unit_price_buy_12=refill_event.unit_price_buy_12 if refill_event else None,
        unit_price_buy_48=refill_event.unit_price_buy_48 if refill_event else None,
        collection_action=entry["collection_action"],
        collection_amount=entry["collection_amount"],
        collection_qty_12kg=entry["collection_qty_12kg"],
        collection_qty_48kg=entry["collection_qty_48kg"],
        cash_before=cash_before,
        cash_after=cash_after,
        company_before=company_before,
        company_after=company_after,
        company_12kg_before=company_12kg_before,
        company_12kg_after=company_12kg_after,
        company_48kg_before=company_48kg_before,
        company_48kg_after=company_48kg_after,
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
    customer_money_receivable=float(customer_totals["money_receivable"]),
    customer_money_payable=float(customer_totals["money_payable"]),
    customer_12kg_receivable=int(customer_totals["cyl_receivable_12"]),
    customer_12kg_payable=int(customer_totals["cyl_payable_12"]),
    customer_48kg_receivable=int(customer_totals["cyl_receivable_48"]),
    customer_48kg_payable=int(customer_totals["cyl_payable_48"]),
    inventory_start=inventory_start,
    inventory_end=inventory_end,
    audit_summary=get_daily_audit_summary(session, business_date),
    events=event_rows,
  )
