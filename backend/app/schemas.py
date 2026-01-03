from datetime import datetime
from typing import Literal, Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel

GasType = Literal["12kg", "48kg"]
CustomerType = Literal["private", "industrial", "other"]
SystemType = Literal["main_kitchen", "side_kitchen", "oven", "restaurant", "other"]
PriceCustomerType = Literal["any", "private", "industrial", "other"]


def new_id(prefix: str) -> str:
  return f"{prefix}{uuid4()}"


class CustomerCreate(SQLModel):
  name: str
  phone: Optional[str] = None
  customer_type: CustomerType = "other"
  notes: Optional[str] = None
  starting_money: Optional[float] = None
  starting_12kg: Optional[int] = None
  starting_48kg: Optional[int] = None
  starting_reason: Optional[str] = "onboarding"


class CustomerUpdate(SQLModel):
  name: Optional[str] = None
  phone: Optional[str] = None
  customer_type: Optional[CustomerType] = None
  notes: Optional[str] = None


class CustomerAdjustmentCreate(SQLModel):
  customer_id: str
  amount_money: float = 0
  count_12kg: int = 0
  count_48kg: int = 0
  reason: str = "onboarding"
  is_inventory_neutral: Optional[bool] = None


class CustomerAdjustmentUpdate(SQLModel):
  customer_id: Optional[str] = None
  amount_money: Optional[float] = None
  count_12kg: Optional[int] = None
  count_48kg: Optional[int] = None
  reason: Optional[str] = None
  is_inventory_neutral: Optional[bool] = None


class SystemCreate(SQLModel):
  customer_id: str
  name: str
  location: Optional[str] = None
  system_type: SystemType = "other"
  gas_type: GasType = "12kg"
  system_customer_type: CustomerType = "private"
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
  paid_amount: Optional[float] = None
  money_received: Optional[float] = None
  money_given: Optional[float] = None
  note: Optional[str] = None
  client_request_id: Optional[str] = None


class OrderUpdate(SQLModel):
  customer_id: Optional[str] = None
  system_id: Optional[str] = None
  delivered_at: Optional[datetime] = None
  gas_type: Optional[GasType] = None
  cylinders_installed: Optional[int] = None
  cylinders_received: Optional[int] = None
  price_total: Optional[float] = None
  paid_amount: Optional[float] = None
  money_received: Optional[float] = None
  money_given: Optional[float] = None
  note: Optional[str] = None


class PriceCreate(SQLModel):
  gas_type: GasType
  customer_type: PriceCustomerType
  selling_price: float
  buying_price: Optional[float] = None
  effective_from: Optional[datetime] = None


class ExpenseCreate(SQLModel):
  date: str
  expense_type: str
  amount: float
  note: Optional[str] = None
  created_by: Optional[str] = None


class InventorySnapshot(SQLModel):
  as_of: datetime
  full12: int
  empty12: int
  total12: int
  full48: int
  empty48: int
  total48: int
  reason: Optional[str] = None


class InventoryInit(SQLModel):
  date: Optional[str] = None
  full12: int
  empty12: int
  full48: int
  empty48: int
  reason: Optional[str] = "initial"


class InventoryRefillCreate(SQLModel):
  date: str
  time_of_day: Optional[Literal["morning", "evening"]] = None
  time: Optional[str] = None
  effective_at: Optional[datetime] = None
  buy12: int = 0
  return12: int = 0
  buy48: int = 0
  return48: int = 0
  reason: Optional[str] = None
  allow_negative: bool = False
  total_cost: Optional[float] = None
  paid_now: Optional[float] = None


class InventoryRefillSummary(SQLModel):
  refill_id: str
  date: str
  time_of_day: Literal["morning", "evening"]
  effective_at: datetime
  buy12: int
  return12: int
  buy48: int
  return48: int


class InventoryRefillUpdate(SQLModel):
  buy12: int = 0
  return12: int = 0
  buy48: int = 0
  return48: int = 0
  reason: Optional[str] = None
  allow_negative: bool = False
  total_cost: Optional[float] = None
  paid_now: Optional[float] = None


class InventoryRefillDetails(SQLModel):
  refill_id: str
  business_date: str
  time_of_day: Literal["morning", "evening"]
  effective_at: datetime
  buy12: int
  return12: int
  buy48: int
  return48: int
  total_cost: float
  paid_now: float
  unit_price_buy_12: Optional[float] = None
  unit_price_buy_48: Optional[float] = None
  before_full_12: int
  before_empty_12: int
  after_full_12: int
  after_empty_12: int
  before_full_48: int
  before_empty_48: int
  after_full_48: int
  after_empty_48: int


