from datetime import date, datetime, timedelta, timezone
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlmodel import Session, select

import logging

from app.models import InventoryDailySummary, InventoryDelta, InventoryRecalcQueue, InventoryVersion
from app.utils.locks import acquire_inventory_lock
from app.utils.time import business_date_end_utc, business_date_from_utc, business_date_start_utc, to_utc_naive


logger = logging.getLogger(__name__)


def _to_utc_naive(dt: datetime) -> datetime:
  """
  Normalize any datetime to naive UTC to avoid offset-naive vs offset-aware comparisons.
  If the datetime is timezone-aware, convert to UTC and strip tzinfo. If already naive, return as-is.
  """
  return to_utc_naive(dt)


def latest_inventory_version(session: Session, gas_type: str) -> Optional[InventoryVersion]:
  """
  Fetch the most recent InventoryVersion for a gas type, ordered by business time (effective_at) and
  creation time to guarantee deterministic pick when multiple writes land at the same instant.
  """
  return session.exec(
    select(InventoryVersion)
    .where(InventoryVersion.gas_type == gas_type)
    .order_by(InventoryVersion.effective_at.desc(), InventoryVersion.created_at.desc())
  ).first()


def _ordered_versions(session: Session, gas_type: str) -> Sequence[InventoryVersion]:
  return session.exec(
    select(InventoryVersion)
    .where(InventoryVersion.gas_type == gas_type)
    .order_by(InventoryVersion.effective_at, InventoryVersion.created_at)
  ).all()


def _recompute_chain(versions: list[InventoryVersion], deltas: dict[str, tuple[int, int]]) -> None:
  """
  Recompute cumulative counts for a gas type after inserting a backdated version.
  We keep each version's original delta (derived from the pre-change chain) so future
  states shift consistently from the new insertion point onward.
  """
  if len(versions) < 2:
    return
  full = versions[0].full_count
  empty = versions[0].empty_count
  for cur in versions[1:]:
    df, de = deltas[cur.id]
    full += df
    empty += de
    cur.full_count = full
    cur.empty_count = empty


def apply_inventory_delta(
  session: Session,
  *,
  gas_type: str,
  delta_full: int,
  delta_empty: int,
  reason: str,
  event_type: str,
  event_id: str,
  effective_at: datetime,
  allow_negative_full: bool = False,
  allow_negative_empty: bool = False,
) -> InventoryVersion:
  """
  Append a new InventoryVersion using the provided deltas. This enforces:
  - Inventory is already initialized for the gas type
  - Non-negative resulting counts (unless explicitly allowed)
  - Historical inserts are allowed: a backdated change will reflow all later versions.
  """
  effective_at_norm = _to_utc_naive(effective_at)
  versions = list(_ordered_versions(session, gas_type))
  if not versions:
    raise HTTPException(status_code=400, detail="inventory_not_initialized")

  # Capture original deltas per version to preserve event impact when reflowing
  base_deltas: dict[str, tuple[int, int]] = {}
  for prev, cur in zip(versions, versions[1:]):
    base_deltas[cur.id] = (cur.full_count - prev.full_count, cur.empty_count - prev.empty_count)

  # Find insertion point (latest version with effective_at <= target, stable by created_at)
  insert_idx = None
  for idx, v in enumerate(versions):
    if _to_utc_naive(v.effective_at) <= effective_at_norm:
      insert_idx = idx
    else:
      break
  if insert_idx is None:
    # No prior records; do not allow changes before the initial inventory baseline.
    raise HTTPException(
      status_code=400,
      detail="Order date is before initial inventory. Initialize inventory for that date or change the order date.",
    )

  base = versions[insert_idx]
  new_full = base.full_count + delta_full
  new_empty = base.empty_count + delta_empty
  if (new_full < 0 and not allow_negative_full) or (new_empty < 0 and not allow_negative_empty):
    raise HTTPException(status_code=400, detail="inventory_negative")

  now = datetime.now(timezone.utc)
  version = InventoryVersion(
    gas_type=gas_type,
    full_count=new_full,
    empty_count=new_empty,
    reason=reason,
    event_type=event_type,
    event_id=event_id,
    effective_at=effective_at_norm,
    created_at=now,
  )

  # Insert and reflow
  versions.insert(insert_idx + 1, version)
  base_deltas[version.id] = (delta_full, delta_empty)
  _recompute_chain(versions, base_deltas)
  for v in versions:
    session.add(v)
  return version


