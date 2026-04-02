"""Inventory operation helpers.

Date/time parsing, snapshot computation, and validation helpers for inventory routes.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.schemas import InventorySnapshot
from app.services.ledger import sum_inventory
from app.utils.time import business_date_start_utc


def parse_datetime(
  *,
  date_str: Optional[str],
  time_str: Optional[str] = None,
  time_of_day: Optional[str] = None,
  at: Optional[str] = None,
) -> Optional[datetime]:
  """Parse datetime from component parts or ISO string."""
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


def snapshot_at(session: Session, at: datetime, reason: Optional[str] = None) -> InventorySnapshot:
  """Compute inventory snapshot as of a given datetime."""
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


def time_of_day(value: datetime) -> str:
  """Classify datetime as morning or evening (cutoff at noon)."""
  return "morning" if value.hour < 12 else "evening"


def reject_new_shells_for_refill(new12: int, new48: int) -> None:
  """Validate that refill operations do not include new shell purchases."""
  if new12 != 0 or new48 != 0:
    raise HTTPException(status_code=422, detail="new_shells_not_allowed_for_refill")


def validate_inventory_adjustment_reason(reason: Optional[str], *, delta_full: int, delta_empty: int) -> None:
  """Validate adjustment reason against delta direction."""
  if not reason:
    return
  if reason in {"shrinkage", "damage"} and (delta_full > 0 or delta_empty > 0):
    raise HTTPException(status_code=422, detail="adjustment_reason_disallows_positive_delta")
