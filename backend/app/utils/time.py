from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone, tzinfo
from functools import lru_cache
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError

import logging

from app.config import get_settings


logger = logging.getLogger(__name__)


def _last_sunday(year: int, month: int) -> date:
  if month == 12:
    last_day = date(year + 1, 1, 1) - timedelta(days=1)
  else:
    last_day = date(year, month + 1, 1) - timedelta(days=1)
  return last_day - timedelta(days=(last_day.weekday() + 1) % 7)


class _EuropeBerlinFallbackTZ(tzinfo):
  _std_offset = timedelta(hours=1)
  _dst_delta = timedelta(hours=1)

  def _dst_start_local(self, year: int) -> datetime:
    sunday = _last_sunday(year, 3)
    return datetime(year, 3, sunday.day, 2, 0)

  def _dst_end_local(self, year: int) -> datetime:
    sunday = _last_sunday(year, 10)
    return datetime(year, 10, sunday.day, 3, 0)

  def _dst_window_utc(self, year: int) -> tuple[datetime, datetime]:
    start = datetime(year, 3, _last_sunday(year, 3).day, 1, 0, tzinfo=timezone.utc)
    end = datetime(year, 10, _last_sunday(year, 10).day, 1, 0, tzinfo=timezone.utc)
    return start, end

  def utcoffset(self, dt: datetime | None) -> timedelta:
    return self._std_offset + self.dst(dt)

  def dst(self, dt: datetime | None) -> timedelta:
    if dt is None:
      return timedelta(0)
    naive = dt.replace(tzinfo=None)
    if self._dst_start_local(dt.year) <= naive < self._dst_end_local(dt.year):
      return self._dst_delta
    return timedelta(0)

  def tzname(self, dt: datetime | None) -> str:
    return "CEST" if self.dst(dt) else "CET"

  def fromutc(self, dt: datetime) -> datetime:
    if dt.tzinfo is not self:
      raise ValueError("fromutc: dt.tzinfo is not self")
    utc_dt = dt.replace(tzinfo=timezone.utc)
    start, end = self._dst_window_utc(utc_dt.year)
    offset = self._std_offset + (self._dst_delta if start <= utc_dt < end else timedelta(0))
    return (utc_dt + offset).replace(tzinfo=self)


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
    if key == "Europe/Berlin":
      logger.warning("business_tz_fallback requested=%s effective=custom_europe_berlin", key)
      return _EuropeBerlinFallbackTZ()
    logger.warning("business_tz_fallback requested=%s effective=UTC", key)
    return timezone.utc


def business_tz() -> tzinfo:
  return _business_tz()


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

