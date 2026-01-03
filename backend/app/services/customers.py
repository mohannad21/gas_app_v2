from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models import Customer, CustomerAdjustment, Order


def sync_customer_totals(session: Session, customer_id: str) -> None:
  customer = session.get(Customer, customer_id)
  if not customer or customer.is_deleted:
    return

  orders = session.exec(
    select(Order).where(Order.customer_id == customer_id, Order.is_deleted == False)  # noqa: E712
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
  money_balance = order_money + adjust_money

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
  customer.total_cylinders_delivered_lifetime = total_cylinders
  customer.order_count = order_count
  customer.cylinder_balance_12kg = order_12 + adjust_12
  customer.cylinder_balance_48kg = order_48 + adjust_48
  customer.updated_at = datetime.now(timezone.utc)
  session.add(customer)
