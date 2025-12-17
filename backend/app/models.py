from datetime import datetime
from uuid import uuid4
from typing import Optional

import sqlalchemy as sa

from sqlmodel import Field, SQLModel


class Customer(SQLModel, table=True):
  __tablename__ = "customers"

  id: str = Field(primary_key=True, index=True)
  name: str
  phone: str
  notes: Optional[str] = None
  customer_type: str = Field(default="other", index=True)
  money_balance: float = 0
  number_of_orders: int = 0
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
  security_required: bool = Field(default=False)
  last_security_check_at: Optional[datetime] = Field(default=None, nullable=True)
  next_security_due_at: Optional[datetime] = Field(default=None, nullable=True)
  security_status: Optional[str] = Field(default=None, nullable=True)
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
