from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.auth import get_tenant_id
from app.db import get_session
from app.models import Customer, CustomerTransaction
from app.schemas import CustomerAdjustmentCreate, CustomerAdjustmentOut
from app.services.ledger import boundary_for_source, snapshot_customer_debts, sum_customer_money, sum_customer_cylinders
from app.services.posting import allocate_happened_at, derive_day, post_customer_transaction

router = APIRouter(prefix="/customer-adjustments", tags=["customer-adjustments"])


def _group_id() -> str:
  return str(uuid4())


def _stable_txn_key(txn: CustomerTransaction) -> tuple:
  return (txn.happened_at, txn.created_at, txn.id)


def _adjustment_out(txns: list[CustomerTransaction], session: Session) -> CustomerAdjustmentOut:
  if not txns:
    raise HTTPException(status_code=404, detail="Adjustment not found")
  base = min(txns, key=_stable_txn_key)
  after = max(txns, key=_stable_txn_key)
  money = sum(t.total - t.paid for t in txns if t.gas_type is None)
  count_12 = sum(t.installed - t.received for t in txns if t.gas_type == "12kg")
  count_48 = sum(t.installed - t.received for t in txns if t.gas_type == "48kg")
  after_boundary = boundary_for_source(session, source_type="customer_txn", source_id=after.id)
  if after_boundary is not None:
    live = snapshot_customer_debts(session, customer_id=base.customer_id, boundary=after_boundary)
  else:
    live = {
      "debt_cash": after.debt_cash,
      "debt_cylinders_12": after.debt_cylinders_12,
      "debt_cylinders_48": after.debt_cylinders_48,
    }
  return CustomerAdjustmentOut(
    id=base.group_id or base.id,
    customer_id=base.customer_id,
    amount_money=money,
    count_12kg=count_12,
    count_48kg=count_48,
    reason=base.note,
    effective_at=base.happened_at,
    created_at=base.created_at,
    debt_cash=after.debt_cash,
    debt_cylinders_12=after.debt_cylinders_12,
    debt_cylinders_48=after.debt_cylinders_48,
    live_debt_cash=live["debt_cash"],
    live_debt_cylinders_12=live["debt_cylinders_12"],
    live_debt_cylinders_48=live["debt_cylinders_48"],
  )


@router.get("/{customer_id}", response_model=list[CustomerAdjustmentOut])
def list_adjustments(
  customer_id: str,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> list[CustomerAdjustmentOut]:
  rows = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.customer_id == customer_id)
    .where(CustomerTransaction.tenant_id == tenant_id)
    .where(CustomerTransaction.kind == "adjust")
    .where(CustomerTransaction.deleted_at == None)  # noqa: E711
    .order_by(
      CustomerTransaction.happened_at.desc(),
      CustomerTransaction.created_at.desc(),
      CustomerTransaction.id.desc(),
    )
  ).all()
  groups: dict[str, list[CustomerTransaction]] = {}
  for row in rows:
    key = row.group_id or row.id
    groups.setdefault(key, []).append(row)
  return [_adjustment_out(txns, session) for txns in groups.values()]


@router.post("", response_model=CustomerAdjustmentOut, status_code=status.HTTP_201_CREATED)
def create_adjustment(
  payload: CustomerAdjustmentCreate,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> CustomerAdjustmentOut:
  customer = session.get(Customer, payload.customer_id)
  if not customer or customer.tenant_id != tenant_id:
    raise HTTPException(status_code=400, detail="Customer not found")

  if payload.request_id:
    existing = session.exec(
      select(CustomerTransaction)
      .where(CustomerTransaction.request_id == payload.request_id)
      .where(CustomerTransaction.tenant_id == tenant_id)
    ).first()
    if existing:
      group_id = existing.group_id or existing.id
      txns = session.exec(
        select(CustomerTransaction)
        .where(CustomerTransaction.group_id == group_id)
        .where(CustomerTransaction.tenant_id == tenant_id)
        .where(CustomerTransaction.deleted_at == None)  # noqa: E711
      ).all()
      return _adjustment_out(txns or [existing], session)

  happened_at = allocate_happened_at(session, tenant_id=tenant_id, value=payload.happened_at)
  group_id = _group_id()
  txns: list[CustomerTransaction] = []

  money = payload.amount_money or 0
  count_12 = payload.count_12kg or 0
  count_48 = payload.count_48kg or 0

  # Compute current balances before any posting
  current_money = sum_customer_money(session, customer_id=payload.customer_id)
  current_cyl_12 = sum_customer_cylinders(session, customer_id=payload.customer_id, gas_type="12kg")
  current_cyl_48 = sum_customer_cylinders(session, customer_id=payload.customer_id, gas_type="48kg")

  # Compute after-snapshots (what the balance will be after all three transactions)
  next_money = current_money + (money if money else 0)
  next_cyl_12 = current_cyl_12 + (count_12 if count_12 else 0)
  next_cyl_48 = current_cyl_48 + (count_48 if count_48 else 0)

  if money:
    txn = CustomerTransaction(
      tenant_id=tenant_id,
      customer_id=payload.customer_id,
      system_id=None,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="adjust",
      gas_type=None,
      installed=0,
      received=0,
      total=money,
      paid=0,
      debt_cash=next_money,
      debt_cylinders_12=next_cyl_12,
      debt_cylinders_48=next_cyl_48,
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  if count_12:
    txn = CustomerTransaction(
      tenant_id=tenant_id,
      customer_id=payload.customer_id,
      system_id=None,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="adjust",
      gas_type="12kg",
      installed=max(count_12, 0),
      received=max(-count_12, 0),
      total=0,
      paid=0,
      debt_cash=next_money,
      debt_cylinders_12=next_cyl_12,
      debt_cylinders_48=next_cyl_48,
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  if count_48:
    txn = CustomerTransaction(
      tenant_id=tenant_id,
      customer_id=payload.customer_id,
      system_id=None,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="adjust",
      gas_type="48kg",
      installed=max(count_48, 0),
      received=max(-count_48, 0),
      total=0,
      paid=0,
      debt_cash=next_money,
      debt_cylinders_12=next_cyl_12,
      debt_cylinders_48=next_cyl_48,
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  if not txns:
    raise HTTPException(status_code=400, detail="adjustment_required")

  session.commit()
  for txn in txns:
    session.refresh(txn)
  return _adjustment_out(txns, session)

