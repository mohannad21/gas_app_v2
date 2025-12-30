from datetime import date, datetime, timezone
from typing import Optional
import sqlalchemy as sa
from sqlmodel import Field, SQLModel
from uuid import uuid4

class CustomerAdjustment(SQLModel, table=True):
    __tablename__ = "customer_adjustments"
    id: str = Field(primary_key=True, index=True)
    customer_id: str = Field(foreign_key="customers.id", index=True)
    amount_money: float = 0
    count_12kg: int = 0
    count_48kg: int = 0
    reason: str = Field(default="onboarding") 
    # Logic: if True, this is legacy debt/stock and doesn't affect the truck
    is_inventory_neutral: bool = Field(default=True) 
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Customer(SQLModel, table=True):
  __tablename__ = "customers"

  id: str = Field(primary_key=True, index=True)
  name: str
  phone: Optional[str] = Field(default=None, nullable=True)
  notes: Optional[str] = None
  customer_type: str = Field(default="other", index=True)
  money_balance: float = 0
  total_cylinders_delivered_lifetime: int = 0
  order_count: int = 0
  cylinder_balance_12kg: int = 0
  cylinder_balance_48kg: int = 0
  created_at: datetime = Field(default_factory=datetime.utcnow)
  updated_at: Optional[datetime] = Field(default=None, nullable=True)
  created_by: Optional[str] = Field(default=None, nullable=True)
  updated_by: Optional[str] = Field(default=None, nullable=True)
  is_deleted: bool = Field(default=False, index=True)
  deleted_at: Optional[datetime] = Field(default=None, nullable=True)
  deletion_reason: Optional[str] = Field(default=None, nullable=True)


class System(SQLModel, table=True):
  __tablename__ = "systems"

  id: str = Field(primary_key=True, index=True)
  customer_id: str = Field(foreign_key="customers.id", index=True)
  name: str
  location: Optional[str] = None
  system_type: str = Field(default="other", index=True)
  gas_type: Optional[str] = Field(default="12kg", index=True)
  system_customer_type: Optional[str] = Field(default="private", index=True)
  is_deleted: bool = Field(default=False, index=True)
  deleted_at: Optional[datetime] = Field(default=None, nullable=True)
  deletion_reason: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(default_factory=datetime.utcnow)
  updated_at: Optional[datetime] = Field(default=None, nullable=True)
  created_by: Optional[str] = Field(default=None, nullable=True)
  updated_by: Optional[str] = Field(default=None, nullable=True)

  is_active: bool = Field(default=True, index=True)
  require_security_check: bool = Field(default=False, index=True)
  security_check_exists: bool = Field(default=False, index=True)
  security_check_date: Optional[datetime] = Field(default=None, nullable=True, index=True)


class Order(SQLModel, table=True):
  __tablename__ = "orders"

  id: str = Field(primary_key=True, index=True)
  customer_id: str = Field(foreign_key="customers.id", index=True)
  system_id: str = Field(foreign_key="systems.id", index=True)
  price_setting_id: Optional[str] = Field(default=None, foreign_key="price_settings.id", index=True)
  unit_price_sell: Optional[float] = Field(default=None)
  unit_price_buy: Optional[float] = Field(default=None)
  delivered_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  gas_type: str = Field(default="12kg", index=True)
  cylinders_installed: int
  cylinders_received: int
  price_total: float
  paid_amount: float
  note: Optional[str] = None
  client_request_id: Optional[str] = Field(
    default=None,
    sa_column=sa.Column(sa.String, unique=True, nullable=True),
  )
  created_at: datetime = Field(default_factory=datetime.utcnow)
  updated_at: Optional[datetime] = Field(default=None, nullable=True)
  created_by: Optional[str] = Field(default=None, nullable=True)
  updated_by: Optional[str] = Field(default=None, nullable=True)
  is_deleted: bool = Field(default=False, index=True)
  deleted_at: Optional[datetime] = Field(default=None, nullable=True)
  deletion_reason: Optional[str] = Field(default=None, nullable=True)


class PriceSetting(SQLModel, table=True):
  __tablename__ = "price_settings"

  id: str = Field(primary_key=True, index=True)
  gas_type: str = Field(index=True)
  customer_type: str = Field(index=True)
  selling_price: float
  buying_price: Optional[float] = None
  effective_from: datetime = Field(default_factory=datetime.utcnow, index=True)
  created_at: datetime = Field(default_factory=datetime.utcnow)
  created_by: Optional[str] = Field(default=None, nullable=True)


class Activity(SQLModel, table=True):
  __tablename__ = "activities"

  id: str = Field(primary_key=True, index=True)
  entity_type: str = Field(index=True)
  entity_id: Optional[str] = Field(default=None, index=True)
  action: str = Field(index=True)
  description: str
  metadata_: Optional[str] = Field(
    default=None,
    alias="metadata",
    sa_column=sa.Column("metadata", sa.Text(), nullable=True),
  )
  created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  created_by: Optional[str] = Field(default=None, nullable=True)


