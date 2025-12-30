from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlmodel import Session, select

from app.models import CashDailySummary, CashDelta
from app.utils.time import business_date_from_utc, business_date_start_utc, to_utc_naive


def _date_range(start: date, end: date) -> list[date]:
  if end < start:
    return []
  days = (end - start).days
  return [start + timedelta(days=offset) for offset in range(days + 1)]


def _to_utc_naive(dt: datetime) -> datetime:
  return to_utc_naive(dt)


def _latest_summary(session: Session, up_to: Optional[date] = None) -> Optional[CashDailySummary]:
  stmt = select(CashDailySummary)
  if up_to is not None:
    stmt = stmt.where(CashDailySummary.business_date <= up_to)
  return session.exec(stmt.order_by(CashDailySummary.business_date.desc())).first()


def delete_cash_deltas_for_source(
  session: Session,
  *,
  source_id: str,
  source_types: Optional[list[str]] = None,
) -> Optional[date]:
  stmt = select(CashDelta).where(CashDelta.source_id == source_id)
  if source_types:
    stmt = stmt.where(CashDelta.source_type.in_(source_types))
  rows = session.exec(stmt).all()
  if not rows:
    return None
  earliest: Optional[date] = None
  for row in rows:
    day = business_date_from_utc(row.effective_at)
    if earliest is None or day < earliest:
      earliest = day
    session.delete(row)
  return earliest


def recompute_cash_summaries(
  session: Session,
  start_business_date: date,
  end_business_date: date,
) -> None:
  if end_business_date < start_business_date:
    return
  previous = _latest_summary(session, start_business_date - timedelta(days=1))
  running_cash = previous.cash_end if previous else 0.0

  range_start = business_date_start_utc(start_business_date)
  range_end = business_date_start_utc(end_business_date + timedelta(days=1))
  deltas = session.exec(
    select(CashDelta)
    .where(CashDelta.effective_at >= range_start)
    .where(CashDelta.effective_at < range_end)
    .order_by(CashDelta.effective_at, CashDelta.created_at, CashDelta.id)
  ).all()

  deltas_by_date: dict[date, list[CashDelta]] = {}
  for delta in deltas:
    date_key = business_date_from_utc(delta.effective_at)
    deltas_by_date.setdefault(date_key, []).append(delta)

  for current_date in _date_range(start_business_date, end_business_date):
    day_start = running_cash
    day_delta = 0.0
    day_rows = deltas_by_date.get(current_date, [])
    init_rows = [row for row in day_rows if row.source_type == "cash_init"]
    if init_rows:
      day_start = init_rows[0].delta_cash
      running_cash = day_start

    for delta in day_rows:
      if delta.source_type == "cash_init":
        continue
      running_cash += delta.delta_cash
      day_delta += delta.delta_cash

    day_end = running_cash
    summary = session.exec(
      select(CashDailySummary)
      .where(CashDailySummary.business_date == current_date)
    ).first()
    if summary:
      summary.cash_start = day_start
      summary.cash_delta = day_delta
      summary.cash_end = day_end
      summary.computed_at = datetime.now(timezone.utc)
      session.add(summary)
    else:
      session.add(
        CashDailySummary(
          business_date=current_date,
          cash_start=day_start,
          cash_delta=day_delta,
          cash_end=day_end,
          computed_at=datetime.now(timezone.utc),
        )
      )


def add_cash_delta(
  session: Session,
  *,
  effective_at: datetime,
  source_type: str,
  source_id: Optional[str],
  delta_cash: float,
  reason: Optional[str] = None,
  actor_id: Optional[str] = None,
) -> CashDelta:
  effective_at_norm = _to_utc_naive(effective_at)
  now = datetime.now(timezone.utc)
  delta = CashDelta(
    effective_at=effective_at_norm,
    source_type=source_type,
    source_id=source_id,
    delta_cash=delta_cash,
    reason=reason,
    created_at=now,
    created_by=actor_id,
  )
  session.add(delta)
  start_business_date = business_date_from_utc(effective_at_norm)
  end_business_date = business_date_from_utc(datetime.now(timezone.utc))
  recompute_cash_summaries(session, start_business_date, end_business_date)
  return delta

