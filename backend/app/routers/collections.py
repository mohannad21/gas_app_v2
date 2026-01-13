from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import CashDailySummary, CashDelta, CollectionEvent, Customer
from app.schemas import CollectionCreate, CollectionUpdate, new_id
from app.services.cash import (
  add_cash_delta,
  delete_cash_deltas_for_source,
  recompute_cash_summaries,
)
from app.services.customers import rebuild_customer_ledger, sync_customer_totals
from app.services.inventory import (
  add_inventory_delta,
  delete_inventory_deltas_for_source,
  inventory_totals_at,
  recompute_daily_summaries,
)
from app.utils.time import business_date_from_utc, business_date_start_utc, to_utc_naive

router = APIRouter(prefix="/collections", tags=["collections"])


def _collection_deltas(
  *,
  action_type: str,
  amount_money: float,
  qty_12kg: int,
  qty_48kg: int,
) -> tuple[float, int, int]:
  if action_type == "payment":
    return -amount_money, 0, 0
  return 0.0, -qty_12kg, -qty_48kg


def _recompute_cash_if_needed(
  session: Session,
  deleted_date: datetime | date | None,
  effective_at: datetime | None,
) -> None:
  if not deleted_date and not effective_at:
    return
  if deleted_date:
    start = deleted_date if isinstance(deleted_date, date) and not isinstance(deleted_date, datetime) else business_date_from_utc(deleted_date)
  else:
    start = business_date_from_utc(effective_at)
  end = business_date_from_utc(datetime.now(timezone.utc))
  recompute_cash_summaries(session, start, end)


def _recompute_inventory_if_needed(
  session: Session,
  deleted_by_gas: dict[str, datetime | date] | None,
  effective_at: datetime | None,
) -> None:
  now = datetime.now(timezone.utc)
  if deleted_by_gas:
    for gas_type, deleted_date in deleted_by_gas.items():
      if isinstance(deleted_date, date) and not isinstance(deleted_date, datetime):
        start = deleted_date
      else:
        start = business_date_from_utc(deleted_date)
      end = business_date_from_utc(now)
      recompute_daily_summaries(session, gas_type, start, end, allow_negative=True)
  elif effective_at:
    for gas_type in ("12kg", "48kg"):
      start = business_date_from_utc(effective_at)
      end = business_date_from_utc(now)
      recompute_daily_summaries(session, gas_type, start, end, allow_negative=True)


def _cash_total_at(session: Session, effective_at: datetime) -> float:
  effective_at_norm = to_utc_naive(effective_at)
  business_date = business_date_from_utc(effective_at_norm)
  previous = session.exec(
    select(CashDailySummary)
    .where(CashDailySummary.business_date < business_date)
    .order_by(CashDailySummary.business_date.desc())
  ).first()
  cash_total = previous.cash_end if previous else 0.0

  day_start = business_date_start_utc(business_date)
  next_day = business_date_start_utc(business_date + timedelta(days=1))
  deltas = session.exec(
    select(CashDelta)
    .where(CashDelta.effective_at >= day_start)
    .where(CashDelta.effective_at < next_day)
    .where(CashDelta.is_deleted == False)  # noqa: E712
    .where(CashDelta.effective_at <= effective_at_norm)
    .order_by(CashDelta.effective_at, CashDelta.created_at, CashDelta.id)
  ).all()
  for delta in deltas:
    if delta.source_type == "cash_init":
      cash_total = delta.delta_cash
      continue
    cash_total += delta.delta_cash
  return cash_total


