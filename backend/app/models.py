from datetime import date, datetime, timezone
from typing import Optional
from uuid import uuid4

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.constants import DEFAULT_CURRENCY_CODE

def _utcnow() -> datetime:
  return datetime.now(timezone.utc)


def _uuid() -> str:
  return str(uuid4())


class User(SQLModel, table=True):
  __tablename__ = "users"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: Optional[str] = Field(default=None, foreign_key="tenants.id", nullable=True, index=True)
  phone: Optional[str] = Field(default=None, nullable=True, index=True)
  password_hash: Optional[str] = Field(default=None, nullable=True)
  is_active: bool = Field(default=False)
  must_change_password: bool = Field(default=False)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )


class Tenant(SQLModel, table=True):
  __tablename__ = "tenants"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  name: str
  status: str = Field(default="active", index=True)  # "active" | "suspended" | "disabled"
  owner_user_id: Optional[str] = Field(
    default=None,
    sa_column=sa.Column(
      sa.String(),
      sa.ForeignKey("users.id", name="fk_tenants_owner_user_id", use_alter=True),
      nullable=True,
    ),
  )
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  business_name: Optional[str] = Field(default=None, nullable=True)
  owner_name: Optional[str] = Field(default=None, nullable=True)
  phone: Optional[str] = Field(default=None, nullable=True)
  address: Optional[str] = Field(default=None, nullable=True)


class Session(SQLModel, table=True):
  __tablename__ = "sessions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  user_id: str = Field(foreign_key="users.id", index=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  expires_at: datetime = Field(
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  revoked_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  user_agent: Optional[str] = Field(default=None, nullable=True)


class ActivationChallenge(SQLModel, table=True):
  __tablename__ = "activation_challenges"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  user_id: str = Field(foreign_key="users.id", index=True)
  code_hash: str
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  expires_at: datetime = Field(
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  used_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )


class Plan(SQLModel, table=True):
  __tablename__ = "plans"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  name: str = Field(index=True)
  description: Optional[str] = Field(default=None, nullable=True)
  is_active: bool = Field(default=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )


class PlanEntitlement(SQLModel, table=True):
  __tablename__ = "plan_entitlements"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  plan_id: str = Field(foreign_key="plans.id", index=True)
  key: str = Field(index=True)
  value: str
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )


class TenantPlanSubscription(SQLModel, table=True):
  __tablename__ = "tenant_plan_subscriptions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  plan_id: str = Field(foreign_key="plans.id", index=True)
  status: str = Field(default="active", index=True)
  started_at: datetime = Field(
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  current_period_start: Optional[date] = Field(
    default=None,
    sa_column=sa.Column(sa.Date, nullable=True),
  )
  current_period_end: Optional[date] = Field(
    default=None,
    sa_column=sa.Column(sa.Date, nullable=True),
  )
  grace_period_end: Optional[date] = Field(
    default=None,
    sa_column=sa.Column(sa.Date, nullable=True),
  )
  cancelled_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )


class TenantPlanOverride(SQLModel, table=True):
  __tablename__ = "tenant_plan_overrides"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  key: str = Field(index=True)
  value: str
  note: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)


class BillingEvent(SQLModel, table=True):
  __tablename__ = "billing_events"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  kind: str = Field(index=True)
  amount: int
  note: Optional[str] = Field(default=None, nullable=True)
  effective_at: datetime = Field(
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, index=True),
  )
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)


class Role(SQLModel, table=True):
  __tablename__ = "roles"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  name: str = Field(index=True)
  is_system: bool = Field(default=False)
  description: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )


class Permission(SQLModel, table=True):
  __tablename__ = "permissions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  code: str = Field(index=True, unique=True)
  description: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )


class RolePermission(SQLModel, table=True):
  __tablename__ = "role_permissions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  role_id: str = Field(foreign_key="roles.id", index=True)
  permission_code: str = Field(index=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )


class TenantMembership(SQLModel, table=True):
  __tablename__ = "tenant_memberships"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  user_id: str = Field(foreign_key="users.id", index=True)
  role_id: str = Field(foreign_key="roles.id", index=True)
  is_active: bool = Field(default=True, index=True)
  joined_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  revoked_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )


