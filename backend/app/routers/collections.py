from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.config import DEFAULT_TENANT_ID
from app.db import get_session
from app.models import Customer, CustomerTransaction, System
from app.schemas import CollectionCreate, CollectionEvent, CollectionUpdate
from app.services.ledger import sum_customer_cylinders, sum_customer_money
from app.services.posting import derive_day, normalize_happened_at, post_customer_transaction, reverse_source
from app.utils.locks import acquire_customer_locks, acquire_inventory_locks

router = APIRouter(prefix="/collections", tags=["collections"])


def _new_group_id() -> str:
  return str(uuid4())


def _stable_txn_key(txn: CustomerTransaction) -> tuple:
  return (txn.happened_at, txn.created_at, txn.id)


def _current_customer_state(session: Session, *, customer_id: str) -> tuple[int, int, int]:
  return (
    sum_customer_money(session, customer_id=customer_id),
    sum_customer_cylinders(session, customer_id=customer_id, gas_type="12kg"),
    sum_customer_cylinders(session, customer_id=customer_id, gas_type="48kg"),
  )


def _collection_inventory_gas_types(
  *,
  action_type: str,
  qty_12kg: Optional[int] = None,
  qty_48kg: Optional[int] = None,
  txns: Optional[list[CustomerTransaction]] = None,
) -> list[str]:
  gas_types: set[str] = set()
  if action_type == "return":
    if (qty_12kg or 0) > 0:
      gas_types.add("12kg")
    if (qty_48kg or 0) > 0:
      gas_types.add("48kg")
  if txns:
    gas_types.update(txn.gas_type for txn in txns if txn.gas_type)
  return sorted(gas_types)


def _build_collection_transactions(
  session: Session,
  *,
  customer_id: str,
  system_id: Optional[str],
  action_type: str,
  happened_at,
  note: Optional[str],
  group_id: str,
  amount_money: Optional[int] = None,
  qty_12kg: Optional[int] = None,
  qty_48kg: Optional[int] = None,
  request_id: Optional[str] = None,
) -> list[CustomerTransaction]:
  current_money, current_cyl_12, current_cyl_48 = _current_customer_state(session, customer_id=customer_id)
  txns: list[CustomerTransaction] = []

  if action_type in ("payment", "payout"):
    amount = amount_money or 0
    if amount <= 0:
      raise HTTPException(status_code=400, detail="amount_must_be_positive")
    is_payout = action_type == "payout"
    next_money = current_money + amount if is_payout else current_money - amount
    txn = CustomerTransaction(
      tenant_id=DEFAULT_TENANT_ID,
      customer_id=customer_id,
      system_id=system_id,
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
      note=note,
      group_id=group_id,
      request_id=request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)
    return txns

  qty_12 = qty_12kg or 0
  qty_48 = qty_48kg or 0
  if qty_12 <= 0 and qty_48 <= 0:
    raise HTTPException(status_code=400, detail="return_quantity_required")

  if qty_12 > 0:
    next_cyl_12 = current_cyl_12 - qty_12
    txn = CustomerTransaction(
      tenant_id=DEFAULT_TENANT_ID,
      customer_id=customer_id,
      system_id=system_id,
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
      note=note,
      group_id=group_id,
      request_id=request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)
    current_cyl_12 = next_cyl_12
    request_id = None

  if qty_48 > 0:
    next_cyl_48 = current_cyl_48 - qty_48
    txn = CustomerTransaction(
      tenant_id=DEFAULT_TENANT_ID,
      customer_id=customer_id,
      system_id=system_id,
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
      note=note,
      group_id=group_id,
      request_id=request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  return txns


def _as_event(txns: list[CustomerTransaction]) -> CollectionEvent:
  if not txns:
    raise HTTPException(status_code=404, detail="Collection not found")
  base = min(txns, key=_stable_txn_key)
  after = max(txns, key=_stable_txn_key)
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
    debt_cash=after.debt_cash,
    debt_cylinders_12=after.debt_cylinders_12,
    debt_cylinders_48=after.debt_cylinders_48,
    system_id=base.system_id,
    created_at=base.created_at,
    effective_at=base.happened_at,
    note=base.note,
    is_deleted=txns[0].deleted_at is not None,
  )


