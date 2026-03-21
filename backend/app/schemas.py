from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel

GasType = Literal["12kg", "48kg"]
OrderMode = Literal["replacement", "sell_iron", "buy_iron"]
InventoryAdjustReason = Literal["count_correction", "shrinkage", "damage"]
TransferDirection = Literal["wallet_to_bank", "bank_to_wallet"]


def new_id(prefix: str = "") -> str:
  return f"{prefix}{uuid4()}"


def _non_negative(value: Optional[int], field_name: str) -> Optional[int]:
  if value is None:
    return value
  if value < 0:
    raise ValueError(f"{field_name}_must_be_non_negative")
  return value


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
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  note: Optional[str] = None
  money_balance_before: Optional[int] = None
  money_balance_after: Optional[int] = None
  cyl_balance_before: Optional[dict[str, int]] = None
  cyl_balance_after: Optional[dict[str, int]] = None


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


class PriceCreate(SQLModel):
  gas_type: GasType
  selling_price: int
  buying_price: int = 0
  selling_iron_price: int = 0
  buying_iron_price: int = 0
  effective_from: Optional[datetime] = None


class PriceOut(SQLModel):
  id: str
  gas_type: GasType
  selling_price: int
  buying_price: int
  selling_iron_price: int
  buying_iron_price: int
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

  @field_validator("quantity")
  @classmethod
  def _validate_non_negative(cls, value: Optional[int], info) -> Optional[int]:
    return _non_negative(value, info.field_name)


class CompanyCylinderSettleOut(SQLModel):
  id: str
  happened_at: datetime
  gas_type: GasType
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
  reason: InventoryAdjustReason
  note: Optional[str] = None
  request_id: Optional[str] = None


class InventoryAdjustUpdate(SQLModel):
  delta_full: Optional[int] = None
  delta_empty: Optional[int] = None
  reason: Optional[InventoryAdjustReason] = None
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
  buy12: int
  return12: int
  buy48: int
  return48: int
  new12: int = 0
  new48: int = 0
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  is_deleted: bool = False
  deleted_at: Optional[datetime] = None


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


class DailyReportV2CashMath(SQLModel):
  sales: int = 0
  late: int = 0
  expenses: int = 0
  company: int = 0
  adjust: int = 0
  other: int = 0


class DailyReportV2MathCustomers(SQLModel):
  sales_cash: int = 0
  paid_earlier: int = 0
  extra_paid: int = 0


class DailyReportV2MathCompany(SQLModel):
  paid_company: int = 0
  extra_company: int = 0


class DailyReportV2MathResult(SQLModel):
  expenses: int = 0
  adjustments: int = 0
  pocket_delta: int = 0


class DailyReportV2Math(SQLModel):
  customers: DailyReportV2MathCustomers = Field(default_factory=DailyReportV2MathCustomers)
  company: DailyReportV2MathCompany = Field(default_factory=DailyReportV2MathCompany)
  result: DailyReportV2MathResult = Field(default_factory=DailyReportV2MathResult)


class BalanceTransition(SQLModel):
  scope: Literal["customer", "company"]
  component: Literal["money", "cyl_12", "cyl_48"]
  before: int = 0
  after: int = 0
  display_name: Optional[str] = None
  display_description: Optional[str] = None
  intent: Optional[str] = None


class DailyReportV2Card(SQLModel):
  date: str
  cash_start: int
  cash_end: int
  sold_12kg: int = 0
  sold_48kg: int = 0
  net_today: int = 0
  cash_math: DailyReportV2CashMath = Field(default_factory=DailyReportV2CashMath)
  math: Optional[DailyReportV2Math] = None
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
  inventory_start: ReportInventoryTotals
  inventory_end: ReportInventoryTotals
  problems: list[str] = Field(default_factory=list)
  problem_transitions: list["BalanceTransition"] = Field(default_factory=list)
  recalculated: bool = False


class Level3Counterparty(SQLModel):
  type: Literal["customer", "company", "none"]
  display_name: Optional[str] = None
  description: Optional[str] = None
  display: Optional[str] = None


class Level3System(SQLModel):
  display_name: str


class Level3Hero(SQLModel):
  text: str


class Level3Money(SQLModel):
  verb: Literal["received", "paid", "none"]
  amount: int


class Level3SettlementComponents(SQLModel):
  money: bool
  cyl12: bool
  cyl48: bool


class Level3Settlement(SQLModel):
  scope: Literal["customer", "company", "none"]
  is_settled: bool
  components: Optional[Level3SettlementComponents] = None


