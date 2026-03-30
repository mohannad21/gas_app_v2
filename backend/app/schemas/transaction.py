from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import field_validator
from sqlmodel import SQLModel

from .common import TransferDirection, _non_negative


class CashAdjustCreate(SQLModel):
  happened_at: Optional[datetime] = None
  delta_cash: int
  reason: Optional[str] = None
  request_id: Optional[str] = None


class CashAdjustUpdate(SQLModel):
  delta_cash: Optional[int] = None
  reason: Optional[str] = None


class CashAdjustmentRow(SQLModel):
  id: str
  delta_cash: int
  reason: Optional[str] = None
  effective_at: datetime
  created_at: datetime
  is_deleted: bool = False


class ExpenseCategoryCreate(SQLModel):
  name: str


class ExpenseCategoryOut(SQLModel):
  id: str
  name: str
  is_active: bool
  created_at: datetime


class ExpenseCreate(SQLModel):
  happened_at: Optional[datetime] = None
  kind: Literal["expense", "deposit"]
  category_id: Optional[str] = None
  amount: int
  paid_from: Optional[Literal["cash", "bank"]] = None
  note: Optional[str] = None
  vendor: Optional[str] = None
  request_id: Optional[str] = None


class ExpenseOut(SQLModel):
  id: str
  happened_at: datetime
  day: datetime
  kind: str
  category_id: Optional[str] = None
  amount: int
  paid_from: Optional[str] = None
  note: Optional[str] = None
  vendor: Optional[str] = None
  is_reversed: bool
  is_deleted: bool = False


class ExpenseCreateLegacy(SQLModel):
  date: str
  expense_type: str
  amount: int
  note: Optional[str] = None
  request_id: Optional[str] = None
  happened_at: Optional[datetime] = None


class ExpenseUpdate(SQLModel):
  date: Optional[str] = None
  expense_type: Optional[str] = None
  amount: Optional[int] = None
  note: Optional[str] = None
  happened_at: Optional[datetime] = None


class ExpenseOutLegacy(SQLModel):
  id: str
  date: str
  expense_type: str
  amount: int
  note: Optional[str] = None
  created_at: Optional[datetime] = None
  created_by: Optional[str] = None
  is_deleted: bool = False


class CompanyCylinderSettleCreate(SQLModel):
  gas_type: str
  quantity: int
  direction: Literal["receive_full", "return_empty"]
  happened_at: Optional[datetime] = None
  note: Optional[str] = None
  request_id: Optional[str] = None

  @field_validator("quantity")
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class CompanyCylinderSettleOut(SQLModel):
  id: str
  happened_at: datetime
  gas_type: str
  quantity: int
  direction: Literal["receive_full", "return_empty"]
  note: Optional[str] = None


class CompanyPaymentCreate(SQLModel):
  amount: int
  note: Optional[str] = None
  request_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  date: Optional[str] = None
  time: Optional[str] = None
  time_of_day: Optional[Literal["morning", "evening"]] = None
  at: Optional[str] = None


class CompanyPaymentOut(SQLModel):
  id: str
  happened_at: datetime
  amount: int
  note: Optional[str] = None
  is_deleted: bool = False


class CompanyBuyIronCreate(SQLModel):
  new12: int = 0
  new48: int = 0
  total_cost: int = 0
  paid_now: int = 0
  note: Optional[str] = None
  request_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  date: Optional[str] = None
  time: Optional[str] = None
  time_of_day: Optional[Literal["morning", "evening"]] = None
  at: Optional[str] = None

  @field_validator("new12", "new48", "total_cost", "paid_now")
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class CompanyBuyIronOut(SQLModel):
  id: str
  happened_at: datetime
  new12: int
  new48: int
  total_cost: int
  paid_now: int
  note: Optional[str] = None


class CompanyBalanceAdjustmentCreate(SQLModel):
  money_balance: int = 0
  cylinder_balance_12: int = 0
  cylinder_balance_48: int = 0
  note: Optional[str] = None
  request_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  date: Optional[str] = None
  time: Optional[str] = None
  time_of_day: Optional[Literal["morning", "evening"]] = None
  at: Optional[str] = None


class CompanyBalanceAdjustmentOut(SQLModel):
  id: str
  happened_at: datetime
  money_balance: int
  cylinder_balance_12: int
  cylinder_balance_48: int
  note: Optional[str] = None


class CompanyBalancesOut(SQLModel):
  company_money: int
  company_cyl_12: int
  company_cyl_48: int
  inventory_full_12: int
  inventory_empty_12: int
  inventory_full_48: int
  inventory_empty_48: int


class BankDepositCreate(SQLModel):
  happened_at: Optional[datetime] = None
  amount: int
  direction: TransferDirection = "wallet_to_bank"
  note: Optional[str] = None
  request_id: Optional[str] = None

  @field_validator("amount")
  @classmethod
  def _validate_amount(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class BankDepositOut(SQLModel):
  id: str
  happened_at: datetime
  amount: int
  direction: TransferDirection
  note: Optional[str] = None
  is_deleted: bool = False
