from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import field_validator
from sqlmodel import SQLModel

from .common import GasType, OrderMode, _non_negative


class OrderCreate(SQLModel):
  customer_id: str
  system_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  order_mode: OrderMode = "replacement"
  gas_type: GasType
  cylinders_installed: int
  cylinders_received: int
  price_total: int
  paid_amount: Optional[int] = None
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  note: Optional[str] = None
  request_id: Optional[str] = None

  @field_validator("cylinders_installed", "cylinders_received", "price_total", "paid_amount")
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class OrderUpdate(SQLModel):
  customer_id: Optional[str] = None
  system_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  order_mode: Optional[OrderMode] = None
  gas_type: Optional[GasType] = None
  cylinders_installed: Optional[int] = None
  cylinders_received: Optional[int] = None
  price_total: Optional[int] = None
  paid_amount: Optional[int] = None
  debt_cash: Optional[int] = None
  debt_cylinders_12: Optional[int] = None
  debt_cylinders_48: Optional[int] = None
  note: Optional[str] = None

  @field_validator("cylinders_installed", "cylinders_received", "price_total", "paid_amount")
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class OrderOut(SQLModel):
  id: str
  customer_id: str
  system_id: Optional[str] = None
  delivered_at: datetime
  created_at: datetime
  updated_at: Optional[datetime] = None
  order_mode: OrderMode
  gas_type: GasType
  cylinders_installed: int
  cylinders_received: int
  price_total: int
  paid_amount: int
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  note: Optional[str] = None
  money_balance_before: Optional[int] = None
  money_balance_after: Optional[int] = None
  cyl_balance_before: Optional[dict[str, int]] = None
  cyl_balance_after: Optional[dict[str, int]] = None
  is_deleted: bool = False


class CollectionCreate(SQLModel):
  customer_id: str
  action_type: Literal["payment", "payout", "return"]
  amount_money: Optional[int] = None
  qty_12kg: Optional[int] = None
  qty_48kg: Optional[int] = None
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  system_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  note: Optional[str] = None
  request_id: Optional[str] = None

  @field_validator("amount_money", "qty_12kg", "qty_48kg")
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)

  @field_validator("system_id")
  @classmethod
  def _validate_system_id(cls, value: Optional[str]) -> Optional[str]:
    if value is not None:
      raise ValueError("system_not_allowed")
    return value


class CollectionUpdate(SQLModel):
  action_type: Optional[Literal["payment", "payout", "return"]] = None
  amount_money: Optional[int] = None
  qty_12kg: Optional[int] = None
  qty_48kg: Optional[int] = None
  debt_cash: Optional[int] = None
  debt_cylinders_12: Optional[int] = None
  debt_cylinders_48: Optional[int] = None
  system_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  note: Optional[str] = None

  @field_validator("amount_money", "qty_12kg", "qty_48kg")
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)

  @field_validator("system_id")
  @classmethod
  def _validate_system_id(cls, value: Optional[str]) -> Optional[str]:
    if value is not None:
      raise ValueError("system_not_allowed")
    return value


class CollectionEvent(SQLModel):
  id: str
  customer_id: str
  action_type: Literal["payment", "payout", "return"]
  amount_money: Optional[int] = None
  qty_12kg: Optional[int] = None
  qty_48kg: Optional[int] = None
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  system_id: Optional[str] = None
  created_at: datetime
  effective_at: datetime
  note: Optional[str] = None
  is_deleted: bool = False
