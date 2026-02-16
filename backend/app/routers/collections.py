from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Customer, CustomerTransaction, System
from app.schemas import CollectionCreate, CollectionEvent, CollectionUpdate
from app.services.ledger import sum_customer_cylinders, sum_customer_money
from app.services.posting import derive_day, normalize_happened_at, post_customer_transaction, reverse_source

router = APIRouter(prefix="/collections", tags=["collections"])


def _new_group_id() -> str:
  return str(uuid4())


def _as_event(txns: list[CustomerTransaction]) -> CollectionEvent:
  if not txns:
    raise HTTPException(status_code=404, detail="Collection not found")
  base = min(txns, key=lambda t: t.happened_at)
  qty_12 = sum(t.received for t in txns if t.gas_type == "12kg")
  qty_48 = sum(t.received for t in txns if t.gas_type == "48kg")
  amount_payment = sum(t.paid for t in txns if t.kind == "payment")
  amount_payout = sum(t.paid for t in txns if t.kind == "payout")
  action_type = "payment" if amount_payment else "payout" if amount_payout else "return"
  amount = amount_payment or amount_payout
  group_id = base.group_id or base.id
  return CollectionEvent(
    id=group_id,
    customer_id=base.customer_id,
    action_type=action_type,
    amount_money=amount or None,
    qty_12kg=qty_12 or None,
    qty_48kg=qty_48 or None,
    debt_cash=base.debt_cash,
    debt_cylinders_12=base.debt_cylinders_12,
    debt_cylinders_48=base.debt_cylinders_48,
    system_id=base.system_id,
    created_at=base.created_at,
    effective_at=base.happened_at,
    note=base.note,
  )


@router.get("", response_model=list[CollectionEvent])
def list_collections(session: Session = Depends(get_session)) -> list[CollectionEvent]:
  rows = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.kind.in_(["payment", "payout", "return"]))
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
    .order_by(CustomerTransaction.happened_at.desc())
  ).all()
  groups: dict[str, list[CustomerTransaction]] = {}
  for row in rows:
    key = row.group_id or row.id
    groups.setdefault(key, []).append(row)
  return [_as_event(txns) for txns in groups.values()]


@router.post("", response_model=CollectionEvent, status_code=status.HTTP_201_CREATED)
def create_collection(payload: CollectionCreate, session: Session = Depends(get_session)) -> CollectionEvent:
  customer = session.get(Customer, payload.customer_id)
  if not customer:
    raise HTTPException(status_code=400, detail="Customer not found")
  if payload.system_id:
    system = session.get(System, payload.system_id)
    if not system:
      raise HTTPException(status_code=400, detail="System not found")

  if payload.request_id:
    existing = session.exec(
      select(CustomerTransaction).where(CustomerTransaction.request_id == payload.request_id)
    ).first()
    if existing:
      group_id = existing.group_id or existing.id
      txns = session.exec(
        select(CustomerTransaction)
        .where(CustomerTransaction.group_id == group_id)
        .where(CustomerTransaction.is_reversed == False)  # noqa: E712
      ).all()
      return _as_event(txns or [existing])

  happened_at = normalize_happened_at(payload.happened_at)
  group_id = _new_group_id()
  txns: list[CustomerTransaction] = []

  current_money = sum_customer_money(session, customer_id=payload.customer_id)
  current_cyl_12 = sum_customer_cylinders(session, customer_id=payload.customer_id, gas_type="12kg")
  current_cyl_48 = sum_customer_cylinders(session, customer_id=payload.customer_id, gas_type="48kg")

  if payload.action_type in ("payment", "payout"):
    amount = payload.amount_money or 0
    if amount <= 0:
      raise HTTPException(status_code=400, detail="amount_must_be_positive")
    is_payout = payload.action_type == "payout"
    next_money = current_money + amount if is_payout else current_money - amount
    txn = CustomerTransaction(
      customer_id=payload.customer_id,
      system_id=payload.system_id,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="payout" if is_payout else "payment",
      gas_type=None,
      installed=0,
      received=0,
      total=0,
      paid=amount,
      debt_cash=next_money,
      debt_cylinders_12=current_cyl_12,
      debt_cylinders_48=current_cyl_48,
      note=payload.note,
      group_id=group_id,
      request_id=payload.request_id,
      is_reversed=False,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)
  else:
    qty_12 = payload.qty_12kg or 0
    qty_48 = payload.qty_48kg or 0
    if qty_12 <= 0 and qty_48 <= 0:
      raise HTTPException(status_code=400, detail="return_quantity_required")
    if qty_12 > 0:
      next_cyl_12 = current_cyl_12 - qty_12
      txn = CustomerTransaction(
        customer_id=payload.customer_id,
        system_id=payload.system_id,
        happened_at=happened_at,
        day=derive_day(happened_at),
        kind="return",
        gas_type="12kg",
        installed=0,
        received=qty_12,
        total=0,
        paid=0,
        debt_cash=current_money,
        debt_cylinders_12=next_cyl_12,
        debt_cylinders_48=current_cyl_48,
        note=payload.note,
        group_id=group_id,
        request_id=payload.request_id,
        is_reversed=False,
      )
      session.add(txn)
      post_customer_transaction(session, txn)
      txns.append(txn)
      current_cyl_12 = next_cyl_12
    if qty_48 > 0:
      next_cyl_48 = current_cyl_48 - qty_48
      txn = CustomerTransaction(
        customer_id=payload.customer_id,
        system_id=payload.system_id,
        happened_at=happened_at,
        day=derive_day(happened_at),
        kind="return",
        gas_type="48kg",
        installed=0,
        received=qty_48,
        total=0,
        paid=0,
        debt_cash=current_money,
        debt_cylinders_12=current_cyl_12,
        debt_cylinders_48=next_cyl_48,
        note=payload.note,
        group_id=group_id,
        request_id=payload.request_id,
        is_reversed=False,
      )
      session.add(txn)
      post_customer_transaction(session, txn)
      txns.append(txn)
      current_cyl_48 = next_cyl_48

  session.commit()
  for txn in txns:
    session.refresh(txn)
  return _as_event(txns)