class Level3Action(SQLModel):
  category: Literal["money", "cylinders"]
  direction: Literal[
    "customer_pays",
    "pay_customer",
    "pay_company",
    "company_pays",
    "customer_returns_empty",
    "return_empty_to_company",
    "deliver_full_to_customer",
    "company_delivers_full_to_you",
    "customer->dist",
    "dist->customer",
    "dist->company",
    "company->dist",
  ]
  amount: Optional[int] = None
  gas_type: Optional[Literal["12", "48"]] = None
  qty: Optional[int] = None
  unit: Optional[Literal["empty", "full"]] = None
  kind: Optional[Literal["money", "empty_12", "empty_48", "full_12", "full_48"]] = None
  severity: Optional[Literal["warning", "danger"]] = None
  text: Optional[str] = None


class ActivityNote(SQLModel):
  kind: Literal["money", "cyl_12", "cyl_48", "cyl_full_12", "cyl_full_48"]
  direction: Literal[
    "customer_pays_you",
    "you_pay_customer",
    "you_paid_customer_earlier",
    "customer_paid_earlier",
    "customer_extra_paid",
    "you_pay_company",
    "you_paid_earlier",
    "company_pays_you",
    "customer_returns_you",
    "you_return_company",
    "you_returned_earlier",
    "you_deliver_customer",
    "company_delivers_you",
  ]
  remaining_after: int
  remaining_before: Optional[int] = None


class DailyReportV2Event(SQLModel):
  event_type: str
  id: Optional[str] = None
  effective_at: datetime
  created_at: datetime
  source_id: Optional[str] = None
  display_name: Optional[str] = None
  display_description: Optional[str] = None
  time_display: Optional[str] = None
  event_kind: Optional[str] = None
  activity_type: Optional[str] = None
  hero_primary: Optional[str] = None
  money_delta: Optional[int] = None
  status: Optional[Literal["atomic_ok", "needs_action", "balance_settled"]] = None
  context_line: Optional[str] = None
  notes: list[ActivityNote] = Field(default_factory=list)
  label: Optional[str] = None
  label_short: Optional[str] = None
  is_balanced: Optional[bool] = None
  action_lines: list[str] = Field(default_factory=list)
  status_mode: Optional[Literal["atomic", "settlement"]] = None
  is_ok: Optional[bool] = None
  is_atomic_ok: Optional[bool] = None
  status_badge: Optional[Literal["OK", "Balance settled"]] = None
  action_pills: list[Level3Action] = Field(default_factory=list)
  remaining_actions: list[Level3Action] = Field(default_factory=list)
  has_other_outstanding_cylinders: Optional[bool] = None
  has_other_outstanding_cash: Optional[bool] = None
  counterparty: Optional[Level3Counterparty] = None
  counterparty_display: Optional[str] = None
  system: Optional[Level3System] = None
  hero: Optional[Level3Hero] = None
  hero_text: Optional[str] = None
  money: Optional[Level3Money] = None
  money_amount: Optional[int] = None
  money_direction: Optional[Literal["in", "out", "none"]] = None
  money_received: Optional[int] = None
  settlement: Optional[Level3Settlement] = None
  open_actions: list[Level3Action] = Field(default_factory=list)
  order_mode: Optional[OrderMode] = None
  gas_type: Optional[GasType] = None
  customer_id: Optional[str] = None
  customer_name: Optional[str] = None
  customer_description: Optional[str] = None
  system_name: Optional[str] = None
  system_type: Optional[str] = None
  expense_type: Optional[str] = None
  transfer_direction: Optional[TransferDirection] = None
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
  bank_before: Optional[int] = None
  bank_after: Optional[int] = None
  customer_money_before: Optional[int] = None
  customer_money_after: Optional[int] = None
  customer_12kg_before: Optional[int] = None
  customer_12kg_after: Optional[int] = None
  customer_48kg_before: Optional[int] = None
  customer_48kg_after: Optional[int] = None
  company_before: Optional[int] = None
  company_after: Optional[int] = None
  company_12kg_before: Optional[int] = None
  company_12kg_after: Optional[int] = None
  company_48kg_before: Optional[int] = None
  company_48kg_after: Optional[int] = None
  inventory_before: Optional[ReportInventoryState] = None
  inventory_after: Optional[ReportInventoryState] = None
  balance_transitions: list[BalanceTransition] = Field(default_factory=list)


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
  inventory_start: ReportInventoryTotals
  inventory_end: ReportInventoryTotals
  audit_summary: DailyAuditSummary
  events: list[DailyReportV2Event]

