"""add refill events table

Revision ID: 0010_add_refill_events
Revises: 0009_add_cash_ledger
Create Date: 2025-12-27
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0010_add_refill_events"
down_revision = "0009_add_cash_ledger"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_table(
    "refill_events",
    sa.Column("id", sa.String(), primary_key=True, nullable=False),
    sa.Column("business_date", sa.Date(), nullable=False),
    sa.Column("effective_at", sa.DateTime(), nullable=False),
    sa.Column("total_cost", sa.Float(), nullable=False, server_default="0"),
    sa.Column("paid_now", sa.Float(), nullable=False, server_default="0"),
    sa.Column("reason", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("created_by", sa.String(), nullable=True),
  )
  op.create_index("ix_refill_events_business_date", "refill_events", ["business_date"])
  op.create_index("ix_refill_events_effective_at", "refill_events", ["effective_at"])


def downgrade() -> None:
  op.drop_index("ix_refill_events_effective_at", table_name="refill_events")
  op.drop_index("ix_refill_events_business_date", table_name="refill_events")
  op.drop_table("refill_events")