@router.post("", status_code=status.HTTP_201_CREATED)
def create_collection(payload: CollectionCreate, session: Session = Depends(get_session)) -> CollectionEvent:
  customer = session.get(Customer, payload.customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  action_type = payload.action_type
  amount_money = float(payload.amount_money or 0)
  qty_12kg = int(payload.qty_12kg or 0)
  qty_48kg = int(payload.qty_48kg or 0)
  if action_type == "payment":
    if amount_money <= 0:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount_must_be_positive")
    qty_12kg = 0
    qty_48kg = 0
  else:
    if qty_12kg <= 0 and qty_48kg <= 0:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="return_counts_required")
    amount_money = 0

  effective_at = payload.effective_at or datetime.now(timezone.utc)
  money_before = customer.money_balance
  cyl_before = {"12kg": customer.cylinder_balance_12kg, "48kg": customer.cylinder_balance_48kg}
  cash_before = _cash_total_at(session, effective_at)
  cash_after = cash_before + (amount_money if action_type == "payment" else 0.0)
  try:
    inv12_full_before, inv12_empty_before = inventory_totals_at(session, "12kg", effective_at)
  except HTTPException:
    inv12_full_before, inv12_empty_before = 0, 0
  try:
    inv48_full_before, inv48_empty_before = inventory_totals_at(session, "48kg", effective_at)
  except HTTPException:
    inv48_full_before, inv48_empty_before = 0, 0
  inv12_full_after = inv12_full_before
  inv12_empty_after = inv12_empty_before + (qty_12kg if action_type == "return" else 0)
  inv48_full_after = inv48_full_before
  inv48_empty_after = inv48_empty_before + (qty_48kg if action_type == "return" else 0)
  money_delta, cyl_delta_12, cyl_delta_48 = _collection_deltas(
    action_type=action_type,
    amount_money=amount_money,
    qty_12kg=qty_12kg,
    qty_48kg=qty_48kg,
  )
  money_after = money_before + money_delta
  cyl_after = {
    "12kg": cyl_before["12kg"] + cyl_delta_12,
    "48kg": cyl_before["48kg"] + cyl_delta_48,
  }

  event = CollectionEvent(
    id=new_id("coll_"),
    customer_id=payload.customer_id,
    system_id=payload.system_id,
    action_type=action_type,
    amount_money=amount_money,
    qty_12kg=qty_12kg,
    qty_48kg=qty_48kg,
    cash_before=cash_before,
    cash_after=cash_after,
    inv12_full_before=inv12_full_before,
    inv12_full_after=inv12_full_after,
    inv12_empty_before=inv12_empty_before,
    inv12_empty_after=inv12_empty_after,
    inv48_full_before=inv48_full_before,
    inv48_full_after=inv48_full_after,
    inv48_empty_before=inv48_empty_before,
    inv48_empty_after=inv48_empty_after,
    money_balance_before=money_before,
    money_balance_after=money_after,
    cyl_balance_before=cyl_before,
    cyl_balance_after=cyl_after,
    note=payload.note,
    effective_at=effective_at,
    created_at=datetime.now(timezone.utc),
    is_deleted=False,
  )
  session.add(event)

  if action_type == "payment" and amount_money:
    add_cash_delta(
      session,
      effective_at=effective_at,
      source_type="collection_money",
      source_id=event.id,
      delta_cash=amount_money,
      reason=payload.note,
    )
    start_date = business_date_from_utc(effective_at)
    end_date = business_date_from_utc(datetime.now(timezone.utc))
    recompute_cash_summaries(session, start_date, end_date)
  if action_type == "return":
    if qty_12kg:
      add_inventory_delta(
        session,
        gas_type="12kg",
        delta_full=0,
        delta_empty=qty_12kg,
        effective_at=effective_at,
        source_type="collection_empty",
        source_id=event.id,
        reason=payload.note,
        allow_negative=True,
      )
    if qty_48kg:
      add_inventory_delta(
        session,
        gas_type="48kg",
        delta_full=0,
        delta_empty=qty_48kg,
        effective_at=effective_at,
        source_type="collection_empty",
        source_id=event.id,
        reason=payload.note,
        allow_negative=True,
      )

  customer.money_balance = money_after
  customer.cylinder_balance_12kg = cyl_after["12kg"]
  customer.cylinder_balance_48kg = cyl_after["48kg"]
  customer.updated_at = datetime.now(timezone.utc)
  session.add(customer)

  sync_customer_totals(session, customer.id)
  rebuild_customer_ledger(session, customer_id=customer.id, start_date=effective_at)
  session.commit()
  session.refresh(event)
  return event


@router.get("")
def list_collections(session: Session = Depends(get_session)) -> list[CollectionEvent]:
  statement = (
    select(CollectionEvent)
    .where(CollectionEvent.is_deleted == False)  # noqa: E712
    .order_by(CollectionEvent.created_at.desc())
  )
  return session.exec(statement).all()


