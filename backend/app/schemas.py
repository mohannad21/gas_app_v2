from datetime import datetime
from typing import Literal, Optional
from uuid import uuid4

from sqlmodel import SQLModel

GasType = Literal["12kg", "48kg"]
CustomerType = Literal["private", "industrial", "other"]
SystemType = Literal["main_kitchen", "side_kitchen", "oven", "restaurant", "other"]
PriceCustomerType = Literal["any", "private", "industrial", "other"]


def new_id(prefix: str) -> str:
  return f"{prefix}{uuid4()}"


class CustomerCreate(SQLModel):
  name: str
  phone: str
  customer_type: CustomerType = "other"
  notes: Optional[str] = None


class CustomerUpdate(SQLModel):
  name: Optional[str] = None
  phone: Optional[str] = None
  customer_type: Optional[CustomerType] = None
  notes: Optional[str] = None


class SystemCreate(SQLModel):
  customer_id: str
  name: str
  location: Optional[str] = None
  system_type: SystemType = "other"
  gas_type: GasType = "12kg"
  system_customer_type: CustomerType = "private"
  security_required: bool = False
  last_security_check_at: Optional[datetime] = None
  next_security_due_at: Optional[datetime] = None
  security_status: Optional[str] = None
  is_active: bool = True
  require_security_check: bool = False
  security_check_exists: bool = False
  security_check_date: Optional[datetime] = None


class SystemUpdate(SQLModel):
  name: Optional[str] = None
  location: Optional[str] = None
  system_type: Optional[SystemType] = None
  gas_type: Optional[GasType] = None
  system_customer_type: Optional[CustomerType] = None
  security_required: Optional[bool] = None
  last_security_check_at: Optional[datetime] = None
  next_security_due_at: Optional[datetime] = None
  security_status: Optional[str] = None
  customer_id: Optional[str] = None
  is_active: Optional[bool] = None
  require_security_check: Optional[bool] = None
  security_check_exists: Optional[bool] = None
  security_check_date: Optional[datetime] = None


class OrderCreate(SQLModel):
  customer_id: str
  system_id: str
  delivered_at: Optional[datetime] = None
  gas_type: GasType
  cylinders_installed: int
  cylinders_received: int
  price_total: float
  paid_amount: float
  note: Optional[str] = None


class OrderUpdate(SQLModel):
  customer_id: Optional[str] = None
  system_id: Optional[str] = None
  delivered_at: Optional[datetime] = None
  gas_type: Optional[GasType] = None
  cylinders_installed: Optional[int] = None
  cylinders_received: Optional[int] = None
  price_total: Optional[float] = None
  paid_amount: Optional[float] = None
  note: Optional[str] = None


class PriceCreate(SQLModel):
  gas_type: GasType
  customer_type: PriceCustomerType
  selling_price: float
  buying_price: Optional[float] = None
  effective_from: Optional[datetime] = None


class DailyReportOrder(SQLModel):
  id: str
  customer: str
  system: str
  gas: GasType
  total: float
  paid: float
  installed: int
  receivedCyl: int
  note: Optional[str] = None


class DailyReportRow(SQLModel):
  date: str
  display: str
  installed12: int
  received12: int
  installed48: int
  received48: int
  expected: float
  received: float
  orders: Optional[list[DailyReportOrder]] = None
