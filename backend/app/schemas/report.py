from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from sqlmodel import Field, SQLModel

from .common import GasType, OrderMode


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
  wallet_in: int
  new_debt: int
  inv_delta_12: int
  inv_delta_48: int


class DailyReportWalletMath(SQLModel):
  sales: int = 0
  late: int = 0
  expenses: int = 0
  company: int = 0
  adjust: int = 0
  other: int = 0



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
  wallet_end: int
  sold_12kg: int = 0
  sold_48kg: int = 0
  net_today: int = 0
  has_refill: bool = False
  wallet_math: DailyReportWalletMath = Field(default_factory=DailyReportWalletMath)
  company_start: int = 0
  company_end: int = 0
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



class Level3Money(SQLModel):
  verb: Literal["received", "paid", "none"]
  amount: int



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
  # Timestamp semantics for report events:
  # - effective_at: report-facing alias of the source row's business/event time
  #   (`happened_at` in the database). This is the primary ordering key for the
  #   daily report.
  # - created_at: audit insertion time of the source row. This is useful as a
  #   secondary tiebreaker and for debugging, but it is not the business time.
  event_type: str
  id: Optional[str] = None
  effective_at: datetime
  created_at: datetime
  source_id: Optional[str] = None
  display_name: Optional[str] = None
  display_description: Optional[str] = None
  hero_primary: Optional[str] = None
  money_delta: Optional[int] = None
  context_line: Optional[str] = None
  notes: list[ActivityNote] = Field(default_factory=list)
  label: Optional[str] = None
  counterparty: Optional[Level3Counterparty] = None
  system: Optional[Level3System] = None
  hero_text: Optional[str] = None
  money: Optional[Level3Money] = None
  money_amount: Optional[int] = None
  money_direction: Optional[Literal["in", "out", "none"]] = None
  money_received: Optional[int] = None
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
  paid_amount: Optional[int] = None
  order_total: Optional[int] = None
  order_paid: Optional[int] = None
  order_installed: Optional[int] = None
  order_received: Optional[int] = None
  wallet_before: Optional[int] = None
  wallet_after: Optional[int] = None
  customer_money_before: Optional[int] = None
  customer_money_after: Optional[int] = None
  customer_12kg_before: Optional[int] = None
  customer_12kg_after: Optional[int] = None
  customer_48kg_before: Optional[int] = None
  customer_48kg_after: Optional[int] = None
  company_before: Optional[int] = None
  company_after: Optional[int] = None
  inventory_before: Optional[ReportInventoryState] = None
  inventory_after: Optional[ReportInventoryState] = None
  balance_transitions: list[BalanceTransition] = Field(default_factory=list)


class DailyReportDay(SQLModel):
  date: str
  wallet_end: int
  company_start: int = 0
  company_end: int = 0
  inventory_end: ReportInventoryTotals
  audit_summary: DailyAuditSummary
  events: list[DailyReportEvent]