def get_inventory_warnings(session: Session) -> list[dict[str, object]]:
  """
  Scan inventory history for negative full counts and suggest a ghost refill
  on the first date a gas type went negative.
  """
  negatives = session.exec(
    select(InventoryVersion)
    .where(InventoryVersion.full_count < 0)
    .order_by(InventoryVersion.effective_at)
  ).all()
  first_by_gas: dict[str, InventoryVersion] = {}
  for version in negatives:
    if version.gas_type not in first_by_gas:
      first_by_gas[version.gas_type] = version

  warnings: list[dict[str, object]] = []
  for gas_type, version in first_by_gas.items():
    warnings.append(
      {
        "gas_type": gas_type,
        "date": version.effective_at.date().isoformat(),
        "suggested_refill_full": abs(version.full_count),
        "message": "ghost_refill_suggested",
      }
    )
  return warnings


def _date_range(start: date, end: date) -> list[date]:
  if end < start:
    return []
  days = (end - start).days
  return [start + timedelta(days=offset) for offset in range(days + 1)]


def _latest_summary_for_gas(
  session: Session, gas_type: str, up_to: Optional[date] = None
) -> Optional[InventoryDailySummary]:
  stmt = select(InventoryDailySummary).where(InventoryDailySummary.gas_type == gas_type)
  if up_to is not None:
    stmt = stmt.where(InventoryDailySummary.business_date <= up_to)
  return session.exec(stmt.order_by(InventoryDailySummary.business_date.desc())).first()


def latest_inventory_snapshot(session: Session) -> Optional[dict[str, object]]:
  today = business_date_from_utc(datetime.now(timezone.utc))
  summary_12 = _latest_summary_for_gas(session, "12kg", today)
  summary_48 = _latest_summary_for_gas(session, "48kg", today)
  if not summary_12 and not summary_48:
    return None
  full12 = summary_12.day_end_full if summary_12 else 0
  empty12 = summary_12.day_end_empty if summary_12 else 0
  full48 = summary_48.day_end_full if summary_48 else 0
  empty48 = summary_48.day_end_empty if summary_48 else 0
  date_candidates = [s.business_date for s in (summary_12, summary_48) if s]
  as_of = business_date_end_utc(max(date_candidates)) if date_candidates else datetime.now(timezone.utc)
  return {
    "as_of": as_of,
    "full12": full12,
    "empty12": empty12,
    "total12": full12 + empty12,
    "full48": full48,
    "empty48": empty48,
    "total48": full48 + empty48,
    "reason": None,
  }


def inventory_totals_at(session: Session, gas_type: str, effective_at: datetime) -> tuple[int, int]:
  effective_at_norm = _to_utc_naive(effective_at)
  business_date = business_date_from_utc(effective_at_norm)
  previous = session.exec(
    select(InventoryDailySummary)
    .where(InventoryDailySummary.gas_type == gas_type)
    .where(InventoryDailySummary.business_date < business_date)
    .order_by(InventoryDailySummary.business_date.desc())
  ).first()
  full = previous.day_end_full if previous else 0
  empty = previous.day_end_empty if previous else 0

  has_any = session.exec(
    select(InventoryDelta.id)
    .where(InventoryDelta.gas_type == gas_type)
    .limit(1)
  ).first()
  if not has_any and not previous:
    raise HTTPException(status_code=400, detail="inventory_not_initialized")

  day_start = business_date_start_utc(business_date)
  next_day = business_date_start_utc(business_date + timedelta(days=1))
  deltas = session.exec(
    select(InventoryDelta)
    .where(InventoryDelta.gas_type == gas_type)
    .where(InventoryDelta.effective_at >= day_start)
    .where(InventoryDelta.effective_at < next_day)
    .where(InventoryDelta.effective_at <= effective_at_norm)
    .order_by(InventoryDelta.effective_at, InventoryDelta.created_at, InventoryDelta.id)
  ).all()
  for delta in deltas:
    full += delta.delta_full
    empty += delta.delta_empty
  return full, empty


