"""add cash ledger tables

Revision ID: 0009_add_cash_ledger
Revises: 0008_add_inventory_ledger
Create Date: 2025-12-27
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0009_add_cash_ledger"
down_revision = "0008_add_inventory_ledger"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_table(
    "cash_deltas",
    sa.Column("id", sa.String(), primary_key=True, nullable=False),
    sa.Column("effective_at", sa.DateTime(), nullable=False),
    sa.Column("source_type", sa.String(), nullable=False),
    sa.Column("source_id", sa.String(), nullable=True),
    sa.Column("delta_cash", sa.Float(), nullable=False),
    sa.Column("reason", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("created_by", sa.String(), nullable=True),
  )
  op.create_index(
    "ix_cash_deltas_effective_created_id",
    "cash_deltas",
    ["effective_at", "created_at", "id"],
  )
  op.create_index(
    "ix_cash_deltas_source_lookup",
    "cash_deltas",
    ["source_type", "source_id"],
  )

  op.create_table(
    "cash_daily_summary",
    sa.Column("business_date", sa.Date(), primary_key=True, nullable=False),
    sa.Column("cash_start", sa.Float(), nullable=False, server_default="0"),
    sa.Column("cash_delta", sa.Float(), nullable=False, server_default="0"),
    sa.Column("cash_end", sa.Float(), nullable=False, server_default="0"),
    sa.Column("computed_at", sa.DateTime(), nullable=False),
  )
  op.create_index(
    "ix_cash_daily_summary_date",
    "cash_daily_summary",
    ["business_date"],
  )


def downgrade() -> None:
  op.drop_index("ix_cash_daily_summary_date", table_name="cash_daily_summary")
  op.drop_table("cash_daily_summary")

  op.drop_index("ix_cash_deltas_source_lookup", table_name="cash_deltas")
  op.drop_index("ix_cash_deltas_effective_created_id", table_name="cash_deltas")
  op.drop_table("cash_deltas")
