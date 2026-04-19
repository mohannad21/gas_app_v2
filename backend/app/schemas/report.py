from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from sqlmodel import Field, SQLModel

from .common import GasType, OrderMode, TransferDirection


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


class DailyReportCashMath(SQLModel):
  sales: int = 0
  late: int = 0
  expenses: int = 0
  company: int = 0
  adjust: int = 0
  other: int = 0


class DailyReportMathCustomers(SQLModel):
  sales_cash: int = 0
  paid_earlier: int = 0
  extra_paid: int = 0


class DailyReportMathCompany(SQLModel):
  paid_company: int = 0
  extra_company: int = 0


class DailyReportMathResult(SQLModel):
  expenses: int = 0
  adjustments: int = 0
  pocket_delta: int = 0


class DailyReportMath(SQLModel):
  customers: DailyReportMathCustomers = Field(default_factory=DailyReportMathCustomers)
  company: DailyReportMathCompany = Field(default_factory=DailyReportMathCompany)
  result: DailyReportMathResult = Field(default_factory=DailyReportMathResult)


class BalanceTransition(SQLModel):
  scope: Literal["customer", "company"]
  component: Literal["money", "cyl_12", "cyl_48"]
  before: int = 0
  after: int = 0
  display_name: Optional[str] = None
  display_description: Optional[str] = None
  intent: Optional[str] = None


class DailyReportCard(SQLModel):
  date: str
  cash_start: int
  cash_end: int
  sold_12kg: int = 0
  sold_48kg: int = 0
  net_today: int = 0
  has_refill: bool = False
  cash_math: DailyReportCashMath = Field(default_factory=DailyReportCashMath)
  math: Optional[DailyReportMath] = None
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
  problem_transitions: list[BalanceTransition] = Field(default_factory=list)
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


class DailyReportEvent(SQLModel):
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


class DailyReportDay(SQLModel):
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
  events: list[DailyReportEvent]