@router.get("", response_model=list[CollectionEvent])
def list_collections(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  customer_id: Optional[str] = Query(default=None),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[CollectionEvent]:
  stmt = (
    select(CustomerTransaction)
    .where(CustomerTransaction.kind.in_(["payment", "payout", "return"]))
  )
  if not include_deleted:
    stmt = stmt.where(CustomerTransaction.deleted_at == None)  # noqa: E711
  if customer_id:
    stmt = stmt.where(CustomerTransaction.customer_id == customer_id)
  if before:
    try:
      cursor_dt = datetime.fromisoformat(before)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid before date format") from exc
    stmt = stmt.where(CustomerTransaction.happened_at < cursor_dt)
  stmt = stmt.order_by(
    CustomerTransaction.happened_at.desc(),
    CustomerTransaction.created_at.desc(),
    CustomerTransaction.id.desc(),
  ).limit(limit)
  rows = session.exec(stmt).all()
  groups: dict[str, list[CustomerTransaction]] = {}
  for row in rows:
    key = row.group_id or row.id
    groups.setdefault(key, []).append(row)
  return [_as_event(txns) for txns in groups.values()]


@router.post("", response_model=CollectionEvent, status_code=status.HTTP_201_CREATED)
def create_collection(payload: CollectionCreate, session: Session = Depends(get_session)) -> CollectionEvent:
  happened_at = normalize_happened_at(payload.happened_at)
  with session.begin():
    acquire_customer_locks(session, [payload.customer_id])
    acquire_inventory_locks(
      session,
      _collection_inventory_gas_types(
        action_type=payload.action_type,
        qty_12kg=payload.qty_12kg,
        qty_48kg=payload.qty_48kg,
      ),
    )
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
          .where(CustomerTransaction.deleted_at == None)  # noqa: E711
        ).all()
        return _as_event(txns or [existing])

    group_id = _new_group_id()
    txns = _build_collection_transactions(
      session,
      customer_id=payload.customer_id,
      system_id=payload.system_id,
      action_type=payload.action_type,
      happened_at=happened_at,
      note=payload.note,
      group_id=group_id,
      amount_money=payload.amount_money,
      qty_12kg=payload.qty_12kg,
      qty_48kg=payload.qty_48kg,
      request_id=payload.request_id,
    )
  for txn in txns:
    session.refresh(txn)
  return _as_event(txns)


@router.put("/{collection_id}", response_model=CollectionEvent)
def update_collection(collection_id: str, payload: CollectionUpdate, session: Session = Depends(get_session)) -> CollectionEvent:
  payload_data = payload.model_dump(exclude_unset=True)
  with session.begin():
    txns = session.exec(
      select(CustomerTransaction)
      .where(
        (CustomerTransaction.id == collection_id)
        | (CustomerTransaction.group_id == collection_id)
      )
      .where(CustomerTransaction.deleted_at == None)  # noqa: E711
    ).all()
    if not txns:
      raise HTTPException(status_code=404, detail="Collection not found")
    base = txns[0]
    action_type = payload_data.get("action_type") or (
      "payment"
      if base.kind == "payment"
      else "payout"
      if base.kind == "payout"
      else "return"
    )
    amount_money = payload_data.get("amount_money")
    qty_12kg = payload_data.get("qty_12kg")
    qty_48kg = payload_data.get("qty_48kg")
    if amount_money is None:
      amount_money = sum(t.paid for t in txns if t.kind in {"payment", "payout"}) or None
    if qty_12kg is None:
      qty_12kg = sum(t.received for t in txns if t.gas_type == "12kg")
    if qty_48kg is None:
      qty_48kg = sum(t.received for t in txns if t.gas_type == "48kg")
    acquire_customer_locks(session, [base.customer_id])
    acquire_inventory_locks(
      session,
      _collection_inventory_gas_types(
        action_type=action_type,
        qty_12kg=qty_12kg,
        qty_48kg=qty_48kg,
        txns=txns,
      ),
    )
    happened_at_raw = payload_data["happened_at"] if payload_data.get("happened_at") is not None else base.happened_at
    happened_at = normalize_happened_at(happened_at_raw)
    note = payload_data.get("note") if payload_data.get("note") is not None else base.note

    for txn in txns:
      reversal_happened_at = txn.happened_at
      reversal_day = txn.day
      reversal = CustomerTransaction(
        tenant_id=DEFAULT_TENANT_ID,
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
        deleted_at=datetime.now(timezone.utc),
        reversal_source_id=txn.id,
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
      txn.deleted_at = datetime.now(timezone.utc)
      session.add(txn)

    session.flush()
    group_id = collection_id
    new_txns = _build_collection_transactions(
      session,
      customer_id=base.customer_id,
      system_id=base.system_id,
      action_type=action_type,
      happened_at=happened_at,
      note=note,
      group_id=group_id,
      amount_money=amount_money,
      qty_12kg=qty_12kg,
      qty_48kg=qty_48kg,
    )
  for txn in new_txns:
    session.refresh(txn)
  return _as_event(new_txns)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(collection_id: str, session: Session = Depends(get_session)) -> None:
  with session.begin():
    txns = session.exec(
      select(CustomerTransaction)
      .where(
        (CustomerTransaction.id == collection_id)
        | (CustomerTransaction.group_id == collection_id)
      )
      .where(CustomerTransaction.deleted_at == None)  # noqa: E711
    ).all()
    if not txns:
      return
    acquire_customer_locks(session, [txns[0].customer_id])
    acquire_inventory_locks(
      session,
      _collection_inventory_gas_types(action_type="return", txns=txns),
    )
    for txn in txns:
      reversal_happened_at = txn.happened_at
      reversal_day = txn.day
      reversal = CustomerTransaction(
        tenant_id=DEFAULT_TENANT_ID,
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
        deleted_at=datetime.now(timezone.utc),
        reversal_source_id=txn.id,
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
      txn.deleted_at = datetime.now(timezone.utc)
      session.add(txn)

