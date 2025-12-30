"""add company payable ledger tables

Revision ID: 0011_add_company_ledger
Revises: 0010_add_refill_events
Create Date: 2025-12-27
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0011_add_company_ledger"
down_revision = "0010_add_refill_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_table(
    "company_deltas",
    sa.Column("id", sa.String(), primary_key=True, nullable=False),
    sa.Column("effective_at", sa.DateTime(), nullable=False),
    sa.Column("source_type", sa.String(), nullable=False),
    sa.Column("source_id", sa.String(), nullable=True),
    sa.Column("delta_payable", sa.Float(), nullable=False),
    sa.Column("reason", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("created_by", sa.String(), nullable=True),
  )
  op.create_index(
    "ix_company_deltas_effective_created_id",
    "company_deltas",
    ["effective_at", "created_at", "id"],
  )
  op.create_index(
    "ix_company_deltas_source_lookup",
    "company_deltas",
    ["source_type", "source_id"],
  )

  op.create_table(
    "company_daily_summary",
    sa.Column("business_date", sa.Date(), primary_key=True, nullable=False),
    sa.Column("payable_start", sa.Float(), nullable=False, server_default="0"),
    sa.Column("payable_delta", sa.Float(), nullable=False, server_default="0"),
    sa.Column("payable_end", sa.Float(), nullable=False, server_default="0"),
    sa.Column("computed_at", sa.DateTime(), nullable=False),
  )
  op.create_index(
    "ix_company_daily_summary_date",
    "company_daily_summary",
    ["business_date"],
  )


def downgrade() -> None:
  op.drop_index("ix_company_daily_summary_date", table_name="company_daily_summary")
  op.drop_table("company_daily_summary")

  op.drop_index("ix_company_deltas_source_lookup", table_name="company_deltas")
  op.drop_index("ix_company_deltas_effective_created_id", table_name="company_deltas")
  op.drop_table("company_deltas")
