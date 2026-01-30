from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel

GasType = Literal["12kg", "48kg"]
OrderMode = Literal["replacement", "sell_iron", "buy_iron"]


def new_id(prefix: str = "") -> str:
  return f"{prefix}{uuid4()}"


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
  created_at: datetime


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


class SystemInitialize(SQLModel):
  sell_price_12: int
  sell_price_48: int
  buy_price_12: int = 0
  buy_price_48: int = 0
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


class OrderCreate(SQLModel):
  customer_id: str
  system_id: str
  happened_at: Optional[datetime] = None
  order_mode: OrderMode = "replacement"
  gas_type: GasType
  cylinders_installed: int
  cylinders_received: int
  price_total: int
  paid_amount: Optional[int] = None
  note: Optional[str] = None
  request_id: Optional[str] = None


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
  note: Optional[str] = None


class OrderOut(SQLModel):
  id: str
  customer_id: str
  system_id: str
  delivered_at: datetime
  created_at: datetime
  updated_at: Optional[datetime] = None
  order_mode: OrderMode
  gas_type: GasType
  cylinders_installed: int
  cylinders_received: int
  price_total: int
  paid_amount: int
  note: Optional[str] = None
  money_balance_before: Optional[int] = None
  money_balance_after: Optional[int] = None
  cyl_balance_before: Optional[dict[str, int]] = None
  cyl_balance_after: Optional[dict[str, int]] = None


class CollectionCreate(SQLModel):
  customer_id: str
  action_type: Literal["payment", "return"]
  amount_money: Optional[int] = None
  qty_12kg: Optional[int] = None
  qty_48kg: Optional[int] = None
  system_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  note: Optional[str] = None
  request_id: Optional[str] = None


class CollectionUpdate(SQLModel):
  action_type: Optional[Literal["payment", "return"]] = None
  amount_money: Optional[int] = None
  qty_12kg: Optional[int] = None
  qty_48kg: Optional[int] = None
  system_id: Optional[str] = None
  happened_at: Optional[datetime] = None
  note: Optional[str] = None


class CollectionEvent(SQLModel):
  id: str
  customer_id: str
  action_type: Literal["payment", "return"]
  amount_money: Optional[int] = None
  qty_12kg: Optional[int] = None
  qty_48kg: Optional[int] = None
  system_id: Optional[str] = None
  created_at: datetime
  effective_at: datetime
  note: Optional[str] = None


class PriceCreate(SQLModel):
  gas_type: GasType
  selling_price: int
  buying_price: int = 0
  effective_from: Optional[datetime] = None


class PriceOut(SQLModel):
  id: str
  gas_type: GasType
  selling_price: int
  buying_price: int
  effective_from: datetime
  created_at: datetime


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
  day: date
  kind: str
  category_id: Optional[str] = None
  amount: int
  paid_from: Optional[str] = None
  note: Optional[str] = None
  vendor: Optional[str] = None
  is_reversed: bool


class ExpenseCreateLegacy(SQLModel):
  date: str
  expense_type: str
  amount: int
  note: Optional[str] = None
  request_id: Optional[str] = None
  happened_at: Optional[datetime] = None


class ExpenseOutLegacy(SQLModel):
  id: str
  date: str
  expense_type: str
  amount: int
  note: Optional[str] = None
  created_at: Optional[datetime] = None
  created_by: Optional[str] = None


class CompanyCylinderSettleCreate(SQLModel):
  gas_type: GasType
  quantity: int
  direction: Literal["receive_full", "return_empty"]
  happened_at: Optional[datetime] = None
  note: Optional[str] = None
  request_id: Optional[str] = None


class CompanyCylinderSettleOut(SQLModel):
  id: str
  happened_at: datetime
  gas_type: GasType
  quantity: int
  direction: Literal["receive_full", "return_empty"]
  note: Optional[str] = None


class BankDepositCreate(SQLModel):
  happened_at: Optional[datetime] = None
  amount: int
  note: Optional[str] = None
  request_id: Optional[str] = None


class BankDepositOut(SQLModel):
  id: str
  happened_at: datetime
  amount: int
  note: Optional[str] = None


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


class InventoryAdjustCreate(SQLModel):
  happened_at: Optional[datetime] = None
  gas_type: GasType
  delta_full: int = 0
  delta_empty: int = 0
  reason: str
  note: Optional[str] = None
  request_id: Optional[str] = None