class Invite(SQLModel, table=True):
  __tablename__ = "invites"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  phone: str = Field(index=True)
  role_id: str = Field(foreign_key="roles.id", index=True)
  code_hash: str
  status: str = Field(default="pending", index=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  expires_at: datetime = Field(
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  accepted_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  created_by: Optional[str] = Field(default=None, foreign_key="users.id", nullable=True)


class Customer(SQLModel, table=True):
  __tablename__ = "customers"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  name: str
  phone: Optional[str] = Field(default=None, nullable=True)
  address: Optional[str] = Field(default=None, nullable=True)
  note: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  updated_by: Optional[str] = Field(default=None, nullable=True)


class System(SQLModel, table=True):
  __tablename__ = "systems"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  customer_id: str = Field(foreign_key="customers.id", index=True)
  name: str
  gas_type: str = Field(index=True)
  note: Optional[str] = Field(default=None, nullable=True)
  requires_security_check: bool = Field(default=False, index=True)
  security_check_exists: bool = Field(default=False, index=True)
  last_security_check_at: Optional[date] = Field(
    default=None,
    sa_column=sa.Column(sa.Date, nullable=True),
  )
  next_security_check_at: Optional[date] = Field(
    default=None,
    sa_column=sa.Column(sa.Date, nullable=True, index=True),
  )
  is_active: bool = Field(default=True, index=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  updated_by: Optional[str] = Field(default=None, nullable=True)


class SystemTypeOption(SQLModel, table=True):
  __tablename__ = "system_type_options"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  name: str = Field(sa_column=sa.Column(sa.String, unique=True))
  is_active: bool = Field(default=True, index=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )


class PriceCatalog(SQLModel, table=True):
  __tablename__ = "price_catalog"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  effective_from: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), index=True),
  )
  gas_type: str = Field(index=True)
  sell_price: int
  buy_price: int
  sell_iron_price: int = Field(default=0)
  buy_iron_price: int = Field(default=0)
  company_iron_price: int = Field(default=0)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )


class ExpenseCategory(SQLModel, table=True):
  __tablename__ = "expense_categories"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  name: str = Field(sa_column=sa.Column(sa.String, unique=True))
  is_active: bool = Field(default=True, index=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )


class Expense(SQLModel, table=True):
  __tablename__ = "expenses"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  group_id: Optional[str] = Field(default=None, index=True)
  request_id: Optional[str] = Field(
    default=None,
    sa_column=sa.Column(sa.String, unique=True, nullable=True),
  )
  # `happened_at` is the business/event time used for timeline/report ordering.
  # Hidden microseconds may be auto-assigned by allocate_happened_at(...) when
  # several events share the same visible second.
  happened_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), index=True),
  )
  # `created_at` is the audit insertion timestamp. It should not be treated as
  # the primary business-time sort key for activity feeds.
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  updated_by: Optional[str] = Field(default=None, nullable=True)
  day: date = Field(sa_column=sa.Column(sa.Date, index=True))
  kind: str = Field(index=True)  # "expense" | "deposit"
  category_id: Optional[str] = Field(default=None, foreign_key="expense_categories.id")
  amount: int
  paid_from: Optional[str] = Field(default=None)  # "cash" | "bank" for expenses
  note: Optional[str] = Field(default=None, nullable=True)
  vendor: Optional[str] = Field(default=None, nullable=True)
  deleted_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True, index=True),
  )
  deleted_by: Optional[str] = Field(default=None, nullable=True)
  reversal_source_id: Optional[str] = Field(default=None, nullable=True, index=True)
  reversed_id: Optional[str] = Field(default=None, nullable=True, index=True)
  is_reversed: bool = Field(default=False, index=True)


class CustomerTransaction(SQLModel, table=True):
  __tablename__ = "customer_transactions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  group_id: Optional[str] = Field(default=None, index=True)
  request_id: Optional[str] = Field(
    default=None,
    sa_column=sa.Column(sa.String, unique=True, nullable=True),
  )
  # Business/event time chosen by the user. Daily reporting sorts primarily by
  # this field, not by created_at.
  happened_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), index=True),
  )
  # Audit timestamp for row creation. Useful for debugging and fallback tie
  # breaks, but not the intended source of truth for business ordering.
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  updated_by: Optional[str] = Field(default=None, nullable=True)
  day: date = Field(sa_column=sa.Column(sa.Date, index=True))
  kind: str = Field(index=True)  # "order" | "payment" | "return" | "adjust"
  mode: Optional[str] = Field(default=None, index=True)  # order mode
  customer_id: str = Field(foreign_key="customers.id", index=True)
  system_id: Optional[str] = Field(default=None, foreign_key="systems.id", index=True)
  gas_type: Optional[str] = Field(default=None, index=True)
  installed: int = Field(default=0)
  received: int = Field(default=0)
  total: int = Field(default=0)
  paid: int = Field(default=0)
  debt_cash: int = Field(default=0)
  debt_cylinders_12: int = Field(default=0)
  debt_cylinders_48: int = Field(default=0)
  note: Optional[str] = Field(default=None, nullable=True)
  deleted_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True, index=True),
  )
  deleted_by: Optional[str] = Field(default=None, nullable=True)
  reversal_source_id: Optional[str] = Field(default=None, nullable=True, index=True)
  reversed_id: Optional[str] = Field(default=None, nullable=True, index=True)
  is_reversed: bool = Field(default=False, index=True)


