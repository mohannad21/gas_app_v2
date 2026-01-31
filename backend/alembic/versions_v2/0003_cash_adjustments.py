"""add cash adjustments intent table

Revision ID: 0003_cash_adjustments
Revises: 0002_system_types_and_security
Create Date: 2026-01-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_cash_adjustments"
down_revision = "0002_system_types_and_security"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_table(
    "cash_adjustments",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("request_id", sa.String(), nullable=True, unique=True),
    sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("day", sa.Date(), nullable=False),
    sa.Column("delta_cash", sa.Integer(), nullable=False),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("reversed_id", sa.String(), nullable=True),
    sa.Column("is_reversed", sa.Boolean(), nullable=False, server_default=sa.false()),
  )
  op.create_index("ix_cash_adjustments_id", "cash_adjustments", ["id"], unique=False)
  op.create_index("ix_cash_adjustments_request_id", "cash_adjustments", ["request_id"], unique=False)
  op.create_index("ix_cash_adjustments_happened_at", "cash_adjustments", ["happened_at"], unique=False)
  op.create_index("ix_cash_adjustments_day", "cash_adjustments", ["day"], unique=False)
  op.create_index("ix_cash_adjustments_is_reversed", "cash_adjustments", ["is_reversed"], unique=False)
  op.create_index("ix_cash_adjustments_reversed_id", "cash_adjustments", ["reversed_id"], unique=False)


def downgrade() -> None:
  op.drop_index("ix_cash_adjustments_reversed_id", table_name="cash_adjustments")
  op.drop_index("ix_cash_adjustments_is_reversed", table_name="cash_adjustments")
  op.drop_index("ix_cash_adjustments_day", table_name="cash_adjustments")
  op.drop_index("ix_cash_adjustments_happened_at", table_name="cash_adjustments")
  op.drop_index("ix_cash_adjustments_request_id", table_name="cash_adjustments")
  op.drop_index("ix_cash_adjustments_id", table_name="cash_adjustments")
  op.drop_table("cash_adjustments")
