from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Customer, CustomerAdjustment
from app.services.customers import sync_customer_totals
from app.services.inventory import (
  add_inventory_delta,
  delete_inventory_deltas_for_source,
  recompute_daily_summaries,
)
from app.schemas import CustomerAdjustmentCreate, CustomerAdjustmentUpdate, new_id
from app.utils.time import business_date_from_utc


router = APIRouter(prefix="/customer-adjustments", tags=["customer-adjustments"])

def _recompute_inventory_for_deleted(
  session: Session, deleted_by_gas: dict[str, date] | None
) -> None:
  if not deleted_by_gas:
    return
  end_date = business_date_from_utc(datetime.now(timezone.utc))
  for gas_type, start_date in deleted_by_gas.items():
    recompute_daily_summaries(
      session,
      gas_type,
      start_date,
      end_date,
      allow_negative=True,
    )


@router.get("")
def list_adjustments(
  customer_id: Optional[str] = Query(default=None),
  session: Session = Depends(get_session),
) -> list[CustomerAdjustment]:
  stmt = select(CustomerAdjustment)
  if customer_id:
    stmt = stmt.where(CustomerAdjustment.customer_id == customer_id)
  return session.exec(stmt).all()


@router.post("")
def create_adjustment(payload: CustomerAdjustmentCreate, session: Session = Depends(get_session)) -> CustomerAdjustment:
  customer = session.get(Customer, payload.customer_id)
  if not customer or customer.is_deleted:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  is_inventory_neutral = payload.is_inventory_neutral
  if payload.reason == "onboarding":
    is_inventory_neutral = True
  elif is_inventory_neutral is None:
    is_inventory_neutral = False

  money_receive = payload.amount_money if payload.amount_money >= 0 else 0
  money_give = abs(payload.amount_money) if payload.amount_money < 0 else 0
  count_12_receive = payload.count_12kg if payload.count_12kg >= 0 else 0
  count_12_give = abs(payload.count_12kg) if payload.count_12kg < 0 else 0
  count_48_receive = payload.count_48kg if payload.count_48kg >= 0 else 0
  count_48_give = abs(payload.count_48kg) if payload.count_48kg < 0 else 0

  adjustment = CustomerAdjustment(
    id=new_id("adj_"),
    customer_id=payload.customer_id,
    amount_money=payload.amount_money,
    amount_money_to_receive=money_receive,
    amount_money_to_give=money_give,
    count_12kg=payload.count_12kg,
    count_12kg_to_receive=count_12_receive,
    count_12kg_to_give=count_12_give,
    count_48kg=payload.count_48kg,
    count_48kg_to_receive=count_48_receive,
    count_48kg_to_give=count_48_give,
    reason=payload.reason,
    is_inventory_neutral=is_inventory_neutral,
    created_at=datetime.now(timezone.utc),
  )
  session.add(adjustment)

  if not adjustment.is_inventory_neutral:
    if adjustment.count_12kg:
      add_inventory_delta(
        session,
        gas_type="12kg",
        delta_full=-adjustment.count_12kg,
        delta_empty=0,
        effective_at=adjustment.created_at,
        source_type="customer_adjustment",
        source_id=adjustment.id,
        reason=f"customer_adjustment:{adjustment.reason}",
      )
    if adjustment.count_48kg:
      add_inventory_delta(
        session,
        gas_type="48kg",
        delta_full=-adjustment.count_48kg,
        delta_empty=0,
        effective_at=adjustment.created_at,
        source_type="customer_adjustment",
        source_id=adjustment.id,
        reason=f"customer_adjustment:{adjustment.reason}",
      )

  sync_customer_totals(session, customer.id)
  session.commit()
  session.refresh(adjustment)
  return adjustment


@router.put("/{adjustment_id}")
def update_adjustment(
  adjustment_id: str,
  payload: CustomerAdjustmentUpdate,
  session: Session = Depends(get_session),
) -> CustomerAdjustment:
  adjustment = session.get(CustomerAdjustment, adjustment_id)
  if not adjustment:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adjustment not found")

  old_customer_id = adjustment.customer_id
  old_amount = adjustment.amount_money
  old_12 = adjustment.count_12kg
  old_48 = adjustment.count_48kg

  payload_data = payload.model_dump(exclude_unset=True)
  new_customer_id = payload_data.get("customer_id", adjustment.customer_id)
  new_amount = payload_data.get("amount_money", adjustment.amount_money)
  new_12 = payload_data.get("count_12kg", adjustment.count_12kg)
  new_48 = payload_data.get("count_48kg", adjustment.count_48kg)
  new_reason = payload_data.get("reason", adjustment.reason)
  new_neutral = payload_data.get("is_inventory_neutral", adjustment.is_inventory_neutral)

  deleted_by_gas = delete_inventory_deltas_for_source(
    session, source_id=adjustment.id, source_types=["customer_adjustment"]
  )

  if new_customer_id != old_customer_id:
    new_customer = session.get(Customer, new_customer_id)
    if not new_customer or new_customer.is_deleted:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
    adjustment.customer_id = new_customer_id

  adjustment.amount_money = new_amount
  adjustment.amount_money_to_receive = new_amount if new_amount >= 0 else 0
  adjustment.amount_money_to_give = abs(new_amount) if new_amount < 0 else 0
  adjustment.count_12kg = new_12
  adjustment.count_12kg_to_receive = new_12 if new_12 >= 0 else 0
  adjustment.count_12kg_to_give = abs(new_12) if new_12 < 0 else 0
  adjustment.count_48kg = new_48
  adjustment.count_48kg_to_receive = new_48 if new_48 >= 0 else 0
  adjustment.count_48kg_to_give = abs(new_48) if new_48 < 0 else 0
  adjustment.reason = new_reason
  adjustment.is_inventory_neutral = new_neutral
  session.add(adjustment)

  if not adjustment.is_inventory_neutral:
    if adjustment.count_12kg:
      add_inventory_delta(
        session,
        gas_type="12kg",
        delta_full=-adjustment.count_12kg,
        delta_empty=0,
        effective_at=adjustment.created_at,
        source_type="customer_adjustment",
        source_id=adjustment.id,
        reason=f"customer_adjustment:{adjustment.reason}",
      )
    if adjustment.count_48kg:
      add_inventory_delta(
        session,
        gas_type="48kg",
        delta_full=-adjustment.count_48kg,
        delta_empty=0,
        effective_at=adjustment.created_at,
        source_type="customer_adjustment",
        source_id=adjustment.id,
        reason=f"customer_adjustment:{adjustment.reason}",
      )
  sync_customer_totals(session, old_customer_id)
  if new_customer_id != old_customer_id:
    sync_customer_totals(session, new_customer_id)
  _recompute_inventory_for_deleted(session, deleted_by_gas)
  session.commit()
  session.refresh(adjustment)
  return adjustment


@router.delete("/{adjustment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adjustment(adjustment_id: str, session: Session = Depends(get_session)) -> None:
  adjustment = session.get(CustomerAdjustment, adjustment_id)
  if not adjustment:
    return
  customer_id = adjustment.customer_id
  deleted_by_gas = delete_inventory_deltas_for_source(
    session, source_id=adjustment.id, source_types=["customer_adjustment"]
  )
  session.delete(adjustment)
  sync_customer_totals(session, customer_id)
  _recompute_inventory_for_deleted(session, deleted_by_gas)
  session.commit()