@router.put("/{collection_id}", response_model=CollectionEvent)
def update_collection(collection_id: str, payload: CollectionUpdate, session: Session = Depends(get_session)) -> CollectionEvent:
  txns = session.exec(
    select(CustomerTransaction)
    .where(
      (CustomerTransaction.id == collection_id)
      | (CustomerTransaction.group_id == collection_id)
    )
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).all()
  if not txns:
    raise HTTPException(status_code=404, detail="Collection not found")
  base = txns[0]

  for txn in txns:
    reversal_happened_at = txn.happened_at
    reversal_day = txn.day
    reversal = CustomerTransaction(
      customer_id=txn.customer_id,
      system_id=txn.system_id,
      happened_at=reversal_happened_at,
      day=reversal_day,
      kind=txn.kind,
      gas_type=txn.gas_type,
      installed=txn.installed,
      received=txn.received,
      total=txn.total,
      paid=txn.paid,
      debt_cash=txn.debt_cash,
      debt_cylinders_12=txn.debt_cylinders_12,
      debt_cylinders_48=txn.debt_cylinders_48,
      note=f"Reversal of {txn.id}",
      reversed_id=txn.id,
      is_reversed=True,
      group_id=collection_id,
    )
    session.add(reversal)
    reverse_source(
      session,
      source_type="customer_txn",
      source_id=txn.id,
      reversal_source_type="customer_txn",
      reversal_source_id=reversal.id,
      happened_at=reversal.happened_at,
      day=reversal.day,
      note=reversal.note,
    )
    txn.is_reversed = True
    session.add(txn)

  payload_data = payload.model_dump(exclude_unset=True)
  action_type = payload_data.get("action_type") or (
    "payment"
    if base.kind == "payment"
    else "payout"
    if base.kind == "payout"
    else "return"
  )
  debt_cash = payload_data.get("debt_cash") if payload_data.get("debt_cash") is not None else base.debt_cash
  debt_cylinders_12 = (
    payload_data.get("debt_cylinders_12")
    if payload_data.get("debt_cylinders_12") is not None
    else base.debt_cylinders_12
  )
  debt_cylinders_48 = (
    payload_data.get("debt_cylinders_48")
    if payload_data.get("debt_cylinders_48") is not None
    else base.debt_cylinders_48
  )
  happened_at = normalize_happened_at(payload_data.get("happened_at") or base.happened_at)
  group_id = collection_id
  new_txns: list[CustomerTransaction] = []

  if action_type in ("payment", "payout"):
    amount = payload_data.get("amount_money")
    amount = amount if amount is not None else base.paid
    if amount <= 0:
      raise HTTPException(status_code=400, detail="amount_must_be_positive")
    is_payout = action_type == "payout"
    txn = CustomerTransaction(
      customer_id=payload_data.get("customer_id") or base.customer_id,
      system_id=payload_data.get("system_id") or base.system_id,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="payout" if is_payout else "payment",
      gas_type=None,
      installed=0,
      received=0,
      total=0,
      paid=amount,
      debt_cash=debt_cash,
      debt_cylinders_12=debt_cylinders_12,
      debt_cylinders_48=debt_cylinders_48,
      note=payload_data.get("note") if payload_data.get("note") is not None else base.note,
      group_id=group_id,
      is_reversed=False,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    new_txns.append(txn)
  else:
    qty_12 = payload_data.get("qty_12kg")
    qty_48 = payload_data.get("qty_48kg")
    qty_12 = qty_12 if qty_12 is not None else sum(t.received for t in txns if t.gas_type == "12kg")
    qty_48 = qty_48 if qty_48 is not None else sum(t.received for t in txns if t.gas_type == "48kg")
    if qty_12 <= 0 and qty_48 <= 0:
      raise HTTPException(status_code=400, detail="return_quantity_required")
    if qty_12 > 0:
      txn = CustomerTransaction(
        customer_id=payload_data.get("customer_id") or base.customer_id,
        system_id=payload_data.get("system_id") or base.system_id,
        happened_at=happened_at,
        day=derive_day(happened_at),
        kind="return",
        gas_type="12kg",
        installed=0,
        received=qty_12,
        total=0,
        paid=0,
        debt_cash=debt_cash,
        debt_cylinders_12=debt_cylinders_12,
        debt_cylinders_48=debt_cylinders_48,
        note=payload_data.get("note") if payload_data.get("note") is not None else base.note,
        group_id=group_id,
        is_reversed=False,
      )
      session.add(txn)
      post_customer_transaction(session, txn)
      new_txns.append(txn)
    if qty_48 > 0:
      txn = CustomerTransaction(
        customer_id=payload_data.get("customer_id") or base.customer_id,
        system_id=payload_data.get("system_id") or base.system_id,
        happened_at=happened_at,
        day=derive_day(happened_at),
        kind="return",
        gas_type="48kg",
        installed=0,
        received=qty_48,
        total=0,
        paid=0,
        debt_cash=debt_cash,
        debt_cylinders_12=debt_cylinders_12,
        debt_cylinders_48=debt_cylinders_48,
        note=payload_data.get("note") if payload_data.get("note") is not None else base.note,
        group_id=group_id,
        is_reversed=False,
      )
      session.add(txn)
      post_customer_transaction(session, txn)
      new_txns.append(txn)

  session.commit()
  for txn in new_txns:
    session.refresh(txn)
  return _as_event(new_txns)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(collection_id: str, session: Session = Depends(get_session)) -> None:
  txns = session.exec(
    select(CustomerTransaction)
    .where(
      (CustomerTransaction.id == collection_id)
      | (CustomerTransaction.group_id == collection_id)
    )
    .where(CustomerTransaction.is_reversed == False)  # noqa: E712
  ).all()
  if not txns:
    return
  now = datetime.now(timezone.utc)
  for txn in txns:
    reversal = CustomerTransaction(
      customer_id=txn.customer_id,
      system_id=txn.system_id,
      happened_at=now,
      day=derive_day(now),
      kind=txn.kind,
      gas_type=txn.gas_type,
      installed=txn.installed,
      received=txn.received,
      total=txn.total,
      paid=txn.paid,
      debt_cash=txn.debt_cash,
      debt_cylinders_12=txn.debt_cylinders_12,
      debt_cylinders_48=txn.debt_cylinders_48,
      note=f"Reversal of {txn.id}",
      reversed_id=txn.id,
      is_reversed=True,
      group_id=collection_id,
    )
    session.add(reversal)
    reverse_source(
      session,
      source_type="customer_txn",
      source_id=txn.id,
      reversal_source_type="customer_txn",
      reversal_source_id=reversal.id,
      happened_at=reversal.happened_at,
      day=reversal.day,
      note=reversal.note,
    )
    txn.is_reversed = True
    session.add(txn)
  session.commit()
