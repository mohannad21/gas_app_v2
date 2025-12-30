from datetime import datetime, timedelta, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.auth import get_optional_user
from app.config import get_settings
from app.db import get_session
from app.events import add_activity
from app.models import InventoryDailySummary, InventoryDelta, PriceSetting, RefillEvent
from app.schemas import (
  InventoryAdjustCreate,
  InventoryDeltaListResponse,
  InventoryDeltaRow,
  InventoryDayEvent,
  InventoryDayGasSummary,
  InventoryDayResponse,
  InventoryInit,
  InventoryRefillCreate,
  InventoryRefillDetails,
  InventoryRefillSummary,
  InventoryRefillUpdate,
  InventorySnapshot,
)
from app.services.cash import add_cash_delta, delete_cash_deltas_for_source, recompute_cash_summaries
from app.services.company import add_company_delta, delete_company_deltas_for_source, recompute_company_summaries
from app.services.inventory import (
  add_inventory_delta,
  delete_inventory_deltas_for_source,
  enqueue_recalc_job,
  inventory_totals_at,
  inventory_totals_before_source,
  latest_inventory_snapshot,
  recompute_daily_summaries,
)
from app.utils.time import (
  business_date_from_utc,
  business_date_start_utc,
  business_local_datetime_from_utc,
  effective_business_tz_name,
  to_utc_naive,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _as_utc(dt: datetime) -> datetime:
  return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _allow_negative_for_user(user_id: Optional[str]) -> bool:
  if not user_id:
    return False
  settings = get_settings()
  raw_ids = settings.allow_negative_admin_ids
  if not raw_ids:
    return False
  allowed = {item.strip() for item in raw_ids.split(",") if item.strip()}
  return user_id in allowed


def latest_snapshot(session: Session) -> Optional[InventorySnapshot]:
  data = latest_inventory_snapshot(session)
  if not data:
    return None
  return InventorySnapshot(**data)


def resolve_buy_price(session: Session, gas_type: str, effective_at: datetime) -> Optional[float]:
  stmt = (
    select(PriceSetting)
    .where(PriceSetting.gas_type == gas_type)
    .where(PriceSetting.customer_type == "private")
    .where(PriceSetting.buying_price.is_not(None))
    .where(PriceSetting.effective_from <= effective_at)
    .order_by(PriceSetting.effective_from.desc())
  )
  setting = session.exec(stmt).first()
  if not setting:
    stmt = (
      select(PriceSetting)
      .where(PriceSetting.gas_type == gas_type)
      .where(PriceSetting.customer_type == "any")
      .where(PriceSetting.buying_price.is_not(None))
      .where(PriceSetting.effective_from <= effective_at)
      .order_by(PriceSetting.effective_from.desc())
    )
    setting = session.exec(stmt).first()
  return setting.buying_price if setting else None

def snapshot_at(session: Session, boundary: datetime) -> Optional[InventorySnapshot]:
  has_any = False
  try:
    full12, empty12 = inventory_totals_at(session, "12kg", boundary)
    has_any = True
  except HTTPException:
    full12, empty12 = 0, 0
  try:
    full48, empty48 = inventory_totals_at(session, "48kg", boundary)
    has_any = True
  except HTTPException:
    full48, empty48 = 0, 0
  if not has_any:
    return None
  return InventorySnapshot(
    as_of=boundary,
    full12=full12,
    empty12=empty12,
    total12=full12 + empty12,
    full48=full48,
    empty48=empty48,
    total48=full48 + empty48,
    reason=None,
  )


@router.get("/latest", response_model=Optional[InventorySnapshot])
def get_latest_inventory(session: Session = Depends(get_session)) -> Optional[InventorySnapshot]:
  return latest_snapshot(session)


@router.get("/snapshot", response_model=Optional[InventorySnapshot])
def get_inventory_snapshot(
  date: Optional[str] = None,
  time: Optional[str] = None,
  time_of_day: Optional[Literal["morning", "evening"]] = None,
  at: Optional[str] = None,
  session: Session = Depends(get_session),
) -> Optional[InventorySnapshot]:
  if at:
    try:
      boundary = to_utc_naive(datetime.fromisoformat(at))
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid at format") from exc
  else:
    if not date:
      raise HTTPException(status_code=400, detail="Missing date")
    try:
      day = datetime.fromisoformat(date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc

    if time:
      try:
        parsed_time = datetime.strptime(time, "%H:%M").time()
      except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid time format") from exc
      boundary = business_date_start_utc(day) + timedelta(hours=parsed_time.hour, minutes=parsed_time.minute)
    elif time_of_day:
      base = datetime.combine(day, datetime.min.time())
      boundary = base + (timedelta(hours=9) if time_of_day == "morning" else timedelta(hours=18))
    else:
      raise HTTPException(status_code=400, detail="Missing time")

  snapshot = snapshot_at(session, boundary)
  if not snapshot:
    raise HTTPException(status_code=400, detail={"code": "inventory_not_initialized"})
  return snapshot


@router.get("/day", response_model=InventoryDayResponse)
def get_inventory_day(date: str, session: Session = Depends(get_session)) -> InventoryDayResponse:
  try:
    business_date = datetime.fromisoformat(date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc

  start_utc = business_date_start_utc(business_date)
  end_utc = business_date_start_utc(business_date + timedelta(days=1))
  deltas = session.exec(
    select(InventoryDelta)
    .where(InventoryDelta.effective_at >= start_utc)
    .where(InventoryDelta.effective_at < end_utc)
    .order_by(InventoryDelta.effective_at, InventoryDelta.created_at, InventoryDelta.id)
  ).all()

  summaries = session.exec(
    select(InventoryDailySummary).where(InventoryDailySummary.business_date == business_date)
  ).all()
  summary_by_gas = {row.gas_type: row for row in summaries}
  gas_types = sorted({row.gas_type for row in deltas} | set(summary_by_gas.keys()))

  summaries_out: list[InventoryDayGasSummary] = []
  running_totals: dict[str, tuple[int, int]] = {}
  for gas_type in gas_types:
    summary = summary_by_gas.get(gas_type)
    day_start_full = summary.day_start_full if summary else 0
    day_start_empty = summary.day_start_empty if summary else 0
    day_end_full = summary.day_end_full if summary else 0
    day_end_empty = summary.day_end_empty if summary else 0
    running_totals[gas_type] = (day_start_full, day_start_empty)
    summaries_out.append(
      InventoryDayGasSummary(
        gas_type=gas_type,
        business_date=business_date.isoformat(),
        day_start_full=day_start_full,
        day_start_empty=day_start_empty,
        day_end_full=day_end_full,
        day_end_empty=day_end_empty,
      )
    )

  events: list[InventoryDayEvent] = []
  for delta in deltas:
    before_full, before_empty = running_totals.get(delta.gas_type, (0, 0))
    after_full = before_full + delta.delta_full
    after_empty = before_empty + delta.delta_empty
    running_totals[delta.gas_type] = (after_full, after_empty)
    events.append(
      InventoryDayEvent(
        id=delta.id,
        gas_type=delta.gas_type,
        effective_at=delta.effective_at,
        created_at=delta.created_at,
        source_type=delta.source_type,
        source_id=delta.source_id,
        reason=delta.reason,
        delta_full=delta.delta_full,
        delta_empty=delta.delta_empty,
        before_full=before_full,
        before_empty=before_empty,
        after_full=after_full,
        after_empty=after_empty,
      )
    )

  return InventoryDayResponse(
    business_date=business_date.isoformat(),
    business_tz=effective_business_tz_name(),
    summaries=summaries_out,
    events=events,
  )

@router.get("/deltas", response_model=InventoryDeltaListResponse)
def list_inventory_deltas(
  from_: str = Query(..., alias="from"),
  to: Optional[str] = None,
  gas_type: Optional[str] = None,
  session: Session = Depends(get_session),
) -> InventoryDeltaListResponse:
  try:
    start_date = datetime.fromisoformat(from_).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid from date format") from exc
  if to:
    try:
      end_date = datetime.fromisoformat(to).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid to date format") from exc
  else:
    end_date = start_date

  start_utc = business_date_start_utc(start_date)
  end_utc = business_date_start_utc(end_date + timedelta(days=1))
  stmt = (
    select(InventoryDelta)
    .where(InventoryDelta.effective_at >= start_utc)
    .where(InventoryDelta.effective_at < end_utc)
    .order_by(InventoryDelta.effective_at, InventoryDelta.created_at, InventoryDelta.id)
  )
  if gas_type:
    stmt = stmt.where(InventoryDelta.gas_type == gas_type)
  rows = session.exec(stmt).all()

  items = [
    InventoryDeltaRow(
      id=row.id,
      gas_type=row.gas_type,
      effective_at=row.effective_at,
      created_at=row.created_at,
      source_type=row.source_type,
      source_id=row.source_id,
      reason=row.reason,
      delta_full=row.delta_full,
      delta_empty=row.delta_empty,
      business_date=business_date_from_utc(row.effective_at).isoformat(),
    )
    for row in rows
  ]
  return InventoryDeltaListResponse(
    from_date=start_date.isoformat(),
    to_date=end_date.isoformat(),
    gas_type=gas_type,
    items=items,
  )


@router.get("/refills", response_model=list[InventoryRefillSummary])
def list_refills(session: Session = Depends(get_session)) -> list[InventoryRefillSummary]:
  events = session.exec(select(RefillEvent).order_by(RefillEvent.effective_at.desc())).all()
  if not events:
    return []

  refill_ids = [event.id for event in events]
  deltas = session.exec(
    select(InventoryDelta)
    .where(InventoryDelta.source_type == "refill")
    .where(InventoryDelta.source_id.in_(refill_ids))
  ).all()

  totals: dict[str, dict[str, int]] = {}
  for row in deltas:
    if not row.source_id:
      continue
    entry = totals.setdefault(
      row.source_id,
      {"buy12": 0, "return12": 0, "buy48": 0, "return48": 0},
    )
    buy = max(row.delta_full, 0)
    ret = max(-row.delta_empty, 0)
    if row.gas_type == "12kg":
      entry["buy12"] += buy
      entry["return12"] += ret
    else:
      entry["buy48"] += buy
      entry["return48"] += ret

  result: list[InventoryRefillSummary] = []
  for event in events:
    summary = totals.get(event.id, {"buy12": 0, "return12": 0, "buy48": 0, "return48": 0})
    local_dt = business_local_datetime_from_utc(event.effective_at)
    time_of_day = "evening" if local_dt.hour >= 12 else "morning"
    result.append(
      InventoryRefillSummary(
        refill_id=event.id,
        date=event.business_date.isoformat(),
        time_of_day=time_of_day,
        effective_at=_as_utc(event.effective_at),
        buy12=int(summary["buy12"]),
        return12=int(summary["return12"]),
        buy48=int(summary["buy48"]),
        return48=int(summary["return48"]),
      )
    )
  return result


@router.get("/refills/{refill_id}", response_model=InventoryRefillDetails)
def get_refill_details(refill_id: str, session: Session = Depends(get_session)) -> InventoryRefillDetails:
  refill_event = session.get(RefillEvent, refill_id)
  if not refill_event:
    raise HTTPException(status_code=404, detail="refill_not_found")

  deltas = session.exec(
    select(InventoryDelta)
    .where(InventoryDelta.source_type == "refill")
    .where(InventoryDelta.source_id == refill_id)
  ).all()
  if not deltas:
    raise HTTPException(status_code=404, detail="refill_not_found")

  buy12 = return12 = buy48 = return48 = 0
  for row in deltas:
    buy = max(row.delta_full, 0)
    ret = max(-row.delta_empty, 0)
    if row.gas_type == "12kg":
      buy12 += buy
      return12 += ret
    else:
      buy48 += buy
      return48 += ret

  before_full_12, before_empty_12 = inventory_totals_before_source(
    session,
    gas_type="12kg",
    source_type="refill",
    source_id=refill_id,
  )
  before_full_48, before_empty_48 = inventory_totals_before_source(
    session,
    gas_type="48kg",
    source_type="refill",
    source_id=refill_id,
  )
  after_full_12 = before_full_12 + buy12
  after_empty_12 = before_empty_12 - return12
  after_full_48 = before_full_48 + buy48
  after_empty_48 = before_empty_48 - return48

  boundary = refill_event.effective_at
  local_dt = business_local_datetime_from_utc(boundary)
  time_of_day = "evening" if local_dt.hour >= 12 else "morning"
  return InventoryRefillDetails(
    refill_id=refill_id,
    business_date=refill_event.business_date.isoformat(),
    time_of_day=time_of_day,
    effective_at=_as_utc(boundary),
    buy12=buy12,
    return12=return12,
    buy48=buy48,
    return48=return48,
    total_cost=refill_event.total_cost,
    paid_now=refill_event.paid_now,
    unit_price_buy_12=refill_event.unit_price_buy_12,
    unit_price_buy_48=refill_event.unit_price_buy_48,
    before_full_12=before_full_12,
    before_empty_12=before_empty_12,
    after_full_12=after_full_12,
    after_empty_12=after_empty_12,
    before_full_48=before_full_48,
    before_empty_48=before_empty_48,
    after_full_48=after_full_48,
    after_empty_48=after_empty_48,
  )


@router.put("/refills/{refill_id}", response_model=InventoryRefillDetails)
def update_refill(
  refill_id: str,
  payload: InventoryRefillUpdate,
  session: Session = Depends(get_session),
  user_id: Optional[str] = Depends(get_optional_user),
) -> InventoryRefillDetails:
  refill_event = session.get(RefillEvent, refill_id)
  if not refill_event:
    raise HTTPException(status_code=404, detail="refill_not_found")

  boundary = refill_event.effective_at
  before_full_12, before_empty_12 = inventory_totals_before_source(
    session,
    gas_type="12kg",
    source_type="refill",
    source_id=refill_id,
  )
  before_full_48, before_empty_48 = inventory_totals_before_source(
    session,
    gas_type="48kg",
    source_type="refill",
    source_id=refill_id,
  )

  allow_negative = payload.allow_negative
  if allow_negative:
    if not _allow_negative_for_user(user_id):
      raise HTTPException(status_code=403, detail="allow_negative_not_permitted")

  deleted_dates = delete_inventory_deltas_for_source(
    session,
    source_id=refill_id,
    source_types=["refill"],
  )
  cash_start = delete_cash_deltas_for_source(
    session,
    source_id=refill_id,
    source_types=["refill_payment"],
  )
  company_start = delete_company_deltas_for_source(
    session,
    source_id=refill_id,
    source_types=["refill"],
  )

  if not allow_negative:
    if payload.return12 > before_empty_12:
      raise HTTPException(
        status_code=400,
        detail={
          "code": "inventory_negative",
          "gas_type": "12kg",
          "field": "empty",
          "available": before_empty_12,
          "attempt": payload.return12,
        },
      )
    if payload.return48 > before_empty_48:
      raise HTTPException(
        status_code=400,
        detail={
          "code": "inventory_negative",
          "gas_type": "48kg",
          "field": "empty",
          "available": before_empty_48,
          "attempt": payload.return48,
        },
      )

  add_inventory_delta(
    session,
    gas_type="12kg",
    delta_full=payload.buy12,
    delta_empty=-payload.return12,
    effective_at=boundary,
    source_type="refill",
    source_id=refill_id,
    reason=payload.reason,
    allow_negative=allow_negative,
  )
  add_inventory_delta(
    session,
    gas_type="48kg",
    delta_full=payload.buy48,
    delta_empty=-payload.return48,
    effective_at=boundary,
    source_type="refill",
    source_id=refill_id,
    reason=payload.reason,
    allow_negative=allow_negative,
  )

  if refill_event.unit_price_buy_12 is None or refill_event.unit_price_buy_48 is None:
    price_snapshot_at = datetime.now(timezone.utc)
    if refill_event.unit_price_buy_12 is None:
      refill_event.unit_price_buy_12 = resolve_buy_price(session, "12kg", price_snapshot_at)
    if refill_event.unit_price_buy_48 is None:
      refill_event.unit_price_buy_48 = resolve_buy_price(session, "48kg", price_snapshot_at)

  if payload.total_cost is not None:
    refill_event.total_cost = payload.total_cost
  else:
    price_12 = refill_event.unit_price_buy_12 or 0
    price_48 = refill_event.unit_price_buy_48 or 0
    refill_event.total_cost = payload.buy12 * price_12 + payload.buy48 * price_48

  if payload.paid_now is not None:
    refill_event.paid_now = payload.paid_now
  if payload.reason is not None:
    refill_event.reason = payload.reason
  session.add(refill_event)

  paid_now = refill_event.paid_now
  add_cash_delta(
    session,
    effective_at=boundary,
    source_type="refill_payment",
    source_id=refill_id,
    delta_cash=-paid_now,
    reason=payload.reason,
    actor_id=user_id,
  )
  owed = refill_event.total_cost - paid_now
  if owed > 0:
    add_company_delta(
      session,
      effective_at=boundary,
      source_type="refill",
      source_id=refill_id,
      delta_payable=owed,
      reason=payload.reason,
      actor_id=user_id,
    )

  start_date = business_date_from_utc(boundary)
  end_date = business_date_from_utc(datetime.now(timezone.utc))
  for gas_type in ("12kg", "48kg"):
    gas_start = deleted_dates.get(gas_type, start_date)
    recompute_daily_summaries(session, gas_type, gas_start, end_date, allow_negative=allow_negative)

  cash_start_date = cash_start or start_date
  recompute_cash_summaries(session, cash_start_date, end_date)
  company_start_date = company_start or start_date
  recompute_company_summaries(session, company_start_date, end_date)

  session.commit()
  return get_refill_details(refill_id, session)


@router.delete("/refills/{refill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_refill(
  refill_id: str,
  session: Session = Depends(get_session),
) -> None:
  refill_event = session.get(RefillEvent, refill_id)
  if not refill_event:
    return

  deleted_inventory_dates = delete_inventory_deltas_for_source(
    session,
    source_id=refill_id,
    source_types=["refill"],
  )
  deleted_cash_date = delete_cash_deltas_for_source(
    session,
    source_id=refill_id,
    source_types=["refill_payment"],
  )
  deleted_company_date = delete_company_deltas_for_source(
    session,
    source_id=refill_id,
    source_types=["refill"],
  )
  session.delete(refill_event)

  end_date = business_date_from_utc(datetime.now(timezone.utc))
  for gas, start_date in deleted_inventory_dates.items():
    enqueue_recalc_job(session, gas, start_date)
    recompute_daily_summaries(session, gas, start_date, end_date, allow_negative=False)
  if deleted_cash_date:
    recompute_cash_summaries(session, deleted_cash_date, end_date)
  if deleted_company_date:
    recompute_company_summaries(session, deleted_company_date, end_date)

  add_activity(
    session,
    "inventory_refill",
    "deleted",
    f"Refill on {refill_event.business_date.isoformat()} removed",
    refill_id,
  )
  session.commit()


@router.post("/init", response_model=InventorySnapshot, status_code=status.HTTP_201_CREATED)
def init_inventory(payload: InventoryInit, session: Session = Depends(get_session)) -> InventorySnapshot:
  now = datetime.now(timezone.utc)
  if payload.date:
    try:
      day = datetime.fromisoformat(payload.date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
  else:
    day = business_date_from_utc(now)
  day_start = business_date_start_utc(day)

  add_inventory_delta(
    session,
    gas_type="12kg",
    delta_full=payload.full12,
    delta_empty=payload.empty12,
    effective_at=day_start,
    source_type="init",
    reason=payload.reason,
  )
  add_inventory_delta(
    session,
    gas_type="48kg",
    delta_full=payload.full48,
    delta_empty=payload.empty48,
    effective_at=day_start,
    source_type="init",
    reason=payload.reason,
  )
  session.commit()

  snapshot = latest_snapshot(session)
  if not snapshot:
    raise HTTPException(status_code=500, detail="Failed to create inventory snapshot")
  return snapshot


@router.post("/refill", response_model=InventorySnapshot, status_code=status.HTTP_201_CREATED)
def create_refill(
  payload: InventoryRefillCreate,
  session: Session = Depends(get_session),
  user_id: Optional[str] = Depends(get_optional_user),
) -> InventorySnapshot:
  try:
    day = datetime.fromisoformat(payload.date).date()
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="Invalid date format") from exc

  if payload.effective_at:
    boundary = to_utc_naive(payload.effective_at)
    day = business_date_from_utc(boundary)
  elif payload.time:
    try:
      parsed_time = datetime.strptime(payload.time, "%H:%M").time()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid time format") from exc
    boundary = business_date_start_utc(day) + timedelta(hours=parsed_time.hour, minutes=parsed_time.minute)
  elif payload.time_of_day:
    base = datetime.combine(day, datetime.min.time())
    boundary = base + (timedelta(hours=9) if payload.time_of_day == "morning" else timedelta(hours=18))
  else:
    raise HTTPException(status_code=400, detail="Missing time")

  refill_id = f"refill_{datetime.now(timezone.utc).timestamp()}"
  allow_negative = payload.allow_negative
  if allow_negative:
    if not _allow_negative_for_user(user_id):
      raise HTTPException(status_code=403, detail="allow_negative_not_permitted")
  before_full_12, before_empty_12 = inventory_totals_at(session, "12kg", boundary)
  before_full_48, before_empty_48 = inventory_totals_at(session, "48kg", boundary)
  if not allow_negative:
    if payload.return12 > before_empty_12:
      raise HTTPException(
        status_code=400,
        detail={
          "code": "inventory_negative",
          "gas_type": "12kg",
          "field": "empty",
          "available": before_empty_12,
          "attempt": payload.return12,
        },
      )
    if payload.return48 > before_empty_48:
      raise HTTPException(
        status_code=400,
        detail={
          "code": "inventory_negative",
          "gas_type": "48kg",
          "field": "empty",
          "available": before_empty_48,
          "attempt": payload.return48,
        },
      )
  add_inventory_delta(
    session,
    gas_type="12kg",
    delta_full=payload.buy12,
    delta_empty=-payload.return12,
    effective_at=boundary,
    source_type="refill",
    source_id=refill_id,
    reason=payload.reason,
    allow_negative=allow_negative,
  )
  add_inventory_delta(
    session,
    gas_type="48kg",
    delta_full=payload.buy48,
    delta_empty=-payload.return48,
    effective_at=boundary,
    source_type="refill",
    source_id=refill_id,
    reason=payload.reason,
    allow_negative=allow_negative,
  )
  unit_price_buy_12 = resolve_buy_price(session, "12kg", boundary)
  unit_price_buy_48 = resolve_buy_price(session, "48kg", boundary)
  if payload.total_cost is None:
    price_12 = unit_price_buy_12 or 0
    price_48 = unit_price_buy_48 or 0
    total_cost = payload.buy12 * price_12 + payload.buy48 * price_48
  else:
    total_cost = payload.total_cost
  paid_now = payload.paid_now if payload.paid_now is not None else total_cost
  session.add(
    RefillEvent(
      id=refill_id,
      business_date=day,
      effective_at=boundary,
      unit_price_buy_12=unit_price_buy_12,
      unit_price_buy_48=unit_price_buy_48,
      total_cost=total_cost,
      paid_now=paid_now,
      reason=payload.reason,
      created_at=datetime.now(timezone.utc),
      created_by=user_id,
    )
  )
  add_cash_delta(
    session,
    effective_at=boundary,
    source_type="refill_payment",
    source_id=refill_id,
    delta_cash=-paid_now,
    reason=payload.reason,
    actor_id=user_id,
  )
  owed = total_cost - paid_now
  if owed > 0:
    add_company_delta(
      session,
      effective_at=boundary,
      source_type="refill",
      source_id=refill_id,
      delta_payable=owed,
      reason=payload.reason,
      actor_id=user_id,
    )
  # TODO: if refill edits/deletes are introduced, delete refill inventory + cash deltas and recompute forward.
  local_dt = business_local_datetime_from_utc(boundary)
  time_label = local_dt.strftime("%H:%M")
  add_activity(
    session,
    "inventory_refill",
    "created",
    (
      f"Refill {time_label} on {day.isoformat()} "
      f"(12kg buy {payload.buy12} return {payload.return12}, "
      f"48kg buy {payload.buy48} return {payload.return48})"
    ),
    refill_id,
    metadata=(
      f"date={day.isoformat()};time={time_label};buy12={payload.buy12};return12={payload.return12};"
      f"buy48={payload.buy48};return48={payload.return48}"
    ),
  )
  add_activity(
    session,
    "inventory",
    "updated",
    (
      f"Inventory refill updated 12kg full {before_full_12}->{before_full_12 + payload.buy12}, "
      f"empty {before_empty_12}->{before_empty_12 - payload.return12}; "
      f"48kg full {before_full_48}->{before_full_48 + payload.buy48}, "
      f"empty {before_empty_48}->{before_empty_48 - payload.return48}"
    ),
    refill_id,
    metadata=(
      f"gas=12kg;prev_full={before_full_12};prev_empty={before_empty_12};"
      f"new_full={before_full_12 + payload.buy12};new_empty={before_empty_12 - payload.return12};"
      f"gas=48kg;prev_full={before_full_48};prev_empty={before_empty_48};"
      f"new_full={before_full_48 + payload.buy48};new_empty={before_empty_48 - payload.return48}"
    ),
  )
  session.commit()

  snapshot = snapshot_at(session, boundary + timedelta(seconds=1))
  if not snapshot:
    raise HTTPException(status_code=500, detail="Failed to create inventory snapshot")
  return snapshot


@router.post("/adjust", response_model=InventorySnapshot, status_code=status.HTTP_201_CREATED)
def adjust_inventory(
  payload: InventoryAdjustCreate,
  session: Session = Depends(get_session),
  user_id: Optional[str] = Depends(get_optional_user),
) -> InventorySnapshot:
  if payload.date:
    try:
      day = datetime.fromisoformat(payload.date).date()
    except ValueError as exc:
      raise HTTPException(status_code=400, detail="Invalid date format") from exc
    boundary = datetime.combine(day, datetime.min.time()) + timedelta(hours=12)
  else:
    boundary = datetime.now(timezone.utc)
  event_id = f"adjust_{boundary.timestamp()}"
  prev_full, prev_empty = inventory_totals_at(session, payload.gas_type, boundary)
  allow_negative = payload.allow_negative
  if allow_negative:
    if not _allow_negative_for_user(user_id):
      raise HTTPException(status_code=403, detail="allow_negative_not_permitted")

  reason_text = payload.reason
  if payload.note:
    reason_text = f"{payload.reason}: {payload.note}"

  add_inventory_delta(
    session,
    gas_type=payload.gas_type,
    delta_full=payload.delta_full,
    delta_empty=payload.delta_empty,
    effective_at=boundary,
    source_type="adjust",
    source_id=event_id,
    reason=reason_text,
    allow_negative=allow_negative,
  )
  add_activity(
    session,
    "inventory_adjust",
    "created",
    (
      f"Inventory {payload.gas_type} adjust {payload.delta_full} full, "
      f"{payload.delta_empty} empty ({reason_text})"
    ),
    event_id,
    metadata=f"gas={payload.gas_type};delta_full={payload.delta_full};delta_empty={payload.delta_empty};reason={reason_text}",
  )

  add_activity(
    session,
    "inventory",
    "adjusted",
    (
      f"Inventory {payload.gas_type} adjusted full {prev_full}->{prev_full + payload.delta_full}, "
      f"empty {prev_empty}->{prev_empty + payload.delta_empty} ({reason_text})"
    ),
    event_id,
    metadata=(
      f"gas={payload.gas_type};prev_full={prev_full};prev_empty={prev_empty};"
      f"new_full={prev_full + payload.delta_full};new_empty={prev_empty + payload.delta_empty};reason={reason_text}"
    ),
  )

  session.commit()
  snapshot = snapshot_at(session, boundary + timedelta(seconds=1))
  if not snapshot:
    raise HTTPException(status_code=500, detail="Failed to create inventory snapshot")
  return snapshot
