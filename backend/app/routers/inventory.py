from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import CompanyTransaction, InventoryAdjustment
from app.schemas import (
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
from app.utils.time import business_date_start_utc

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _parse_datetime(
  *,
  date_str: Optional[str],
  time_str: Optional[str] = None,
  time_of_day: Optional[str] = None,
  at: Optional[str] = None,
) -> Optional[datetime]:
  if at:
    try:
      value = datetime.fromisoformat(at)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid datetime format") from exc
    if value.tzinfo is None:
      return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
  if not date_str:
    return None
  try:
    day = datetime.fromisoformat(date_str).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  base = business_date_start_utc(day)
  if time_str:
    try:
      parsed = datetime.strptime(time_str, "%H:%M").time()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid time format") from exc
    base = base + timedelta(hours=parsed.hour, minutes=parsed.minute)
  elif time_of_day == "morning":
    base = base + timedelta(hours=9)
  elif time_of_day == "evening":
    base = base + timedelta(hours=18)
  else:
    base = base + timedelta(hours=12)
  return base.replace(tzinfo=timezone.utc)


def _snapshot_at(session: Session, at: datetime, reason: Optional[str] = None) -> InventorySnapshot:
  totals = sum_inventory(session, up_to=at)
  return InventorySnapshot(
    as_of=at,
    full12=totals["full12"],
    empty12=totals["empty12"],
    total12=totals["full12"] + totals["empty12"],
    full48=totals["full48"],
    empty48=totals["empty48"],
    total48=totals["full48"] + totals["empty48"],
    reason=reason,
  )


def _time_of_day(value: datetime) -> str:
  return "morning" if value.hour < 12 else "evening"


def _reject_new_shells_for_refill(new12: int, new48: int) -> None:
  if new12 != 0 or new48 != 0:
    raise HTTPException(status_code=422, detail="new_shells_not_allowed_for_refill")


def _validate_inventory_adjustment_reason(reason: Optional[str], *, delta_full: int, delta_empty: int) -> None:
  if not reason:
    return
  if reason in {"shrinkage", "damage"} and (delta_full > 0 or delta_empty > 0):
    raise HTTPException(status_code=422, detail="adjustment_reason_disallows_positive_delta")


@router.get("/latest", response_model=InventorySnapshot)
def get_latest_inventory(session: Session = Depends(get_session)) -> InventorySnapshot:
  now = datetime.now(timezone.utc)
  return _snapshot_at(session, now)


@router.get("/snapshot", response_model=InventorySnapshot | None)
def get_inventory_snapshot(
  date: Optional[str] = None,
  time: Optional[str] = None,
  time_of_day: Optional[str] = Query(default=None),
  at: Optional[str] = None,
  session: Session = Depends(get_session),
) -> InventorySnapshot | None:
  parsed = _parse_datetime(date_str=date, time_str=time, time_of_day=time_of_day, at=at)
  if parsed is None:
    return None
  return _snapshot_at(session, parsed)


@router.post("/init", response_model=InventorySnapshot)
def init_inventory(payload: dict, session: Session = Depends(get_session)) -> InventorySnapshot:
  date_str = payload.get("date")
  full12 = int(payload.get("full12", 0))
  empty12 = int(payload.get("empty12", 0))
  full48 = int(payload.get("full48", 0))
  empty48 = int(payload.get("empty48", 0))
  reason = payload.get("reason")

  happened_at = _parse_datetime(date_str=date_str, time_str="00:00", time_of_day=None, at=None) or datetime.now(timezone.utc)
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

  session.commit()
  return _snapshot_at(session, happened_at, reason)


@router.post("/adjust", response_model=InventorySnapshot)
def create_inventory_adjust(payload: InventoryAdjustCreate, session: Session = Depends(get_session)) -> InventorySnapshot:
  if payload.request_id:
    existing = session.exec(
      select(InventoryAdjustment).where(InventoryAdjustment.request_id == payload.request_id)
    ).first()
    if existing:
      return _snapshot_at(session, existing.happened_at, existing.note)

  _validate_inventory_adjustment_reason(payload.reason, delta_full=payload.delta_full, delta_empty=payload.delta_empty)
  happened_at = normalize_happened_at(payload.happened_at)
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
  session.commit()
  return _snapshot_at(session, happened_at, adj.note)


@router.get("/adjustments", response_model=list[InventoryAdjustmentRow])
def list_inventory_adjustments(
  date: str,
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[InventoryAdjustmentRow]:
  try:
    day = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc
  stmt = select(InventoryAdjustment).where(InventoryAdjustment.day == day)
  if not include_deleted:
    stmt = stmt.where(InventoryAdjustment.is_reversed == False)  # noqa: E712
  rows = session.exec(stmt.order_by(InventoryAdjustment.happened_at.desc())).all()
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
  existing = session.get(InventoryAdjustment, adjust_id)
  if not existing or existing.is_reversed:
    raise HTTPException(status_code=404, detail="Adjustment not found")

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
  _validate_inventory_adjustment_reason(next_reason, delta_full=new_full, delta_empty=new_empty)
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
    is_reversed=False,
  )
  session.add(new_adj)
  post_inventory_adjustment(session, new_adj)
  session.commit()
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
  existing = session.get(InventoryAdjustment, adjust_id)
  if not existing or existing.is_reversed:
    return
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
  session.commit()


@router.post("/refill", response_model=InventorySnapshot)
def create_refill(payload: InventoryRefillCreate, session: Session = Depends(get_session)) -> InventorySnapshot:
  if payload.request_id:
    existing = session.exec(
      select(CompanyTransaction)
      .where(CompanyTransaction.request_id == payload.request_id)
      .where(CompanyTransaction.kind == "refill")
    ).first()
    if existing:
      return _snapshot_at(session, existing.happened_at, existing.note)

  _reject_new_shells_for_refill(payload.new12, payload.new48)
  happened_at = normalize_happened_at(payload.happened_at)
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
  session.commit()
  return _snapshot_at(session, happened_at, payload.note)


@router.get("/refills", response_model=list[InventoryRefillSummary])
def list_refills(
  include_deleted: bool = Query(default=False, alias="include_deleted"),
  session: Session = Depends(get_session),
) -> list[InventoryRefillSummary]:
  stmt = select(CompanyTransaction).where(CompanyTransaction.kind == "refill")
  if not include_deleted:
    stmt = stmt.where(CompanyTransaction.is_reversed == False)  # noqa: E712
  rows = session.exec(stmt.order_by(CompanyTransaction.happened_at.desc())).all()
  return [
    InventoryRefillSummary(
      refill_id=row.id,
      date=row.day.isoformat(),
      time_of_day=_time_of_day(row.happened_at),
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
    time_of_day=_time_of_day(row.happened_at),
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
  existing = session.get(CompanyTransaction, refill_id)
  if not existing or existing.is_reversed or existing.kind != "refill":
    raise HTTPException(status_code=404, detail="Refill not found")

  _reject_new_shells_for_refill(payload.new12, payload.new48)
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
    is_reversed=False,
  )
  session.add(new_txn)
  entries = post_company_transaction(session, new_txn)
  boundary = boundary_from_entries(entries)
  snapshot = snapshot_company_debts(session, up_to=new_txn.happened_at, boundary=boundary)
  new_txn.debt_cash = snapshot["debt_cash"]
  new_txn.debt_cylinders_12 = snapshot["debt_cylinders_12"]
  new_txn.debt_cylinders_48 = snapshot["debt_cylinders_48"]
  session.commit()
  session.refresh(new_txn)
  return InventoryRefillDetails(
    refill_id=new_txn.id,
    business_date=new_txn.day.isoformat(),
    time_of_day=_time_of_day(new_txn.happened_at),
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
  existing = session.get(CompanyTransaction, refill_id)
  if not existing or existing.is_reversed or existing.kind != "refill":
    return
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
  session.commit()