def inventory_totals_before_source(
  session: Session,
  *,
  gas_type: str,
  source_type: str,
  source_id: str,
) -> tuple[int, int]:
  has_any = session.exec(
    select(InventoryDelta.id)
    .where(InventoryDelta.gas_type == gas_type)
    .limit(1)
  ).first()
  if not has_any:
    raise HTTPException(status_code=400, detail="inventory_not_initialized")

  full = 0
  empty = 0
  deltas = session.exec(
    select(InventoryDelta)
    .where(InventoryDelta.gas_type == gas_type)
    .order_by(InventoryDelta.effective_at, InventoryDelta.created_at, InventoryDelta.id)
  ).all()
  for delta in deltas:
    if delta.source_type == source_type and delta.source_id == source_id:
      break
    full += delta.delta_full
    empty += delta.delta_empty
  return full, empty


def enqueue_recalc_job(session: Session, gas_type: str, start_business_date: date) -> InventoryRecalcQueue:
  now = datetime.now(timezone.utc)
  existing = session.exec(
    select(InventoryRecalcQueue)
    .where(InventoryRecalcQueue.gas_type == gas_type)
    .where(InventoryRecalcQueue.status == "pending")
    .order_by(InventoryRecalcQueue.created_at.desc())
  ).first()
  if existing:
    if start_business_date < existing.start_business_date:
      existing.start_business_date = start_business_date
      existing.updated_at = now
      session.add(existing)
    return existing

  job = InventoryRecalcQueue(
    gas_type=gas_type,
    start_business_date=start_business_date,
    status="pending",
    created_at=now,
    updated_at=now,
  )
  session.add(job)
  return job


def delete_inventory_deltas_for_source(
  session: Session,
  *,
  source_id: str,
  source_types: Optional[list[str]] = None,
) -> dict[str, date]:
  stmt = select(InventoryDelta).where(InventoryDelta.source_id == source_id)
  if source_types:
    stmt = stmt.where(InventoryDelta.source_type.in_(source_types))
  rows = session.exec(stmt).all()
  earliest: dict[str, date] = {}
  for row in rows:
    day = business_date_from_utc(row.effective_at)
    existing = earliest.get(row.gas_type)
    if existing is None or day < existing:
      earliest[row.gas_type] = day
    session.delete(row)
  return earliest