class Expense(SQLModel, table=True):
  __tablename__ = "expenses"
  __table_args__ = (sa.UniqueConstraint("date", "expense_type", name="uq_expense_date_type"),)

  id: str = Field(primary_key=True, index=True)
  date: str = Field(index=True)
  expense_type: str = Field(index=True)
  amount: float
  note: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(default_factory=datetime.utcnow)
  created_by: Optional[str] = Field(default=None, nullable=True)


class InventoryVersion(SQLModel, table=True):
  __tablename__ = "inventory_versions"

  id: str = Field(default_factory=lambda: f"inv_{uuid4()}", primary_key=True, index=True)
  gas_type: str = Field(index=True)
  full_count: int = 0
  empty_count: int = 0
  reason: Optional[str] = Field(default=None, nullable=True)
  event_type: Optional[str] = Field(default=None, index=True, nullable=True)
  event_id: Optional[str] = Field(default=None, index=True, nullable=True)
  effective_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  created_by: Optional[str] = Field(default=None, nullable=True, index=True)


class InventoryDelta(SQLModel, table=True):
  __tablename__ = "inventory_deltas"

  id: str = Field(default_factory=lambda: f"invd_{uuid4()}", primary_key=True, index=True)
  gas_type: str = Field(index=True)
  delta_full: int = 0
  delta_empty: int = 0
  effective_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  source_type: str = Field(index=True)
  source_id: Optional[str] = Field(default=None, index=True, nullable=True)
  reason: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  created_by: Optional[str] = Field(default=None, nullable=True, index=True)


class InventoryDailySummary(SQLModel, table=True):
  __tablename__ = "inventory_daily_summary"

  business_date: date = Field(sa_column=sa.Column(sa.Date, primary_key=True))
  gas_type: str = Field(primary_key=True, index=True)
  day_start_full: int = 0
  day_start_empty: int = 0
  day_delta_full: int = 0
  day_delta_empty: int = 0
  day_end_full: int = 0
  day_end_empty: int = 0
  computed_at: datetime = Field(default_factory=datetime.utcnow)


class RefillEvent(SQLModel, table=True):
  __tablename__ = "refill_events"

  id: str = Field(primary_key=True, index=True)
  business_date: date = Field(sa_column=sa.Column(sa.Date, index=True))
  effective_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  unit_price_buy_12: Optional[float] = Field(default=None)
  unit_price_buy_48: Optional[float] = Field(default=None)
  total_cost: float = 0
  paid_now: float = 0
  reason: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  created_by: Optional[str] = Field(default=None, nullable=True, index=True)


class CompanyDelta(SQLModel, table=True):
  __tablename__ = "company_deltas"

  id: str = Field(default_factory=lambda: f"compd_{uuid4()}", primary_key=True, index=True)
  effective_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  source_type: str = Field(index=True)
  source_id: Optional[str] = Field(default=None, index=True, nullable=True)
  delta_payable: float
  reason: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  created_by: Optional[str] = Field(default=None, nullable=True, index=True)


class CompanyDailySummary(SQLModel, table=True):
  __tablename__ = "company_daily_summary"

  business_date: date = Field(sa_column=sa.Column(sa.Date, primary_key=True))
  payable_start: float = 0
  payable_delta: float = 0
  payable_end: float = 0
  computed_at: datetime = Field(default_factory=datetime.utcnow)


class CashDelta(SQLModel, table=True):
  __tablename__ = "cash_deltas"

  id: str = Field(default_factory=lambda: f"cashd_{uuid4()}", primary_key=True, index=True)
  effective_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  source_type: str = Field(index=True)
  source_id: Optional[str] = Field(default=None, index=True, nullable=True)
  delta_cash: float
  reason: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
  created_by: Optional[str] = Field(default=None, nullable=True, index=True)


class CashDailySummary(SQLModel, table=True):
  __tablename__ = "cash_daily_summary"

  business_date: date = Field(sa_column=sa.Column(sa.Date, primary_key=True))
  cash_start: float = 0
  cash_delta: float = 0
  cash_end: float = 0
  computed_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryRecalcQueue(SQLModel, table=True):
  __tablename__ = "inventory_recalc_queue"

  id: str = Field(default_factory=lambda: f"invq_{uuid4()}", primary_key=True, index=True)
  gas_type: str = Field(index=True)
  start_business_date: date = Field(sa_column=sa.Column(sa.Date, index=True))
  status: str = Field(default="pending", index=True)
  created_at: datetime = Field(default_factory=datetime.utcnow)
  updated_at: datetime = Field(default_factory=datetime.utcnow)
  last_error: Optional[str] = Field(default=None, nullable=True)
