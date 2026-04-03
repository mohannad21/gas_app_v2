"""Inventory operation helpers.

Date/time parsing, snapshot computation, and validation helpers for inventory routes.
"""

from datetime import datetime
from typing import Optional

from sqlmodel import Session

from app.schemas import InventorySnapshot
from app.services.ledger import sum_inventory
from app.services.posting import parse_happened_at_parts


def parse_datetime(
  *,
  date_str: Optional[str],
  time_str: Optional[str] = None,
  time_of_day: Optional[str] = None,
  at: Optional[str] = None,
) -> Optional[datetime]:
  """Parse datetime from component parts or ISO string."""
  return parse_happened_at_parts(date_str=date_str, time_str=time_str, time_of_day=time_of_day, at=at)


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