def recompute_daily_summaries(
  session: Session,
  gas_type: str,
  start_business_date: date,
  end_business_date: date,
  *,
  allow_negative: bool = False,
) -> None:
  acquire_inventory_lock(session, gas_type)
  if end_business_date < start_business_date:
    return
  previous = session.exec(
    select(InventoryDailySummary)
    .where(InventoryDailySummary.gas_type == gas_type)
    .where(InventoryDailySummary.business_date < start_business_date)
    .order_by(InventoryDailySummary.business_date.desc())
  ).first()
  running_full = previous.day_end_full if previous else 0
  running_empty = previous.day_end_empty if previous else 0

  range_start = business_date_start_utc(start_business_date)
  range_end = business_date_start_utc(end_business_date + timedelta(days=1))
  deltas = session.exec(
    select(InventoryDelta)
    .where(InventoryDelta.gas_type == gas_type)
    .where(InventoryDelta.effective_at >= range_start)
    .where(InventoryDelta.effective_at < range_end)
    .order_by(InventoryDelta.effective_at, InventoryDelta.created_at, InventoryDelta.id)
  ).all()

  deltas_by_date: dict[date, list[InventoryDelta]] = {}
  for delta in deltas:
    date_key = business_date_from_utc(delta.effective_at)
    deltas_by_date.setdefault(date_key, []).append(delta)

  for current_date in _date_range(start_business_date, end_business_date):
    day_start_full = running_full
    day_start_empty = running_empty
    for delta in deltas_by_date.get(current_date, []):
      running_full += delta.delta_full
      running_empty += delta.delta_empty
      if running_full < 0 or running_empty < 0:
        if allow_negative:
          logger.warning(
            "inventory_negative gas=%s date=%s full=%s empty=%s",
            gas_type,
            current_date,
            running_full,
            running_empty,
          )
        else:
          raise HTTPException(status_code=400, detail="inventory_negative")

    day_end_full = running_full
    day_end_empty = running_empty
    summary = session.exec(
      select(InventoryDailySummary)
      .where(InventoryDailySummary.gas_type == gas_type)
      .where(InventoryDailySummary.business_date == current_date)
    ).first()
    if summary:
      summary.day_start_full = day_start_full
      summary.day_start_empty = day_start_empty
      summary.day_delta_full = day_end_full - day_start_full
      summary.day_delta_empty = day_end_empty - day_start_empty
      summary.day_end_full = day_end_full
      summary.day_end_empty = day_end_empty
      summary.computed_at = datetime.now(timezone.utc)
      session.add(summary)
    else:
      session.add(
        InventoryDailySummary(
          business_date=current_date,
          gas_type=gas_type,
          day_start_full=day_start_full,
          day_start_empty=day_start_empty,
          day_delta_full=day_end_full - day_start_full,
          day_delta_empty=day_end_empty - day_start_empty,
          day_end_full=day_end_full,
          day_end_empty=day_end_empty,
          computed_at=datetime.now(timezone.utc),
        )
      )


def _insert_inventory_delta(
  session: Session,
  *,
  gas_type: str,
  delta_full: int,
  delta_empty: int,
  effective_at: datetime,
  source_type: str,
  source_id: Optional[str] = None,
  reason: Optional[str] = None,
  actor_id: Optional[str] = None,
) -> InventoryDelta:
  effective_at_norm = _to_utc_naive(effective_at)
  now = datetime.now(timezone.utc)
  delta = InventoryDelta(
    gas_type=gas_type,
    delta_full=delta_full,
    delta_empty=delta_empty,
    effective_at=effective_at_norm,
    source_type=source_type,
    source_id=source_id,
    reason=reason,
    created_at=now,
    created_by=actor_id,
  )
  session.add(delta)
  return delta


def add_inventory_delta(
  session: Session,
  *,
  gas_type: str,
  delta_full: int,
  delta_empty: int,
  effective_at: datetime,
  source_type: str,
  source_id: Optional[str] = None,
  reason: Optional[str] = None,
  actor_id: Optional[str] = None,
  allow_negative: bool = False,
) -> InventoryDelta:
  effective_at_norm = _to_utc_naive(effective_at)
  if source_type != "init":
    has_any = session.exec(
      select(InventoryDelta.id)
      .where(InventoryDelta.gas_type == gas_type)
      .limit(1)
    ).first()
    if not has_any:
      raise HTTPException(status_code=400, detail="inventory_not_initialized")

  acquire_inventory_lock(session, gas_type)
  delta = _insert_inventory_delta(
    session,
    gas_type=gas_type,
    delta_full=delta_full,
    delta_empty=delta_empty,
    effective_at=effective_at_norm,
    source_type=source_type,
    source_id=source_id,
    reason=reason,
    actor_id=actor_id,
  )

  start_business_date = business_date_from_utc(effective_at_norm)
  enqueue_recalc_job(session, gas_type, start_business_date)
  end_business_date = business_date_from_utc(datetime.now(timezone.utc))
  recompute_daily_summaries(
    session,
    gas_type,
    start_business_date,
    end_business_date,
    allow_negative=allow_negative,
  )
  return delta
