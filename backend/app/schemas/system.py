from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from sqlmodel import Field, SQLModel

from .common import GasType


class SystemCreate(SQLModel):
  customer_id: str
  name: str
  gas_type: GasType
  note: Optional[str] = None
  requires_security_check: bool = False
  security_check_exists: bool = False
  last_security_check_at: Optional[date] = None
  is_active: bool = True


class SystemUpdate(SQLModel):
  customer_id: Optional[str] = None
  name: Optional[str] = None
  gas_type: Optional[GasType] = None
  note: Optional[str] = None
  requires_security_check: Optional[bool] = None
  security_check_exists: Optional[bool] = None
  last_security_check_at: Optional[date] = None
  is_active: Optional[bool] = None


class SystemOut(SQLModel):
  id: str
  customer_id: str
  name: str
  gas_type: GasType
  note: Optional[str] = None
  requires_security_check: bool = False
  security_check_exists: bool = False
  last_security_check_at: Optional[date] = None
  next_security_check_at: Optional[date] = None
  is_active: bool = True
  created_at: datetime


class SystemTypeOptionCreate(SQLModel):
  name: str


class SystemTypeOptionUpdate(SQLModel):
  name: Optional[str] = None
  is_active: Optional[bool] = None


class SystemTypeOptionOut(SQLModel):
  id: str
  name: str
  is_active: bool
  created_at: datetime


class SystemSettingsOut(SQLModel):
  id: str
  is_setup_completed: bool
  currency_code: str
  money_decimals: int
  created_at: datetime


class CustomerOpeningBalance(SQLModel):
  customer_id: str
  money: int = 0
  cyl_12: int = 0
  cyl_48: int = 0


class SystemInitialize(SQLModel):
  sell_price_12: int
  sell_price_48: int
  buy_price_12: int = 0
  buy_price_48: int = 0
  sell_iron_price_12: int = 0
  sell_iron_price_48: int = 0
  buy_iron_price_12: int = 0
  buy_iron_price_48: int = 0
  company_iron_price_12: int = 0
  company_iron_price_48: int = 0
  full_12: int
  empty_12: int
  full_48: int
  empty_48: int
  cash_start: int
  company_payable_money: int = 0
  company_full_12kg: int = 0
  company_empty_12kg: int = 0
  company_full_48kg: int = 0
  company_empty_48kg: int = 0
  currency_code: Optional[str] = None
  money_decimals: Optional[int] = None
  customer_debts: Optional[list[CustomerOpeningBalance]] = None


class LedgerHealthIssue(SQLModel):
  issue_type: Literal["mismatch", "orphan"]
  source_type: str
  source_id: str
  message: str


class SystemHealthCheckOut(SQLModel):
  ok: bool
  checked_at: datetime
  mismatches: int
  orphans: int
  issues: list[LedgerHealthIssue] = Field(default_factory=list)
