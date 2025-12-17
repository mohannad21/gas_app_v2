from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from app.db import get_session
from app.models import Customer, Order, System
from app.schemas import DailyReportOrder, DailyReportRow

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
      )
    )

  return response