@router.put("/{collection_id}")
def update_collection(
  collection_id: str, payload: CollectionUpdate, session: Session = Depends(get_session)
) -> CollectionEvent:
  event = session.get(CollectionEvent, collection_id)
  if not event or event.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
  customer = session.get(Customer, event.customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  action_type = payload.action_type or event.action_type
  amount_money = float(payload.amount_money if payload.amount_money is not None else event.amount_money)
  qty_12kg = int(payload.qty_12kg if payload.qty_12kg is not None else event.qty_12kg)
  qty_48kg = int(payload.qty_48kg if payload.qty_48kg is not None else event.qty_48kg)
  if action_type == "payment":
    if amount_money <= 0:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount_must_be_positive")
    qty_12kg = 0
    qty_48kg = 0
  else:
    if qty_12kg <= 0 and qty_48kg <= 0:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="return_counts_required")
    amount_money = 0

  old_money_delta, old_cyl_delta_12, old_cyl_delta_48 = _collection_deltas(
    action_type=event.action_type,
    amount_money=event.amount_money,
    qty_12kg=event.qty_12kg,
    qty_48kg=event.qty_48kg,
  )
  money_before = customer.money_balance - old_money_delta
  cyl_before = {
    "12kg": customer.cylinder_balance_12kg - old_cyl_delta_12,
    "48kg": customer.cylinder_balance_48kg - old_cyl_delta_48,
  }
  money_delta, cyl_delta_12, cyl_delta_48 = _collection_deltas(
    action_type=action_type,
    amount_money=amount_money,
    qty_12kg=qty_12kg,
    qty_48kg=qty_48kg,
  )
  money_after = money_before + money_delta
  cyl_after = {
    "12kg": cyl_before["12kg"] + cyl_delta_12,
    "48kg": cyl_before["48kg"] + cyl_delta_48,
  }

  deleted_cash_date = delete_cash_deltas_for_source(
    session, source_id=event.id, source_types=["collection_money"]
  )
  deleted_inv = delete_inventory_deltas_for_source(
    session, source_id=event.id, source_types=["collection_empty"]
  )

  effective_at = payload.effective_at or event.effective_at
  cash_before = _cash_total_at(session, effective_at)
  cash_after = cash_before + (amount_money if action_type == "payment" else 0.0)
  try:
    inv12_full_before, inv12_empty_before = inventory_totals_at(session, "12kg", effective_at)
  except HTTPException:
    inv12_full_before, inv12_empty_before = 0, 0
  try:
    inv48_full_before, inv48_empty_before = inventory_totals_at(session, "48kg", effective_at)
  except HTTPException:
    inv48_full_before, inv48_empty_before = 0, 0
  inv12_full_after = inv12_full_before
  inv12_empty_after = inv12_empty_before + (qty_12kg if action_type == "return" else 0)
  inv48_full_after = inv48_full_before
  inv48_empty_after = inv48_empty_before + (qty_48kg if action_type == "return" else 0)
  if action_type == "payment" and amount_money:
    add_cash_delta(
      session,
      effective_at=effective_at,
      source_type="collection_money",
      source_id=event.id,
      delta_cash=amount_money,
      reason=payload.note or event.note,
    )
  if action_type == "return":
    if qty_12kg:
      add_inventory_delta(
        session,
        gas_type="12kg",
        delta_full=0,
        delta_empty=qty_12kg,
        effective_at=effective_at,
        source_type="collection_empty",
        source_id=event.id,
        reason=payload.note or event.note,
        allow_negative=True,
      )
    if qty_48kg:
      add_inventory_delta(
        session,
        gas_type="48kg",
        delta_full=0,
        delta_empty=qty_48kg,
        effective_at=effective_at,
        source_type="collection_empty",
        source_id=event.id,
        reason=payload.note or event.note,
        allow_negative=True,
      )

  event.action_type = action_type
  event.amount_money = amount_money
  event.qty_12kg = qty_12kg
  event.qty_48kg = qty_48kg
  event.cash_before = cash_before
  event.cash_after = cash_after
  event.inv12_full_before = inv12_full_before
  event.inv12_full_after = inv12_full_after
  event.inv12_empty_before = inv12_empty_before
  event.inv12_empty_after = inv12_empty_after
  event.inv48_full_before = inv48_full_before
  event.inv48_full_after = inv48_full_after
  event.inv48_empty_before = inv48_empty_before
  event.inv48_empty_after = inv48_empty_after
  event.money_balance_before = money_before
  event.money_balance_after = money_after
  event.cyl_balance_before = cyl_before
  event.cyl_balance_after = cyl_after
  event.effective_at = effective_at
  if payload.note is not None:
    event.note = payload.note
  event.updated_at = datetime.now(timezone.utc)

  customer.money_balance = money_after
  customer.cylinder_balance_12kg = cyl_after["12kg"]
  customer.cylinder_balance_48kg = cyl_after["48kg"]
  customer.updated_at = datetime.now(timezone.utc)
  session.add(customer)
  session.add(event)

  _recompute_cash_if_needed(session, deleted_cash_date, effective_at)
  _recompute_inventory_if_needed(session, deleted_inv, effective_at)
  sync_customer_totals(session, customer.id)
  rebuild_customer_ledger(session, customer_id=customer.id, start_date=event.effective_at)
  session.commit()
  session.refresh(event)
  return event


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(collection_id: str, session: Session = Depends(get_session)) -> None:
  event = session.get(CollectionEvent, collection_id)
  if not event or event.is_deleted:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
  customer = session.get(Customer, event.customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  old_money_delta, old_cyl_delta_12, old_cyl_delta_48 = _collection_deltas(
    action_type=event.action_type,
    amount_money=event.amount_money,
    qty_12kg=event.qty_12kg,
    qty_48kg=event.qty_48kg,
  )
  money_before = customer.money_balance - old_money_delta
  cyl_before_12 = customer.cylinder_balance_12kg - old_cyl_delta_12
  cyl_before_48 = customer.cylinder_balance_48kg - old_cyl_delta_48

  event.is_deleted = True
  event.deleted_at = datetime.now(timezone.utc)
  event.updated_at = event.deleted_at
  session.add(event)

  deleted_cash_date = delete_cash_deltas_for_source(
    session, source_id=event.id, source_types=["collection_money"]
  )
  deleted_inv = delete_inventory_deltas_for_source(
    session, source_id=event.id, source_types=["collection_empty"]
  )
  _recompute_cash_if_needed(session, deleted_cash_date, None)
  _recompute_inventory_if_needed(session, deleted_inv, None)

  customer.money_balance = money_before
  customer.cylinder_balance_12kg = cyl_before_12
  customer.cylinder_balance_48kg = cyl_before_48
  customer.updated_at = datetime.now(timezone.utc)
  session.add(customer)

  sync_customer_totals(session, customer.id)
  rebuild_customer_ledger(session, customer_id=customer.id, start_date=event.effective_at)
  session.commit()
