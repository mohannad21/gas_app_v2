from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone, tzinfo
from functools import lru_cache
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError

import logging

from app.config import get_settings


logger = logging.getLogger(__name__)


def to_utc_naive(dt: datetime) -> datetime:
  """
  Normalize any datetime to naive UTC to avoid offset-naive vs offset-aware comparisons.
  If the datetime is timezone-aware, convert to UTC and strip tzinfo. If already naive, return as-is.
  """
  if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
    return dt
  return dt.astimezone(timezone.utc).replace(tzinfo=None)


@lru_cache
def _business_tz() -> tzinfo:
  settings = get_settings()
  key = settings.business_tz
  if key.upper() == "LOCAL":
    return datetime.now().astimezone().tzinfo or timezone.utc
  if key.upper() == "UTC":
    return timezone.utc
  try:
    return ZoneInfo(key)
  except ZoneInfoNotFoundError:
    logger.warning("business_tz_fallback requested=%s effective=UTC", key)
    return timezone.utc


def effective_business_tz_name() -> str:
  tz = _business_tz()
  if isinstance(tz, ZoneInfo):
    return tz.key
  return tz.tzname(datetime.now()) if tz else "UTC"


def business_date_from_utc(dt: datetime) -> date:
  """
  Convert a naive UTC datetime into the business date using BUSINESS_TZ.
  """
  utc_dt = to_utc_naive(dt).replace(tzinfo=timezone.utc)
  local_dt = utc_dt.astimezone(_business_tz())
  return local_dt.date()


def business_local_datetime_from_utc(dt: datetime) -> datetime:
  """
  Convert a naive UTC datetime to an aware datetime in BUSINESS_TZ.
  """
  utc_dt = to_utc_naive(dt).replace(tzinfo=timezone.utc)
  return utc_dt.astimezone(_business_tz())


def business_date_start_utc(business_date: date) -> datetime:
  """
  Convert a business date start (00:00 in BUSINESS_TZ) to naive UTC.
  """
  local_start = datetime.combine(business_date, time.min, tzinfo=_business_tz())
  return local_start.astimezone(timezone.utc).replace(tzinfo=None)


def business_date_end_utc(business_date: date) -> datetime:
  """
  Convert a business date end (23:59:59 in BUSINESS_TZ) to naive UTC.
  """
  next_day_start = business_date_start_utc(business_date + timedelta(days=1))
  return next_day_start - timedelta(seconds=1)
