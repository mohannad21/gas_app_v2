"""add inventory ledger tables

Revision ID: 0008_add_inventory_ledger
Revises: 0007_make_customer_phone_nullable
Create Date: 2025-12-21
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0008_add_inventory_ledger"
down_revision = "0007_make_customer_phone_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_table(
    "inventory_deltas",
    sa.Column("id", sa.String(), primary_key=True, nullable=False),
    sa.Column("gas_type", sa.String(), nullable=False),
    sa.Column("delta_full", sa.Integer(), nullable=False),
    sa.Column("delta_empty", sa.Integer(), nullable=False),
    sa.Column("effective_at", sa.DateTime(), nullable=False),
    sa.Column("source_type", sa.String(), nullable=False),
    sa.Column("source_id", sa.String(), nullable=True),
    sa.Column("reason", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("created_by", sa.String(), nullable=True),
  )
  op.create_index(
    "ix_inventory_deltas_gas_effective_created_id",
    "inventory_deltas",
    ["gas_type", "effective_at", "created_at", "id"],
  )
  op.create_index(
    "ix_inventory_deltas_source_lookup",
    "inventory_deltas",
    ["source_type", "source_id", "gas_type"],
  )
  op.create_index(
    "uq_inventory_deltas_source",
    "inventory_deltas",
    ["source_type", "source_id", "gas_type"],
    unique=True,
    postgresql_where=sa.text(
      "source_id IS NOT NULL AND source_type IN ('order','refill','adjust','init')"
    ),
    sqlite_where=sa.text(
      "source_id IS NOT NULL AND source_type IN ('order','refill','adjust','init')"
    ),
  )

  op.create_table(
    "inventory_daily_summary",
    sa.Column("business_date", sa.Date(), primary_key=True, nullable=False),
    sa.Column("gas_type", sa.String(), primary_key=True, nullable=False),
    sa.Column("day_start_full", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("day_start_empty", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("day_delta_full", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("day_delta_empty", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("day_end_full", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("day_end_empty", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("computed_at", sa.DateTime(), nullable=False),
  )
  op.create_index(
    "ix_inventory_daily_summary_gas_date",
    "inventory_daily_summary",
    ["gas_type", "business_date"],
  )

  op.create_table(
    "inventory_recalc_queue",
    sa.Column("id", sa.String(), primary_key=True, nullable=False),
    sa.Column("gas_type", sa.String(), nullable=False),
    sa.Column("start_business_date", sa.Date(), nullable=False),
    sa.Column("status", sa.String(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("last_error", sa.String(), nullable=True),
  )
  op.create_index(
    "ix_inventory_recalc_queue_gas_status",
    "inventory_recalc_queue",
    ["gas_type", "status"],
  )
  op.create_index(
    "uq_inventory_recalc_queue_pending",
    "inventory_recalc_queue",
    ["gas_type"],
    unique=True,
    postgresql_where=sa.text("status = 'pending'"),
    sqlite_where=sa.text("status = 'pending'"),
  )


def downgrade() -> None:
  op.drop_index("uq_inventory_recalc_queue_pending", table_name="inventory_recalc_queue")
  op.drop_index("ix_inventory_recalc_queue_gas_status", table_name="inventory_recalc_queue")
  op.drop_table("inventory_recalc_queue")

  op.drop_index("ix_inventory_daily_summary_gas_date", table_name="inventory_daily_summary")
  op.drop_table("inventory_daily_summary")

  op.drop_index("uq_inventory_deltas_source", table_name="inventory_deltas")
  op.drop_index("ix_inventory_deltas_source_lookup", table_name="inventory_deltas")
  op.drop_index("ix_inventory_deltas_gas_effective_created_id", table_name="inventory_deltas")
  op.drop_table("inventory_deltas")
