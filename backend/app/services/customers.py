from datetime import date, datetime, timezone

from sqlmodel import Session, select

from app.models import CollectionEvent, Customer, CustomerAdjustment, Order
from app.utils.time import business_date_start_utc, to_utc_naive


def sync_customer_totals(session: Session, customer_id: str) -> None:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    return

  orders = session.exec(
    select(Order).where(Order.customer_id == customer_id, Order.is_deleted == False)  # noqa: E712
  ).all()
  collections = session.exec(
    select(CollectionEvent).where(
      CollectionEvent.customer_id == customer_id,
      CollectionEvent.is_deleted == False,  # noqa: E712
    )
  ).all()
  adjustments = session.exec(
    select(CustomerAdjustment).where(CustomerAdjustment.customer_id == customer_id)
  ).all()

  def order_net_paid(order: Order) -> float:
    if order.money_received is not None or order.money_given is not None:
      return (order.money_received or 0) - (order.money_given or 0)
    return order.paid_amount or 0

  order_money = sum(
    order.price_total - order_net_paid(order)
    for order in orders
  )
  adjust_money = sum(adj.amount_money for adj in adjustments)
  collection_money = sum(
    (ev.amount_money or 0)
    for ev in collections
    if ev.action_type == "payment"
  )
  money_balance = order_money + adjust_money - collection_money

  money_to_receive = 0.0
  money_to_give = 0.0
  for order in orders:
    delta = order.price_total - order_net_paid(order)
    if delta >= 0:
      money_to_receive += delta
    else:
      money_to_give += abs(delta)
  for adj in adjustments:
    if adj.amount_money_to_receive or adj.amount_money_to_give:
      money_to_receive += adj.amount_money_to_receive
      money_to_give += adj.amount_money_to_give
    else:
      if adj.amount_money >= 0:
        money_to_receive += adj.amount_money
      else:
        money_to_give += abs(adj.amount_money)
  for ev in collections:
    if ev.action_type != "payment":
      continue
    delta = -(ev.amount_money or 0)
    if delta >= 0:
      money_to_receive += delta
    else:
      money_to_give += abs(delta)

  order_count = len(orders)
  total_cylinders = sum(order.cylinders_installed for order in orders)

  order_12 = sum(
    order.cylinders_installed - order.cylinders_received
    for order in orders
    if order.gas_type == "12kg"
  )
  order_48 = sum(
    order.cylinders_installed - order.cylinders_received
    for order in orders
    if order.gas_type == "48kg"
  )
  adjust_12 = sum(adj.count_12kg for adj in adjustments)
  adjust_48 = sum(adj.count_48kg for adj in adjustments)

  customer.money_balance = money_balance
  customer.money_to_receive = money_to_receive
  customer.money_to_give = money_to_give
  customer.total_cylinders_delivered_lifetime = total_cylinders
  customer.order_count = order_count
  collection_12 = sum(
    (ev.qty_12kg or 0)
    for ev in collections
    if ev.action_type == "return"
  )
  collection_48 = sum(
    (ev.qty_48kg or 0)
    for ev in collections
    if ev.action_type == "return"
  )
  customer.cylinder_balance_12kg = order_12 + adjust_12 - collection_12
  customer.cylinder_balance_48kg = order_48 + adjust_48 - collection_48
  cyl_receive_12 = 0
  cyl_give_12 = 0
  cyl_receive_48 = 0
  cyl_give_48 = 0
  for order in orders:
    delta = order.cylinders_installed - order.cylinders_received
    if order.gas_type == "12kg":
      if delta >= 0:
        cyl_receive_12 += delta
      else:
        cyl_give_12 += abs(delta)
    elif order.gas_type == "48kg":
      if delta >= 0:
        cyl_receive_48 += delta
      else:
        cyl_give_48 += abs(delta)
  for adj in adjustments:
    if adj.count_12kg_to_receive or adj.count_12kg_to_give:
      cyl_receive_12 += adj.count_12kg_to_receive
      cyl_give_12 += adj.count_12kg_to_give
    else:
      if adj.count_12kg >= 0:
        cyl_receive_12 += adj.count_12kg
      else:
        cyl_give_12 += abs(adj.count_12kg)
    if adj.count_48kg_to_receive or adj.count_48kg_to_give:
      cyl_receive_48 += adj.count_48kg_to_receive
      cyl_give_48 += adj.count_48kg_to_give
    else:
      if adj.count_48kg >= 0:
        cyl_receive_48 += adj.count_48kg
      else:
        cyl_give_48 += abs(adj.count_48kg)
  for ev in collections:
    if ev.action_type != "return":
      continue
    delta_12 = -(ev.qty_12kg or 0)
    delta_48 = -(ev.qty_48kg or 0)
    if delta_12 >= 0:
      cyl_receive_12 += delta_12
    else:
      cyl_give_12 += abs(delta_12)
    if delta_48 >= 0:
      cyl_receive_48 += delta_48
    else:
      cyl_give_48 += abs(delta_48)
  customer.cylinder_to_receive_12kg = cyl_receive_12
  customer.cylinder_to_give_12kg = cyl_give_12
  customer.cylinder_to_receive_48kg = cyl_receive_48
  customer.cylinder_to_give_48kg = cyl_give_48
  customer.updated_at = datetime.now(timezone.utc)
  session.add(customer)


