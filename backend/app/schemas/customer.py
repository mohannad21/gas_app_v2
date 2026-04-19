from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel


class CustomerCreate(SQLModel):
  name: str
  phone: Optional[str] = None
  address: Optional[str] = None
  note: Optional[str] = None


class CustomerUpdate(SQLModel):
  name: Optional[str] = None
  phone: Optional[str] = None
  address: Optional[str] = None
  note: Optional[str] = None


class CustomerAdjustmentCreate(SQLModel):
  customer_id: str
  amount_money: int = 0
  count_12kg: int = 0
  count_48kg: int = 0
  reason: Optional[str] = None
  happened_at: Optional[datetime] = None
  request_id: Optional[str] = None


class CustomerAdjustmentOut(SQLModel):
  id: str
  customer_id: str
  amount_money: int
  count_12kg: int
  count_48kg: int
  reason: Optional[str] = None
  effective_at: datetime
  created_at: datetime
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  live_debt_cash: Optional[int] = None
  live_debt_cylinders_12: Optional[int] = None
  live_debt_cylinders_48: Optional[int] = None


class CustomerOut(SQLModel):
  id: str
  name: str
  phone: Optional[str] = None
  address: Optional[str] = None
  note: Optional[str] = None
  created_at: datetime
  money_balance: int = 0
  cylinder_balance_12kg: int = 0
  cylinder_balance_48kg: int = 0
  order_count: int = 0


class CustomerBalanceOut(SQLModel):
  customer_id: str
  money_balance: int = 0
  cylinder_balance_12kg: int = 0
  cylinder_balance_48kg: int = 0
  order_count: int = 0
