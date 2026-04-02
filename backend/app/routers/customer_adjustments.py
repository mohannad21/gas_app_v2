from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.config import DEFAULT_TENANT_ID
from app.db import get_session
from app.models import Customer, CustomerTransaction
from app.schemas import CustomerAdjustmentCreate, CustomerAdjustmentOut
from app.services.posting import derive_day, normalize_happened_at, post_customer_transaction

router = APIRouter(prefix="/customer-adjustments", tags=["customer-adjustments"])


def _group_id() -> str:
  return str(uuid4())


def _stable_txn_key(txn: CustomerTransaction) -> tuple:
  return (txn.happened_at, txn.created_at, txn.id)


def _adjustment_out(txns: list[CustomerTransaction]) -> CustomerAdjustmentOut:
  if not txns:
    raise HTTPException(status_code=404, detail="Adjustment not found")
  base = min(txns, key=_stable_txn_key)
  after = max(txns, key=_stable_txn_key)
  money = sum(t.total - t.paid for t in txns if t.gas_type is None)
  count_12 = sum(t.installed - t.received for t in txns if t.gas_type == "12kg")
  count_48 = sum(t.installed - t.received for t in txns if t.gas_type == "48kg")
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
  )


@router.get("/{customer_id}", response_model=list[CustomerAdjustmentOut])
def list_adjustments(customer_id: str, session: Session = Depends(get_session)) -> list[CustomerAdjustmentOut]:
  rows = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.customer_id == customer_id)
    .where(CustomerTransaction.kind == "adjust")
    .where(CustomerTransaction.deleted_at == None)  # noqa: E711
    .order_by(CustomerTransaction.happened_at.desc())
  ).all()
  groups: dict[str, list[CustomerTransaction]] = {}
  for row in rows:
    key = row.group_id or row.id
    groups.setdefault(key, []).append(row)
  return [_adjustment_out(txns) for txns in groups.values()]


@router.post("", response_model=CustomerAdjustmentOut, status_code=status.HTTP_201_CREATED)
def create_adjustment(payload: CustomerAdjustmentCreate, session: Session = Depends(get_session)) -> CustomerAdjustmentOut:
  customer = session.get(Customer, payload.customer_id)
  if not customer:
    raise HTTPException(status_code=400, detail="Customer not found")

  if payload.request_id:
    existing = session.exec(
      select(CustomerTransaction).where(CustomerTransaction.request_id == payload.request_id)
    ).first()
    if existing:
      group_id = existing.group_id or existing.id
      txns = session.exec(
        select(CustomerTransaction)
        .where(CustomerTransaction.group_id == group_id)
        .where(CustomerTransaction.deleted_at == None)  # noqa: E711
      ).all()
      return _adjustment_out(txns or [existing])

  happened_at = normalize_happened_at(payload.happened_at)
  group_id = _group_id()
  txns: list[CustomerTransaction] = []

  money = payload.amount_money or 0
  if money:
    txn = CustomerTransaction(
      tenant_id=DEFAULT_TENANT_ID,
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
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  count_12 = payload.count_12kg or 0
  if count_12:
    txn = CustomerTransaction(
      tenant_id=DEFAULT_TENANT_ID,
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
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  count_48 = payload.count_48kg or 0
  if count_48:
    txn = CustomerTransaction(
      tenant_id=DEFAULT_TENANT_ID,
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
  return _adjustment_out(txns)

