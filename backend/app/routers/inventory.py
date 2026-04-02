from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import CompanyTransaction, InventoryAdjustment
from app.schemas import (
  InventoryInitCreate,
  InventoryAdjustCreate,
  InventoryAdjustUpdate,
  InventoryAdjustmentRow,
  InventoryRefillCreate,
  InventoryRefillDetails,
  InventoryRefillSummary,
  InventoryRefillUpdate,
  InventorySnapshot,
)
from app.services.ledger import boundary_from_entries, snapshot_company_debts, sum_inventory
from app.services.posting import derive_day, normalize_happened_at, post_company_transaction, post_inventory_adjustment, reverse_source
from app.services.inventory_helpers import parse_datetime, snapshot_at, time_of_day, reject_new_shells_for_refill, validate_inventory_adjustment_reason
from app.utils.locks import acquire_company_lock, acquire_inventory_locks

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/latest", response_model=InventorySnapshot)
def get_latest_inventory(session: Session = Depends(get_session)) -> InventorySnapshot:
  now = datetime.now(timezone.utc)
  return snapshot_at(session, now)


@router.get("/snapshot", response_model=InventorySnapshot | None)
def get_inventory_snapshot(
  date: Optional[str] = None,
  time: Optional[str] = None,
  time_of_day: Optional[str] = Query(default=None),
  at: Optional[str] = None,
  session: Session = Depends(get_session),
) -> InventorySnapshot | None:
  parsed = parse_datetime(date_str=date, time_str=time, time_of_day=time_of_day, at=at)
  if parsed is None:
    return None
  return snapshot_at(session, parsed)


@router.post("/init", response_model=InventorySnapshot)
def init_inventory(payload: InventoryInitCreate, session: Session = Depends(get_session)) -> InventorySnapshot:
  date_str = payload.date
  full12 = payload.full12
  empty12 = payload.empty12
  full48 = payload.full48
  empty48 = payload.empty48
  reason = payload.reason
  happened_at = parse_datetime(date_str=date_str, time_str="00:00", time_of_day=None, at=None) or datetime.now(timezone.utc)

  with session.begin():
    acquire_company_lock(session)
    acquire_inventory_locks(session, ["12kg", "48kg"])
    current = sum_inventory(session, up_to=happened_at)

    delta_full12 = full12 - current["full12"]
    delta_empty12 = empty12 - current["empty12"]
    delta_full48 = full48 - current["full48"]
    delta_empty48 = empty48 - current["empty48"]

    for gas, delta_full, delta_empty in (
      ("12kg", delta_full12, delta_empty12),
      ("48kg", delta_full48, delta_empty48),
    ):
      if delta_full == 0 and delta_empty == 0:
        continue
      adj = InventoryAdjustment(
        gas_type=gas,
        delta_full=delta_full,
        delta_empty=delta_empty,
        note=reason,
        happened_at=happened_at,
        day=derive_day(happened_at),
        is_reversed=False,
      )
      session.add(adj)
      post_inventory_adjustment(session, adj)
  return snapshot_at(session, happened_at, reason)


@router.post("/adjust", response_model=InventorySnapshot)
def create_inventory_adjust(payload: InventoryAdjustCreate, session: Session = Depends(get_session)) -> InventorySnapshot:
  validate_inventory_adjustment_reason(payload.reason, delta_full=payload.delta_full, delta_empty=payload.delta_empty)
  happened_at = normalize_happened_at(payload.happened_at)
  with session.begin():
    acquire_company_lock(session)
    acquire_inventory_locks(session, [payload.gas_type])
    if payload.request_id:
      existing = session.exec(
        select(InventoryAdjustment).where(InventoryAdjustment.request_id == payload.request_id)
      ).first()
      if existing:
        return snapshot_at(session, existing.happened_at, existing.note)

    adj = InventoryAdjustment(
      group_id=payload.group_id,
      gas_type=payload.gas_type,
      delta_full=payload.delta_full,
      delta_empty=payload.delta_empty,
      note=payload.note or payload.reason,
      happened_at=happened_at,
      day=derive_day(happened_at),
      request_id=payload.request_id,
      is_reversed=False,
    )
    session.add(adj)
    post_inventory_adjustment(session, adj)
  return snapshot_at(session, happened_at, adj.note)