class InventoryAdjustUpdate(SQLModel):
  delta_full: Optional[int] = None
  delta_empty: Optional[int] = None
  reason: Optional[str] = None
  note: Optional[str] = None


class InventoryAdjustmentRow(SQLModel):
  id: str
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


class InventoryRefillCreate(SQLModel):
  happened_at: Optional[datetime] = None
  buy12: int = 0
  return12: int = 0
  buy48: int = 0
  return48: int = 0
  total_cost: int = 0
  paid_now: int = 0
  note: Optional[str] = None
  new12: int = 0
  new48: int = 0
  request_id: Optional[str] = None


class InventoryRefillSummary(SQLModel):
  refill_id: str
  date: str
  time_of_day: Optional[Literal["morning", "evening"]] = None
  effective_at: datetime
  buy12: int
  return12: int
  buy48: int
  return48: int
  new12: int = 0
  new48: int = 0
  is_deleted: bool = False
  deleted_at: Optional[datetime] = None


class InventoryRefillUpdate(SQLModel):
  buy12: int = 0
  return12: int = 0
  buy48: int = 0
  return48: int = 0
  total_cost: int = 0
  paid_now: int = 0
  note: Optional[str] = None
  new12: int = 0
  new48: int = 0


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
  notes: Optional[str] = None
  is_deleted: bool = False
  deleted_at: Optional[datetime] = None


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


class DailyAuditSummary(SQLModel):
  cash_in: int
  new_debt: int
  inv_delta_12: int
  inv_delta_48: int


class DailyReportV2Card(SQLModel):
  date: str
  cash_start: int
  cash_end: int
  company_start: int = 0
  company_end: int = 0
  company_12kg_start: int = 0
  company_12kg_end: int = 0
  company_48kg_start: int = 0
  company_48kg_end: int = 0
  company_give_start: int = 0
  company_give_end: int = 0
  company_receive_start: int = 0
  company_receive_end: int = 0
  company_12kg_give_start: int = 0
  company_12kg_give_end: int = 0
  company_12kg_receive_start: int = 0
  company_12kg_receive_end: int = 0
  company_48kg_give_start: int = 0
  company_48kg_give_end: int = 0
  company_48kg_receive_start: int = 0
  company_48kg_receive_end: int = 0
  customer_money_receivable: int = 0
  customer_money_payable: int = 0
  customer_12kg_receivable: int = 0
  customer_12kg_payable: int = 0
  customer_48kg_receivable: int = 0
  customer_48kg_payable: int = 0
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
  label_short: Optional[str] = None
  order_mode: Optional[OrderMode] = None
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
  total_cost: Optional[int] = None
  paid_now: Optional[int] = None
  order_total: Optional[int] = None
  order_paid: Optional[int] = None
  order_installed: Optional[int] = None
  order_received: Optional[int] = None
  cash_before: Optional[int] = None
  cash_after: Optional[int] = None
  company_before: Optional[int] = None
  company_after: Optional[int] = None
  company_12kg_before: Optional[int] = None
  company_12kg_after: Optional[int] = None
  company_48kg_before: Optional[int] = None
  company_48kg_after: Optional[int] = None
  inventory_before: Optional[ReportInventoryState] = None
  inventory_after: Optional[ReportInventoryState] = None


class DailyReportV2Day(SQLModel):
  date: str
  cash_start: int
  cash_end: int
  company_start: int = 0
  company_end: int = 0
  company_12kg_start: int = 0
  company_12kg_end: int = 0
  company_48kg_start: int = 0
  company_48kg_end: int = 0
  company_give_start: int = 0
  company_give_end: int = 0
  company_receive_start: int = 0
  company_receive_end: int = 0
  company_12kg_give_start: int = 0
  company_12kg_give_end: int = 0
  company_12kg_receive_start: int = 0
  company_12kg_receive_end: int = 0
  company_48kg_give_start: int = 0
  company_48kg_give_end: int = 0
  company_48kg_receive_start: int = 0
  company_48kg_receive_end: int = 0
  customer_money_receivable: int = 0
  customer_money_payable: int = 0
  customer_12kg_receivable: int = 0
  customer_12kg_payable: int = 0
  customer_48kg_receivable: int = 0
  customer_48kg_payable: int = 0
  inventory_start: ReportInventoryTotals
  inventory_end: ReportInventoryTotals
  audit_summary: DailyAuditSummary
  events: list[DailyReportV2Event]
