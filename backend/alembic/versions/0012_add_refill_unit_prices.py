"""add refill unit buy prices snapshot

Revision ID: 0012_add_refill_unit_prices
Revises: 0011_add_company_ledger
Create Date: 2025-12-27
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0012_add_refill_unit_prices"
down_revision = "0011_add_company_ledger"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column("refill_events", sa.Column("unit_price_buy_12", sa.Float(), nullable=True))
  op.add_column("refill_events", sa.Column("unit_price_buy_48", sa.Float(), nullable=True))


def downgrade() -> None:
  op.drop_column("refill_events", "unit_price_buy_48")
  op.drop_column("refill_events", "unit_price_buy_12")