@router.get("/adjustments", response_model=list[InventoryAdjustmentRow])
def list_inventory_adjustments(
  date: Optional[str] = None,
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[InventoryAdjustmentRow]:
  stmt = select(InventoryAdjustment)
  if date:
    try:
      day = datetime.fromisoformat(date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
    stmt = stmt.where(InventoryAdjustment.day == day)
  if not include_deleted:
    stmt = stmt.where(InventoryAdjustment.is_reversed == False)  # noqa: E712
  if before:
    try:
      cursor_dt = datetime.fromisoformat(before)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid before date format") from exc
    stmt = stmt.where(InventoryAdjustment.happened_at < cursor_dt)
  stmt = stmt.order_by(InventoryAdjustment.happened_at.desc()).limit(limit)
  rows = session.exec(stmt).all()
  return [
    InventoryAdjustmentRow(
      id=row.id,
      group_id=row.group_id,
      gas_type=row.gas_type,
      delta_full=row.delta_full,
      delta_empty=row.delta_empty,
      reason=row.note,
      effective_at=row.happened_at,
      created_at=row.created_at,
      is_deleted=row.is_reversed,
    )
    for row in rows
  ]


@router.put("/adjust/{adjust_id}", response_model=InventoryAdjustmentRow)
def update_inventory_adjustment(
  adjust_id: str,
  payload: InventoryAdjustUpdate,
  session: Session = Depends(get_session),
) -> InventoryAdjustmentRow:
  with session.begin():
    existing = session.get(InventoryAdjustment, adjust_id)
    if not existing or existing.is_reversed:
      raise HTTPException(status_code=404, detail="Adjustment not found")
    acquire_company_lock(session)
    acquire_inventory_locks(session, [existing.gas_type])

    reversal_happened_at = existing.happened_at
    reversal_day = existing.day
    reversal = InventoryAdjustment(
      group_id=existing.group_id,
      gas_type=existing.gas_type,
      delta_full=existing.delta_full,
      delta_empty=existing.delta_empty,
      note=f"Reversal of {existing.id}",
      happened_at=reversal_happened_at,
      day=reversal_day,
      reversed_id=existing.id,
      is_reversed=True,
    )
    session.add(reversal)
    reverse_source(
      session,
      source_type="inventory_adjust",
      source_id=existing.id,
      reversal_source_type="inventory_adjust",
      reversal_source_id=reversal.id,
      happened_at=reversal.happened_at,
      day=reversal.day,
      note=reversal.note,
    )
    existing.is_reversed = True
    session.add(existing)

    data = payload.model_dump(exclude_unset=True)
    new_full = data.get("delta_full", existing.delta_full)
    new_empty = data.get("delta_empty", existing.delta_empty)
    next_reason = data.get("reason") if "reason" in data else existing.note
    validate_inventory_adjustment_reason(next_reason, delta_full=new_full, delta_empty=new_empty)
    new_note = data.get("note")
    if new_note is None:
      new_note = next_reason
    new_adj = InventoryAdjustment(
      group_id=existing.group_id,
      gas_type=existing.gas_type,
      delta_full=new_full,
      delta_empty=new_empty,
      note=new_note,
      happened_at=reversal_happened_at,
      day=reversal_day,
      reversed_id=existing.id,
      is_reversed=False,
    )
    session.add(new_adj)
    post_inventory_adjustment(session, new_adj)
  session.refresh(new_adj)
  return InventoryAdjustmentRow(
    id=new_adj.id,
    group_id=new_adj.group_id,
    gas_type=new_adj.gas_type,
    delta_full=new_adj.delta_full,
    delta_empty=new_adj.delta_empty,
    reason=new_adj.note,
    effective_at=new_adj.happened_at,
    created_at=new_adj.created_at,
    is_deleted=False,
  )


@router.delete("/adjust/{adjust_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_adjustment(adjust_id: str, session: Session = Depends(get_session)) -> None:
  with session.begin():
    existing = session.get(InventoryAdjustment, adjust_id)
    if not existing or existing.is_reversed:
      return
    acquire_company_lock(session)
    acquire_inventory_locks(session, [existing.gas_type])
    reversal_happened_at = existing.happened_at
    reversal_day = existing.day
    reversal = InventoryAdjustment(
      group_id=existing.group_id,
      gas_type=existing.gas_type,
      delta_full=existing.delta_full,
      delta_empty=existing.delta_empty,
      note=f"Reversal of {existing.id}",
      happened_at=reversal_happened_at,
      day=reversal_day,
      reversed_id=existing.id,
      is_reversed=True,
    )
    session.add(reversal)
    reverse_source(
      session,
      source_type="inventory_adjust",
      source_id=existing.id,
      reversal_source_type="inventory_adjust",
      reversal_source_id=reversal.id,
      happened_at=reversal.happened_at,
      day=reversal.day,
      note=reversal.note,
    )
    existing.is_reversed = True
    session.add(existing)


@router.post("/refill", response_model=InventorySnapshot)
def create_refill(payload: InventoryRefillCreate, session: Session = Depends(get_session)) -> InventorySnapshot:
  reject_new_shells_for_refill(payload.new12, payload.new48)
  happened_at = normalize_happened_at(payload.happened_at)
  with session.begin():
    acquire_company_lock(session)
    acquire_inventory_locks(session, ["12kg", "48kg"])
    if payload.request_id:
      existing = session.exec(
        select(CompanyTransaction)
        .where(CompanyTransaction.request_id == payload.request_id)
        .where(CompanyTransaction.kind == "refill")
      ).first()
      if existing:
        return snapshot_at(session, existing.happened_at, existing.note)

    txn = CompanyTransaction(
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="refill",
      buy12=payload.buy12,
      return12=payload.return12,
      buy48=payload.buy48,
      return48=payload.return48,
      new12=0,
      new48=0,
      total=payload.total_cost,
      paid=payload.paid_now,
      debt_cash=0,
      debt_cylinders_12=0,
      debt_cylinders_48=0,
      note=payload.note,
      request_id=payload.request_id,
      is_reversed=False,
    )
    session.add(txn)
    entries = post_company_transaction(session, txn)
    boundary = boundary_from_entries(entries)
    snapshot = snapshot_company_debts(session, up_to=txn.happened_at, boundary=boundary)
    txn.debt_cash = snapshot["debt_cash"]
    txn.debt_cylinders_12 = snapshot["debt_cylinders_12"]
    txn.debt_cylinders_48 = snapshot["debt_cylinders_48"]
  return snapshot_at(session, happened_at, payload.note)


@router.get("/refills", response_model=list[InventoryRefillSummary])
def list_refills(
  before: Optional[str] = Query(default=None),
  limit: int = Query(default=50, le=200),
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[InventoryRefillSummary]:
  stmt = select(CompanyTransaction).where(CompanyTransaction.kind == "refill")
  if not include_deleted:
    stmt = stmt.where(CompanyTransaction.is_reversed == False)  # noqa: E712
  if before:
    try:
      cursor_dt = datetime.fromisoformat(before)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid before date format") from exc
    stmt = stmt.where(CompanyTransaction.happened_at < cursor_dt)
  stmt = stmt.order_by(CompanyTransaction.happened_at.desc()).limit(limit)
  rows = session.exec(stmt).all()
  return [
    InventoryRefillSummary(
      refill_id=row.id,
      date=row.day.isoformat(),
      time_of_day=time_of_day(row.happened_at),
      effective_at=row.happened_at,
      buy12=row.buy12,
      return12=row.return12,
      buy48=row.buy48,
      return48=row.return48,
      new12=row.new12,
      new48=row.new48,
      debt_cash=row.debt_cash,
      debt_cylinders_12=row.debt_cylinders_12,
      debt_cylinders_48=row.debt_cylinders_48,
      is_deleted=row.is_reversed,
      deleted_at=None,
    )
    for row in rows
  ]


@router.get("/refills/{refill_id}", response_model=InventoryRefillDetails)
def get_refill_details(refill_id: str, session: Session = Depends(get_session)) -> InventoryRefillDetails:
  row = session.get(CompanyTransaction, refill_id)
  if not row or row.is_reversed or row.kind != "refill":
    raise HTTPException(status_code=404, detail="Refill not found")
  return InventoryRefillDetails(
    refill_id=row.id,
    business_date=row.day.isoformat(),
    time_of_day=time_of_day(row.happened_at),
    effective_at=row.happened_at,
    buy12=row.buy12,
    return12=row.return12,
    buy48=row.buy48,
    return48=row.return48,
    total_cost=row.total,
    paid_now=row.paid,
    new12=row.new12,
    new48=row.new48,
    debt_cash=row.debt_cash,
    debt_cylinders_12=row.debt_cylinders_12,
    debt_cylinders_48=row.debt_cylinders_48,
    notes=row.note,
    is_deleted=row.is_reversed,
    deleted_at=None,
  )


@router.put("/refills/{refill_id}", response_model=InventoryRefillDetails)
def update_refill(refill_id: str, payload: InventoryRefillUpdate, session: Session = Depends(get_session)) -> InventoryRefillDetails:
  reject_new_shells_for_refill(payload.new12, payload.new48)
  with session.begin():
    existing = session.get(CompanyTransaction, refill_id)
    if not existing or existing.is_reversed or existing.kind != "refill":
      raise HTTPException(status_code=404, detail="Refill not found")
    acquire_company_lock(session)
    acquire_inventory_locks(session, ["12kg", "48kg"])

    reversal_happened_at = existing.happened_at
    reversal_day = existing.day
    reversal = CompanyTransaction(
      happened_at=reversal_happened_at,
      day=reversal_day,
      kind=existing.kind,
      buy12=existing.buy12,
      return12=existing.return12,
      buy48=existing.buy48,
      return48=existing.return48,
      new12=existing.new12,
      new48=existing.new48,
      total=existing.total,
      paid=existing.paid,
      debt_cash=existing.debt_cash,
      debt_cylinders_12=existing.debt_cylinders_12,
      debt_cylinders_48=existing.debt_cylinders_48,
      note=f"Reversal of {existing.id}",
      reversed_id=existing.id,
      is_reversed=True,
    )
    session.add(reversal)
    reverse_source(
      session,
      source_type="company_txn",
      source_id=existing.id,
      reversal_source_type="company_txn",
      reversal_source_id=reversal.id,
      happened_at=reversal.happened_at,
      day=reversal.day,
      note=reversal.note,
    )
    existing.is_reversed = True
    session.add(existing)

    new_txn = CompanyTransaction(
      happened_at=reversal_happened_at,
      day=reversal_day,
      kind="refill",
      buy12=payload.buy12,
      return12=payload.return12,
      buy48=payload.buy48,
      return48=payload.return48,
      new12=0,
      new48=0,
      total=payload.total_cost,
      paid=payload.paid_now,
      debt_cash=0,
      debt_cylinders_12=0,
      debt_cylinders_48=0,
      note=payload.note,
      reversed_id=existing.id,
      is_reversed=False,
    )
    session.add(new_txn)
    entries = post_company_transaction(session, new_txn)
    boundary = boundary_from_entries(entries)
    snapshot = snapshot_company_debts(session, up_to=new_txn.happened_at, boundary=boundary)
    new_txn.debt_cash = snapshot["debt_cash"]
    new_txn.debt_cylinders_12 = snapshot["debt_cylinders_12"]
    new_txn.debt_cylinders_48 = snapshot["debt_cylinders_48"]
  session.refresh(new_txn)
  return InventoryRefillDetails(
    refill_id=new_txn.id,
    business_date=new_txn.day.isoformat(),
    time_of_day=time_of_day(new_txn.happened_at),
    effective_at=new_txn.happened_at,
    buy12=new_txn.buy12,
    return12=new_txn.return12,
    buy48=new_txn.buy48,
    return48=new_txn.return48,
    total_cost=new_txn.total,
    paid_now=new_txn.paid,
    new12=new_txn.new12,
    new48=new_txn.new48,
    debt_cash=new_txn.debt_cash,
    debt_cylinders_12=new_txn.debt_cylinders_12,
    debt_cylinders_48=new_txn.debt_cylinders_48,
    notes=new_txn.note,
    is_deleted=False,
    deleted_at=None,
  )


@router.delete("/refills/{refill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_refill(refill_id: str, session: Session = Depends(get_session)) -> None:
  with session.begin():
    existing = session.get(CompanyTransaction, refill_id)
    if not existing or existing.is_reversed or existing.kind != "refill":
      return
    acquire_company_lock(session)
    acquire_inventory_locks(session, ["12kg", "48kg"])
    reversal_happened_at = existing.happened_at
    reversal_day = existing.day
    reversal = CompanyTransaction(
      happened_at=reversal_happened_at,
      day=reversal_day,
      kind=existing.kind,
      buy12=existing.buy12,
      return12=existing.return12,
      buy48=existing.buy48,
      return48=existing.return48,
      new12=existing.new12,
      new48=existing.new48,
      total=existing.total,
      paid=existing.paid,
      debt_cash=existing.debt_cash,
      debt_cylinders_12=existing.debt_cylinders_12,
      debt_cylinders_48=existing.debt_cylinders_48,
      note=f"Reversal of {existing.id}",
      reversed_id=existing.id,
      is_reversed=True,
    )
    session.add(reversal)
    reverse_source(
      session,
      source_type="company_txn",
      source_id=existing.id,
      reversal_source_type="company_txn",
      reversal_source_id=reversal.id,
      happened_at=reversal.happened_at,
      day=reversal.day,
      note=reversal.note,
    )
    existing.is_reversed = True
    session.add(existing)
