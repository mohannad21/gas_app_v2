"""v2 ledger schema

Revision ID: 0001_new_ledger_schema
Revises:
Create Date: 2026-01-30
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001_new_ledger_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
  conn = op.get_bind()
  dialect = conn.dialect.name
  cascade = " CASCADE" if dialect == "postgresql" else ""

  tables_to_drop = [
    "activities",
    "cash_daily_summary",
    "cash_deltas",
    "collection_events",
    "company_cylinder_payment_events",
    "company_daily_summary",
    "company_deltas",
    "company_payments",
    "customer_adjustments",
    "expenses",
    "inventory_daily_summary",
    "inventory_deltas",
    "inventory_recalc_queue",
    "inventory_versions",
    "orders",
    "price_settings",
    "refill_events",
    "system_settings",
    "systems",
    "customers",
    "company_transactions",
    "customer_transactions",
    "price_catalog",
    "expense_categories",
    "inventory_adjustments",
    "ledger_entries",
  ]
  for table in tables_to_drop:
    op.execute(f"DROP TABLE IF EXISTS {table}{cascade}")

  op.create_table(
    "customers",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("name", sa.Text(), nullable=False),
    sa.Column("phone", sa.Text(), nullable=True),
    sa.Column("address", sa.Text(), nullable=True),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
  )
  op.create_index("ix_customers_id", "customers", ["id"], unique=False)

  op.create_table(
    "systems",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("customer_id", sa.String(), sa.ForeignKey("customers.id"), nullable=False),
    sa.Column("name", sa.Text(), nullable=False),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
  )
  op.create_index("ix_systems_id", "systems", ["id"], unique=False)
  op.create_index("ix_systems_customer_id", "systems", ["customer_id"], unique=False)
  op.create_index("ix_systems_is_active", "systems", ["is_active"], unique=False)

  op.create_table(
    "price_catalog",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
    sa.Column("gas_type", sa.Text(), nullable=False),
    sa.Column("sell_price", sa.Integer(), nullable=False),
    sa.Column("buy_price", sa.Integer(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
  )
  op.create_index("ix_price_catalog_id", "price_catalog", ["id"], unique=False)
  op.create_index("ix_price_catalog_effective_from", "price_catalog", ["effective_from"], unique=False)
  op.create_index("ix_price_catalog_gas_type", "price_catalog", ["gas_type"], unique=False)

  op.create_table(
    "expense_categories",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("name", sa.Text(), nullable=False, unique=True),
    sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
  )
  op.create_index("ix_expense_categories_id", "expense_categories", ["id"], unique=False)
  op.create_index("ix_expense_categories_is_active", "expense_categories", ["is_active"], unique=False)

  op.create_table(
    "expenses",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("request_id", sa.String(), nullable=True, unique=True),
    sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("day", sa.Date(), nullable=False),
    sa.Column("kind", sa.Text(), nullable=False),
    sa.Column("category_id", sa.String(), sa.ForeignKey("expense_categories.id"), nullable=True),
    sa.Column("amount", sa.Integer(), nullable=False),
    sa.Column("paid_from", sa.Text(), nullable=True),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("vendor", sa.Text(), nullable=True),
    sa.Column("reversed_id", sa.String(), nullable=True),
    sa.Column("is_reversed", sa.Boolean(), nullable=False, server_default=sa.false()),
  )
  op.create_index("ix_expenses_id", "expenses", ["id"], unique=False)
  op.create_index("ix_expenses_happened_at", "expenses", ["happened_at"], unique=False)
  op.create_index("ix_expenses_day", "expenses", ["day"], unique=False)
  op.create_index("ix_expenses_kind", "expenses", ["kind"], unique=False)
  op.create_index("ix_expenses_is_reversed", "expenses", ["is_reversed"], unique=False)

  op.create_table(
    "customer_transactions",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("group_id", sa.String(), nullable=True),
    sa.Column("request_id", sa.String(), nullable=True, unique=True),
    sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("day", sa.Date(), nullable=False),
    sa.Column("kind", sa.Text(), nullable=False),
    sa.Column("mode", sa.Text(), nullable=True),
    sa.Column("customer_id", sa.String(), sa.ForeignKey("customers.id"), nullable=False),
    sa.Column("system_id", sa.String(), sa.ForeignKey("systems.id"), nullable=True),
    sa.Column("gas_type", sa.Text(), nullable=True),
    sa.Column("installed", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("received", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("paid", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("reversed_id", sa.String(), nullable=True),
    sa.Column("is_reversed", sa.Boolean(), nullable=False, server_default=sa.false()),
  )
  op.create_index("ix_customer_transactions_id", "customer_transactions", ["id"], unique=False)
  op.create_index("ix_customer_transactions_group_id", "customer_transactions", ["group_id"], unique=False)
  op.create_index("ix_customer_transactions_request_id", "customer_transactions", ["request_id"], unique=False)
  op.create_index("ix_customer_transactions_happened_at", "customer_transactions", ["happened_at"], unique=False)
  op.create_index("ix_customer_transactions_day", "customer_transactions", ["day"], unique=False)
  op.create_index("ix_customer_transactions_kind", "customer_transactions", ["kind"], unique=False)
  op.create_index("ix_customer_transactions_mode", "customer_transactions", ["mode"], unique=False)
  op.create_index("ix_customer_transactions_customer_id", "customer_transactions", ["customer_id"], unique=False)
  op.create_index("ix_customer_transactions_system_id", "customer_transactions", ["system_id"], unique=False)
  op.create_index("ix_customer_transactions_gas_type", "customer_transactions", ["gas_type"], unique=False)
  op.create_index("ix_customer_transactions_is_reversed", "customer_transactions", ["is_reversed"], unique=False)

  op.create_table(
    "company_transactions",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("request_id", sa.String(), nullable=True, unique=True),
    sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("day", sa.Date(), nullable=False),
    sa.Column("buy12", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("return12", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("buy48", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("return48", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("new12", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("new48", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("paid", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("reversed_id", sa.String(), nullable=True),
    sa.Column("is_reversed", sa.Boolean(), nullable=False, server_default=sa.false()),
  )
  op.create_index("ix_company_transactions_id", "company_transactions", ["id"], unique=False)
  op.create_index("ix_company_transactions_request_id", "company_transactions", ["request_id"], unique=False)
  op.create_index("ix_company_transactions_happened_at", "company_transactions", ["happened_at"], unique=False)
  op.create_index("ix_company_transactions_day", "company_transactions", ["day"], unique=False)
  op.create_index("ix_company_transactions_is_reversed", "company_transactions", ["is_reversed"], unique=False)

  op.create_table(
    "inventory_adjustments",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("request_id", sa.String(), nullable=True, unique=True),
    sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("day", sa.Date(), nullable=False),
    sa.Column("gas_type", sa.Text(), nullable=False),
    sa.Column("delta_full", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("delta_empty", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("reversed_id", sa.String(), nullable=True),
    sa.Column("is_reversed", sa.Boolean(), nullable=False, server_default=sa.false()),
  )
  op.create_index("ix_inventory_adjustments_id", "inventory_adjustments", ["id"], unique=False)
  op.create_index("ix_inventory_adjustments_request_id", "inventory_adjustments", ["request_id"], unique=False)
  op.create_index("ix_inventory_adjustments_happened_at", "inventory_adjustments", ["happened_at"], unique=False)
  op.create_index("ix_inventory_adjustments_day", "inventory_adjustments", ["day"], unique=False)
  op.create_index("ix_inventory_adjustments_gas_type", "inventory_adjustments", ["gas_type"], unique=False)
  op.create_index("ix_inventory_adjustments_is_reversed", "inventory_adjustments", ["is_reversed"], unique=False)

  op.create_table(
    "ledger_entries",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("day", sa.Date(), nullable=False),
    sa.Column("source_type", sa.Text(), nullable=False),
    sa.Column("source_id", sa.String(), nullable=False),
    sa.Column("customer_id", sa.String(), sa.ForeignKey("customers.id"), nullable=True),
    sa.Column("account", sa.Text(), nullable=False),
    sa.Column("gas_type", sa.Text(), nullable=True),
    sa.Column("state", sa.Text(), nullable=True),
    sa.Column("unit", sa.Text(), nullable=False),
    sa.Column("amount", sa.Integer(), nullable=False),
    sa.Column("note", sa.Text(), nullable=True),
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
  op.create_index("ix_ledger_entries_id", "ledger_entries", ["id"], unique=False)
  op.create_index("ix_ledger_entries_happened_at", "ledger_entries", ["happened_at"], unique=False)
  op.create_index("ix_ledger_entries_day", "ledger_entries", ["day"], unique=False)
  op.create_index("ix_ledger_entries_source_type", "ledger_entries", ["source_type"], unique=False)
  op.create_index("ix_ledger_entries_source_id", "ledger_entries", ["source_id"], unique=False)
  op.create_index("ix_ledger_entries_customer_id", "ledger_entries", ["customer_id"], unique=False)
  op.create_index("ix_ledger_entries_account", "ledger_entries", ["account"], unique=False)
  op.create_index("ix_ledger_entries_gas_type", "ledger_entries", ["gas_type"], unique=False)
  op.create_index("ix_ledger_entries_state", "ledger_entries", ["state"], unique=False)
  op.create_index("ix_ledger_entries_unit", "ledger_entries", ["unit"], unique=False)

  op.create_table(
    "system_settings",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("is_setup_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("currency_code", sa.Text(), nullable=False),
    sa.Column("money_decimals", sa.Integer(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
  )


def downgrade() -> None:
  raise NotImplementedError("Downgrade not supported for v2 schema.")
