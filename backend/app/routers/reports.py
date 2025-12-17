from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from app.db import get_session
from app.models import Customer, InventoryVersion, Order, System
from app.schemas import DailyReportOrder, DailyReportRow, InventorySnapshot

router = APIRouter(prefix="/reports", tags=["reports"])


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
    grouped[order.delivered_at.date()].append((order, customer_name, customer_notes, system_name))

  # Preload inventory versions to avoid repeated queries per row
  inv_rows: List[InventoryVersion] = session.exec(
    select(InventoryVersion).order_by(InventoryVersion.effective_at)
  ).all()

  def select_version(gas: str, boundary: datetime) -> Optional[InventoryVersion]:
    before = [
      iv for iv in inv_rows
      if iv.gas_type == gas and iv.effective_at <= boundary
    ]
    after = [
      iv for iv in inv_rows
      if iv.gas_type == gas and iv.effective_at > boundary
    ]
    if before:
      return max(before, key=lambda iv: iv.effective_at)
    if after:
      return min(after, key=lambda iv: iv.effective_at)
    return None

  def snapshot_for_boundary(boundary: datetime) -> Optional[InventorySnapshot]:
    if not inv_rows:
      return None
    latest_12 = select_version("12kg", boundary)
    latest_48 = select_version("48kg", boundary)
    if not latest_12 and not latest_48:
      return None
    full12 = latest_12.full_count if latest_12 else 0
    empty12 = latest_12.empty_count if latest_12 else 0
    full48 = latest_48.full_count if latest_48 else 0
    empty48 = latest_48.empty_count if latest_48 else 0
    as_of_candidates = [iv.effective_at for iv in (latest_12, latest_48) if iv]
    as_of = max(as_of_candidates) if as_of_candidates else boundary
    reason = None
    if latest_12 and latest_48 and latest_12.reason == latest_48.reason:
      reason = latest_12.reason
    elif latest_12 and not latest_48:
      reason = latest_12.reason
    elif latest_48 and not latest_12:
      reason = latest_48.reason
    return InventorySnapshot(
      as_of=as_of,
      full12=full12,
      empty12=empty12,
      total12=full12 + empty12,
      full48=full48,
      empty48=empty48,
      total48=full48 + empty48,
      reason=reason,
    )

  response: List[DailyReportRow] = []
  for date_key, items in sorted(grouped.items(), key=lambda i: i[0], reverse=True):
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
    day_start = datetime.combine(date_key, datetime.min.time())
    next_day = day_start + timedelta(days=1)
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
        inventory_start=snapshot_for_boundary(day_start),
        inventory_end=snapshot_for_boundary(next_day - timedelta(seconds=1)),
      )
    )

  return response
