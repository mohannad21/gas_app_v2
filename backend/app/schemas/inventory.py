from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import field_validator
from sqlmodel import SQLModel

from .common import GasType, InventoryAdjustReason, _non_negative


class InventoryAdjustCreate(SQLModel):
  happened_at: Optional[datetime] = None
  group_id: Optional[str] = None
  gas_type: GasType
  delta_full: int = 0
  delta_empty: int = 0
  reason: Optional[str] = None
  note: Optional[str] = None
  request_id: Optional[str] = None


class InventoryAdjustUpdate(SQLModel):
  delta_full: Optional[int] = None
  delta_empty: Optional[int] = None
  reason: Optional[str] = None
  note: Optional[str] = None


class InventoryAdjustmentRow(SQLModel):
  id: str
  group_id: Optional[str] = None
  gas_type: GasType
  delta_full: int
  delta_empty: int
  reason: Optional[str] = None
  effective_at: datetime
  created_at: datetime
  is_deleted: bool = False


class InventorySnapshot(SQLModel):
  as_of: datetime
  full12: int
  empty12: int
  total12: int
  full48: int
  empty48: int
  total48: int
  reason: Optional[str] = None


class InventoryInitCreate(SQLModel):
  date: Optional[str] = None
  full12: int = 0
  empty12: int = 0
  full48: int = 0
  empty48: int = 0
  reason: Optional[str] = None

  @field_validator("full12", "empty12", "full48", "empty48")
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class InventoryRefillCreate(SQLModel):
  happened_at: Optional[datetime] = None
  buy12: int = 0
  return12: int = 0
  buy48: int = 0
  return48: int = 0
  total_cost: int = 0
  paid_now: int = 0
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  note: Optional[str] = None
  new12: int = 0
  new48: int = 0
  request_id: Optional[str] = None

  @field_validator(
    "buy12",
    "return12",
    "buy48",
    "return48",
    "total_cost",
    "paid_now",
    "new12",
    "new48",
  )
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class InventoryRefillSummary(SQLModel):
  refill_id: str
  date: str
  time_of_day: Optional[Literal["morning", "evening"]] = None
  effective_at: datetime
  created_at: Optional[datetime] = None
  buy12: int
  return12: int
  buy48: int
  return48: int
  new12: int = 0
  new48: int = 0
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  live_debt_cash: Optional[int] = None
  live_debt_cylinders_12: Optional[int] = None
  live_debt_cylinders_48: Optional[int] = None
  is_deleted: bool = False
  deleted_at: Optional[datetime] = None
  kind: str = "refill"


class InventoryRefillUpdate(SQLModel):
  buy12: int = 0
  return12: int = 0
  buy48: int = 0
  return48: int = 0
  total_cost: int = 0
  paid_now: int = 0
  debt_cash: Optional[int] = None
  debt_cylinders_12: Optional[int] = None
  debt_cylinders_48: Optional[int] = None
  note: Optional[str] = None
  new12: int = 0
  new48: int = 0

  @field_validator(
    "buy12",
    "return12",
    "buy48",
    "return48",
    "total_cost",
    "paid_now",
    "new12",
    "new48",
  )
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class InventoryRefillDetails(SQLModel):
  refill_id: str
  business_date: str
  time_of_day: Optional[Literal["morning", "evening"]] = None
  effective_at: datetime
  buy12: int
  return12: int
  buy48: int
  return48: int
  total_cost: int
  paid_now: int
  new12: int = 0
  new48: int = 0
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  notes: Optional[str] = None
  is_deleted: bool = False
  deleted_at: Optional[datetime] = None