class CompanyTransaction(SQLModel, table=True):
  __tablename__ = "company_transactions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  group_id: Optional[str] = Field(default=None, index=True)
  request_id: Optional[str] = Field(
    default=None,
    sa_column=sa.Column(sa.String, unique=True, nullable=True),
  )
  # Business/event time chosen by the user. Hidden microseconds may be
  # allocated automatically so same-second company activities keep a stable
  # order in reports.
  happened_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), index=True),
  )
  # Audit insertion timestamp only.
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  updated_by: Optional[str] = Field(default=None, nullable=True)
  day: date = Field(sa_column=sa.Column(sa.Date, index=True))
  kind: str = Field(default="refill", index=True)  # "refill" | "buy_iron" | "payment"
  buy12: int = Field(default=0)
  return12: int = Field(default=0)
  buy48: int = Field(default=0)
  return48: int = Field(default=0)
  new12: int = Field(default=0)
  new48: int = Field(default=0)
  total: int = Field(default=0)
  paid: int = Field(default=0)
  debt_cash: int = Field(default=0)
  debt_cylinders_12: int = Field(default=0)
  debt_cylinders_48: int = Field(default=0)
  note: Optional[str] = Field(default=None, nullable=True)
  deleted_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True, index=True),
  )
  deleted_by: Optional[str] = Field(default=None, nullable=True)
  reversal_source_id: Optional[str] = Field(default=None, nullable=True, index=True)
  reversed_id: Optional[str] = Field(default=None, nullable=True, index=True)
  is_reversed: bool = Field(default=False, index=True)


class InventoryAdjustment(SQLModel, table=True):
  __tablename__ = "inventory_adjustments"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  group_id: Optional[str] = Field(default=None, index=True)
  request_id: Optional[str] = Field(
    default=None,
    sa_column=sa.Column(sa.String, unique=True, nullable=True),
  )
  # Business/event time for inventory changes.
  happened_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), index=True),
  )
  # Audit insertion timestamp only.
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  updated_by: Optional[str] = Field(default=None, nullable=True)
  day: date = Field(sa_column=sa.Column(sa.Date, index=True))
  gas_type: str = Field(index=True)
  delta_full: int = 0
  delta_empty: int = 0
  note: Optional[str] = Field(default=None, nullable=True)
  deleted_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True, index=True),
  )
  deleted_by: Optional[str] = Field(default=None, nullable=True)
  reversal_source_id: Optional[str] = Field(default=None, nullable=True, index=True)
  reversed_id: Optional[str] = Field(default=None, nullable=True, index=True)
  is_reversed: bool = Field(default=False, index=True)


class LedgerEntry(SQLModel, table=True):
  __tablename__ = "ledger_entries"
  __table_args__ = (
    sa.UniqueConstraint(
      "source_type",
      "source_id",
      "account",
      "gas_type",
      "state",
      "unit",
      name="uq_ledger_source_account",
    ),
  )

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  # Mirrors the source event's business/event time.
  happened_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), index=True),
  )
  # Audit timestamp for the ledger row itself.
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, index=True),
  )
  day: date = Field(sa_column=sa.Column(sa.Date, index=True))
  source_type: str = Field(index=True)
  source_id: str = Field(index=True)
  customer_id: Optional[str] = Field(default=None, foreign_key="customers.id", index=True)
  account: str = Field(index=True)
  gas_type: Optional[str] = Field(default=None, index=True)
  state: Optional[str] = Field(default=None, index=True)
  unit: str = Field(index=True)
  amount: int
  note: Optional[str] = Field(default=None, nullable=True)


class CashAdjustment(SQLModel, table=True):
  __tablename__ = "cash_adjustments"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  group_id: Optional[str] = Field(default=None, index=True)
  request_id: Optional[str] = Field(
    default=None,
    sa_column=sa.Column(sa.String, unique=True, nullable=True),
  )
  # Business/event time for the wallet adjustment.
  happened_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), index=True),
  )
  # Audit insertion timestamp only.
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  updated_by: Optional[str] = Field(default=None, nullable=True)
  day: date = Field(sa_column=sa.Column(sa.Date, index=True))
  delta_cash: int
  note: Optional[str] = Field(default=None, nullable=True)
  deleted_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True, index=True),
  )
  deleted_by: Optional[str] = Field(default=None, nullable=True)
  reversal_source_id: Optional[str] = Field(default=None, nullable=True, index=True)
  reversed_id: Optional[str] = Field(default=None, nullable=True, index=True)
  is_reversed: bool = Field(default=False, index=True)


class SystemSettings(SQLModel, table=True):
  __tablename__ = "system_settings"

  id: str = Field(default="system", primary_key=True)
  is_setup_completed: bool = Field(default=False)
  currency_code: str = Field(default=DEFAULT_CURRENCY_CODE)
  money_decimals: int = Field(default=2)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )

