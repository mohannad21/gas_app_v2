from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlmodel import Session, select

from app.models import CompanyDailySummary, CompanyDelta
from app.utils.time import business_date_from_utc, business_date_start_utc, to_utc_naive


def _date_range(start: date, end: date) -> list[date]:
  if end < start:
    return []
  days = (end - start).days
  return [start + timedelta(days=offset) for offset in range(days + 1)]


def _to_utc_naive(dt: datetime) -> datetime:
  return to_utc_naive(dt)


def _latest_summary(session: Session, up_to: Optional[date] = None) -> Optional[CompanyDailySummary]:
  stmt = select(CompanyDailySummary)
  if up_to is not None:
    stmt = stmt.where(CompanyDailySummary.business_date <= up_to)
  return session.exec(stmt.order_by(CompanyDailySummary.business_date.desc())).first()


def delete_company_deltas_for_source(
  session: Session,
  *,
  source_id: str,
  source_types: Optional[list[str]] = None,
) -> Optional[date]:
  stmt = select(CompanyDelta).where(CompanyDelta.source_id == source_id)
  if source_types:
    stmt = stmt.where(CompanyDelta.source_type.in_(source_types))
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


def recompute_company_summaries(
  session: Session,
  start_business_date: date,
  end_business_date: date,
) -> None:
  if end_business_date < start_business_date:
    return
  previous = _latest_summary(session, start_business_date - timedelta(days=1))
  running_payable = previous.payable_end if previous else 0.0

  range_start = business_date_start_utc(start_business_date)
  range_end = business_date_start_utc(end_business_date + timedelta(days=1))
  deltas = session.exec(
    select(CompanyDelta)
    .where(CompanyDelta.effective_at >= range_start)
    .where(CompanyDelta.effective_at < range_end)
    .order_by(CompanyDelta.effective_at, CompanyDelta.created_at, CompanyDelta.id)
  ).all()

  deltas_by_date: dict[date, list[CompanyDelta]] = {}
  for delta in deltas:
    date_key = business_date_from_utc(delta.effective_at)
    deltas_by_date.setdefault(date_key, []).append(delta)

  for current_date in _date_range(start_business_date, end_business_date):
    day_start = running_payable
    day_delta = 0.0
    for delta in deltas_by_date.get(current_date, []):
      running_payable += delta.delta_payable
      day_delta += delta.delta_payable
    day_end = running_payable
    summary = session.exec(
      select(CompanyDailySummary)
      .where(CompanyDailySummary.business_date == current_date)
    ).first()
    if summary:
      summary.payable_start = day_start
      summary.payable_delta = day_delta
      summary.payable_end = day_end
      summary.computed_at = datetime.now(timezone.utc)
      session.add(summary)
    else:
      session.add(
        CompanyDailySummary(
          business_date=current_date,
          payable_start=day_start,
          payable_delta=day_delta,
          payable_end=day_end,
          computed_at=datetime.now(timezone.utc),
        )
      )


def add_company_delta(
  session: Session,
  *,
  effective_at: datetime,
  source_type: str,
  source_id: Optional[str],
  delta_payable: float,
  reason: Optional[str] = None,
  actor_id: Optional[str] = None,
) -> CompanyDelta:
  effective_at_norm = _to_utc_naive(effective_at)
  now = datetime.now(timezone.utc)
  delta = CompanyDelta(
    effective_at=effective_at_norm,
    source_type=source_type,
    source_id=source_id,
    delta_payable=delta_payable,
    reason=reason,
    created_at=now,
    created_by=actor_id,
  )
  session.add(delta)
  start_business_date = business_date_from_utc(effective_at_norm)
  end_business_date = business_date_from_utc(datetime.now(timezone.utc))
  recompute_company_summaries(session, start_business_date, end_business_date)
  return delta