def rebuild_customer_ledger(
  session: Session,
  *,
  customer_id: str,
  start_date: datetime | date,
) -> None:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    return

  if isinstance(start_date, date) and not isinstance(start_date, datetime):
    start_dt = business_date_start_utc(start_date)
  else:
    start_dt = to_utc_naive(start_date)

  def order_net_paid(order: Order) -> float:
    if order.money_received is not None or order.money_given is not None:
      return (order.money_received or 0) - (order.money_given or 0)
    return order.paid_amount or 0

  orders_before = session.exec(
    select(Order)
    .where(Order.customer_id == customer_id, Order.is_deleted == False)  # noqa: E712
    .where(Order.delivered_at < start_dt)
  ).all()
  collections_before = session.exec(
    select(CollectionEvent)
    .where(CollectionEvent.customer_id == customer_id, CollectionEvent.is_deleted == False)  # noqa: E712
    .where(CollectionEvent.effective_at < start_dt)
  ).all()
  adjustments_before = session.exec(
    select(CustomerAdjustment)
    .where(CustomerAdjustment.customer_id == customer_id)
    .where(CustomerAdjustment.created_at < start_dt)
  ).all()

  money_before = sum(order.price_total - order_net_paid(order) for order in orders_before)
  money_before += sum(adj.amount_money for adj in adjustments_before)
  money_before -= sum(
    (ev.amount_money or 0)
    for ev in collections_before
    if ev.action_type == "payment"
  )

  cyl_before_12 = sum(
    order.cylinders_installed - order.cylinders_received
    for order in orders_before
    if order.gas_type == "12kg"
  )
  cyl_before_48 = sum(
    order.cylinders_installed - order.cylinders_received
    for order in orders_before
    if order.gas_type == "48kg"
  )
  cyl_before_12 += sum(adj.count_12kg for adj in adjustments_before)
  cyl_before_48 += sum(adj.count_48kg for adj in adjustments_before)
  cyl_before_12 -= sum(
    (ev.qty_12kg or 0)
    for ev in collections_before
    if ev.action_type == "return"
  )
  cyl_before_48 -= sum(
    (ev.qty_48kg or 0)
    for ev in collections_before
    if ev.action_type == "return"
  )

  running_money = money_before
  running_cyl_12 = cyl_before_12
  running_cyl_48 = cyl_before_48

  orders = session.exec(
    select(Order)
    .where(Order.customer_id == customer_id, Order.is_deleted == False)  # noqa: E712
    .where(Order.delivered_at >= start_dt)
  ).all()
  collections = session.exec(
    select(CollectionEvent)
    .where(CollectionEvent.customer_id == customer_id, CollectionEvent.is_deleted == False)  # noqa: E712
    .where(CollectionEvent.effective_at >= start_dt)
  ).all()
  adjustments = session.exec(
    select(CustomerAdjustment)
    .where(CustomerAdjustment.customer_id == customer_id)
    .where(CustomerAdjustment.created_at >= start_dt)
  ).all()

  timeline: list[tuple[datetime, datetime, str, object]] = []
  for order in orders:
    timeline.append((to_utc_naive(order.delivered_at), to_utc_naive(order.created_at), "order", order))
  for ev in collections:
    timeline.append((to_utc_naive(ev.effective_at), to_utc_naive(ev.created_at), "collection", ev))
  for adj in adjustments:
    timeline.append((to_utc_naive(adj.created_at), to_utc_naive(adj.created_at), "adjustment", adj))

  timeline.sort(key=lambda item: (item[0], item[1]))
  now = datetime.now(timezone.utc)

  for _, _, kind, record in timeline:
    if kind == "order":
      order = record
      order.money_balance_before = running_money
      gross_paid = order_net_paid(order)
      running_money += order.price_total - gross_paid
      order.money_balance_after = running_money

      order.cyl_balance_before = {
        "12kg": running_cyl_12,
        "48kg": running_cyl_48,
      }
      cyl_delta = order.cylinders_installed - order.cylinders_received
      if order.gas_type == "12kg":
        running_cyl_12 += cyl_delta
      elif order.gas_type == "48kg":
        running_cyl_48 += cyl_delta
      order.cyl_balance_after = {
        "12kg": running_cyl_12,
        "48kg": running_cyl_48,
      }
      order.updated_at = now
      session.add(order)
      continue

    if kind == "collection":
      ev = record
      ev.money_balance_before = running_money
      ev.cyl_balance_before = {
        "12kg": running_cyl_12,
        "48kg": running_cyl_48,
      }
      if ev.action_type == "payment":
        running_money -= ev.amount_money or 0
      else:
        running_cyl_12 -= ev.qty_12kg or 0
        running_cyl_48 -= ev.qty_48kg or 0
      ev.money_balance_after = running_money
      ev.cyl_balance_after = {
        "12kg": running_cyl_12,
        "48kg": running_cyl_48,
      }
      ev.updated_at = now
      session.add(ev)
      continue

    adj = record
    running_money += adj.amount_money
    running_cyl_12 += adj.count_12kg
    running_cyl_48 += adj.count_48kg

  sync_customer_totals(session, customer.id)