class InventoryAdjustCreate(SQLModel):
  date: Optional[str] = None
  gas_type: Literal["12kg", "48kg"]
  delta_full: int = 0
  delta_empty: int = 0
  reason: str
  note: Optional[str] = None
  allow_negative: bool = False


class InventoryDayGasSummary(SQLModel):
  gas_type: GasType
  business_date: str
  day_start_full: int
  day_start_empty: int
  day_end_full: int
  day_end_empty: int


class InventoryDayEvent(SQLModel):
  id: str
  gas_type: GasType
  effective_at: datetime = Field(description="UTC-naive timestamp (stored as UTC)")
  created_at: datetime = Field(description="UTC-naive timestamp (stored as UTC)")
  source_type: str
  source_id: Optional[str] = None
  reason: Optional[str] = None
  delta_full: int
  delta_empty: int
  before_full: int
  before_empty: int
  after_full: int
  after_empty: int


class InventoryDayResponse(SQLModel):
  business_date: str
  business_tz: str
  summaries: list[InventoryDayGasSummary]
  events: list[InventoryDayEvent]


class InventoryDeltaRow(SQLModel):
  id: str
  gas_type: GasType
  effective_at: datetime = Field(description="UTC-naive timestamp (stored as UTC)")
  created_at: datetime = Field(description="UTC-naive timestamp (stored as UTC)")
  source_type: str
  source_id: Optional[str] = None
  reason: Optional[str] = None
  delta_full: int
  delta_empty: int
  business_date: str


class InventoryDeltaListResponse(SQLModel):
  from_date: str
  to_date: str
  gas_type: Optional[GasType] = None
  items: list[InventoryDeltaRow]


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
  inventory_start: Optional[InventorySnapshot] = None
  inventory_end: Optional[InventorySnapshot] = None


class CashInitCreate(SQLModel):
  date: str
  cash_start: float
  reason: Optional[str] = None


class CashAdjustCreate(SQLModel):
  date: Optional[str] = None
  delta_cash: float
  reason: Optional[str] = None


class BankDepositCreate(SQLModel):
  date: str
  amount: float
  note: Optional[str] = None
  time_of_day: Optional[Literal["morning", "evening"]] = None


class ReportInventoryTotals(SQLModel):
  full12: int
  empty12: int
  full48: int
  empty48: int


class ReportInventoryState(SQLModel):
  full12: Optional[int] = None
  empty12: Optional[int] = None
  full48: Optional[int] = None
  empty48: Optional[int] = None


class DailyReportV2Card(SQLModel):
  date: str
  cash_start: float
  cash_end: float
  company_start: float = 0
  company_end: float = 0
  inventory_start: ReportInventoryTotals
  inventory_end: ReportInventoryTotals
  problems: Optional[list[str]] = None
  recalculated: bool = False


class DailyReportV2Event(SQLModel):
  event_type: str
  effective_at: datetime
  created_at: datetime
  source_id: Optional[str] = None
  label: Optional[str] = None
  gas_type: Optional[GasType] = None
  customer_id: Optional[str] = None
  customer_name: Optional[str] = None
  customer_description: Optional[str] = None
  system_name: Optional[str] = None
  system_type: Optional[str] = None
  expense_type: Optional[str] = None
  reason: Optional[str] = None
  buy12: Optional[int] = None
  return12: Optional[int] = None
  buy48: Optional[int] = None
  return48: Optional[int] = None
  total_cost: Optional[float] = None
  paid_now: Optional[float] = None
  order_total: Optional[float] = None
  order_paid: Optional[float] = None
  order_installed: Optional[int] = None
  order_received: Optional[int] = None
  unit_price_buy_12: Optional[float] = None
  unit_price_buy_48: Optional[float] = None
  cash_before: float
  cash_after: float
  company_before: Optional[float] = None
  company_after: Optional[float] = None
  inventory_before: Optional[ReportInventoryState] = None
  inventory_after: Optional[ReportInventoryState] = None


class DailyReportV2Day(SQLModel):
  date: str
  cash_start: float
  cash_end: float
  company_start: float = 0
  company_end: float = 0
  inventory_start: ReportInventoryTotals
  inventory_end: ReportInventoryTotals
  events: list[DailyReportV2Event]


class CompanyPaymentCreate(SQLModel):
  date: str
  amount: float
  note: Optional[str] = None
  time_of_day: Optional[Literal["morning", "evening"]] = None
