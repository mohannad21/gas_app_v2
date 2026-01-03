"""add bilateral order fields

Revision ID: 0013_add_bilateral_order_fields
Revises: 0012_add_refill_unit_prices
Create Date: 2026-01-02
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0013_add_bilateral_order_fields"
down_revision = "0012_add_refill_unit_prices"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column("orders", sa.Column("money_received", sa.Float(), nullable=False, server_default="0"))
  op.add_column("orders", sa.Column("money_given", sa.Float(), nullable=False, server_default="0"))
  op.add_column("orders", sa.Column("applied_credit", sa.Float(), nullable=False, server_default="0"))
  op.add_column("orders", sa.Column("money_balance_before", sa.Float(), nullable=False, server_default="0"))
  op.add_column("orders", sa.Column("money_balance_after", sa.Float(), nullable=False, server_default="0"))
  op.add_column("orders", sa.Column("cyl_balance_before", sa.JSON(), nullable=True))
  op.add_column("orders", sa.Column("cyl_balance_after", sa.JSON(), nullable=True))


def downgrade() -> None:
  op.drop_column("orders", "cyl_balance_after")
  op.drop_column("orders", "cyl_balance_before")
  op.drop_column("orders", "money_balance_after")
  op.drop_column("orders", "money_balance_before")
  op.drop_column("orders", "applied_credit")
  op.drop_column("orders", "money_given")
  op.drop_column("orders", "money_received")
